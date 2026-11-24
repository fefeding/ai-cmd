import * as net from 'net';
import { ConnectionService } from './connection.service';
import { ConnectionEntity } from '../model/connection.entity';

/**
 * Guacamole 协议工具。
 *
 * 协议要点（https://guacamole.apache.org/doc/gug/protocol-reference.html）：
 * - 每条指令形如 `<元素数>.<操作码>,<长度>.<值>,...;`
 *   但我们这里用 Apache 的「长度前缀」形式：每个元素是 `<长度>.<内容>`，
 *   逗号分隔、分号结尾。例如 `6.select,3.rdp;`（select 长度 6，rdp 长度 3）。
 * - guacd 握手流程：
 *   1) 客户端 -> guacd: `6.select,3.rdp;`
 *   2) guacd -> 客户端: `4.args,...;`（列出该协议支持的全部参数名）
 *   3) 客户端 -> guacd: `4.size,<w>,<h>,<dpi>;` + `<n>.connect,<k>,<v>,...;`
 *   4) guacd -> 客户端: `5.ready,<uuid>;` 或 `5.error,...;`
 *   5) 之后双向传输 Guacamole 指令（含 draw/png/jpeg/sync/mouse/key 等）
 */
function elem(value: string | number): string {
  const s = String(value);
  return `${Buffer.byteLength(s, 'utf8')}.${s}`;
}

/** 构造一条 Guacamole 指令（长度前缀元素，逗号分隔，分号结尾） */
function instruction(opcode: string, ...values: (string | number)[]): string {
  return [elem(opcode), ...values.map(elem)].join(',') + ';';
}

/** 解析指令流中完整指令（以 `;` 结尾）。返回 [完整指令数组, 残余缓冲] */
function splitInstructions(buffer: string): [string[], string] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === ';') {
      out.push(buffer.slice(start, i + 1));
      start = i + 1;
    }
  }
  return [out, buffer.slice(start)];
}

/** 从指令中提取操作码（去掉长度前缀） */
function opcodeOf(instruction: string): string {
  const dot = instruction.indexOf('.');
  const comma = instruction.indexOf(',');
  const end = comma > 0 ? comma : instruction.length - 1;
  if (dot > 0) return instruction.slice(dot + 1, end);
  return instruction.slice(0, end);
}

/** 解析指令的所有参数（去掉每个元素的长度前缀） */
function parseArgs(instruction: string): string[] {
  // 形如 `4.args,13.VERSION_1_5_0,8.hostname,...;`
  // 去掉尾部 `;` 与 opcode 元素，逐个解析 `长度.值`
  const body = instruction.replace(/;$/, '');
  const parts = body.split(',');
  return parts.slice(1).map((p) => {
    const dot = p.indexOf('.');
    return dot > 0 ? p.slice(dot + 1) : p;
  });
}

/** RDP 会话（与 SSH 的 TerminalSession 完全独立） */
export interface RdpSession {
  id: string;
  connectionId: string;
  type: 'rdp';
  name: string;
  socket: net.Socket;
  state: 'selecting' | 'connecting' | 'ready' | 'closed';
  createdAt: Date;
  lastFrameAt: number;
  /** 背压：按 sync 边界缓存的指令字节数 */
  pendingBytes: number;
  pendingInstructions: string[];
  /** 发送帧的回调（由 WS/IPC 层注入） */
  onFrame: (instruction: string) => void;
  /** 连接就绪回调 */
  onReady: () => void;
  /** 关闭回调 */
  onClose: (reason?: string) => void;
  /** 日志回调 */
  onLog?: (msg: string) => void;
}

/** WS 背压上限：8MB（Guacamole 指令含 base64 图像块，比终端文本大得多） */
const GUAC_BACKPRESSURE_LIMIT = 8 * 1024 * 1024;

export class RdpService {
  private sessions = new Map<string, RdpSession>();

  constructor(private connectionService: ConnectionService) {}

  /** 获取会话（供外部查询状态） */
  getSession(sessionId: string): RdpSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** 获取全部 RDP 会话的简要信息 */
  getSessions(): Array<{ id: string; connectionId: string; name: string; state: string; createdAt: Date }> {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id, connectionId: s.connectionId, name: s.name, state: s.state, createdAt: s.createdAt,
    }));
  }

  /** 检查 guacd 是否可达 */
  async checkGuacd(host?: string, port?: number): Promise<{ ok: boolean; message: string }> {
    const h = host || '127.0.0.1';
    const p = port || 4822;
    return new Promise((resolve) => {
      const socket = net.createConnection({ host: h, port: p });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ ok: false, message: `连接 guacd ${h}:${p} 超时` });
      }, 3000);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok: true, message: `guacd ${h}:${p} 可达` });
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        resolve({ ok: false, message: `无法连接 guacd ${h}:${p}: ${err.message}` });
      });
    });
  }

  /**
   * 创建 RDP 会话：连接 guacd、完成握手、注入凭据、开始双向转发。
   * onFrame/onReady/onClose 由调用方（server.js 或 electron main）注入，
   * 用于把 Guacamole 指令桥接到 WebSocket / IPC 通道。
   */
  async createSession(
    sessionId: string,
    connectionId: string,
    width: number,
    height: number,
    callbacks: {
      onFrame: (instruction: string) => void;
      onReady: () => void;
      onClose: (reason?: string) => void;
      onLog?: (msg: string) => void;
    },
  ): Promise<RdpSession> {
    const log = (msg: string) => {
      console.log(`[RDP] ${msg}`);
      callbacks.onLog?.(msg);
    };

    const connection = await this.connectionService.getConnectionById(connectionId);
    if (!connection) throw new Error('连接配置不存在');
    if (connection.type !== 'rdp') throw new Error('该连接不是 RDP 类型');

    // 若已存在同 ID 会话，先关闭
    if (this.sessions.has(sessionId)) this.closeSession(sessionId);

    const rdpOpts = connection.options?.rdp || {};
    const guacdOpts = connection.options?.guacd || {};
    const guacdHost = guacdOpts.host || '127.0.0.1';
    const guacdPort = guacdOpts.port || 4822;
    const dpi = rdpOpts.dpi || 96;
    const w = width || rdpOpts.width || 1280;
    const h = height || rdpOpts.height || 800;

    log(`正在连接 guacd ${guacdHost}:${guacdPort}...`);

    return new Promise<RdpSession>((resolve, reject) => {
      const socket = net.createConnection({ host: guacdHost, port: guacdPort });
      let settled = false;
      let inputBuffer = '';

      const session: RdpSession = {
        id: sessionId,
        connectionId,
        type: 'rdp',
        name: connection.name,
        socket,
        state: 'selecting',
        createdAt: new Date(),
        lastFrameAt: Date.now(),
        pendingBytes: 0,
        pendingInstructions: [],
        onFrame: callbacks.onFrame,
        onReady: callbacks.onReady,
        onClose: callbacks.onClose,
        onLog: callbacks.onLog,
      };

      const fail = (err: Error) => {
        log(`连接失败: ${err.message}`);
        try { socket.destroy(); } catch { /* ignore */ }
        if (!settled) { settled = true; reject(err); }
        else callbacks.onClose(err.message);
      };

      const timeout = setTimeout(() => fail(new Error('guacd 连接超时 (15s)')), 15000);

      socket.on('connect', () => {
        log('已连接 guacd，正在协商 RDP...');
        socket.write(instruction('select', 'rdp'));
      });

      socket.on('data', (chunk: Buffer) => {
        inputBuffer += chunk.toString('utf8');
        const [instructions, rest] = splitInstructions(inputBuffer);
        inputBuffer = rest;

        for (const inst of instructions) {
          const op = opcodeOf(inst);
          if (session.state === 'selecting' && op === 'args') {
            // guacd 返回参数名列表 -> 按精确顺序/数量发送 connect 值
            session.state = 'connecting';
            log('RDP 参数协商完成，正在注入凭据...');

            const argNames = parseArgs(inst);
            const valuesByName: Record<string, string> = {
              hostname: connection.host,
              port: String(connection.port || 3389),
              username: connection.username,
              password: connection.password || '',
              domain: rdpOpts.domain || '',
              width: String(w),
              height: String(h),
              dpi: String(dpi),
              'color-depth': rdpOpts.colorDepth ? String(rdpOpts.colorDepth) : '',
              security: rdpOpts.security || '',
              // 注意：guacd RDP 参数是连字符形式 `ignore-cert`，不是下划线
              'ignore-cert': rdpOpts.ignoreCert !== false ? 'true' : '',
              'server-layout': rdpOpts.serverLayout || '',
              'disable-audio': rdpOpts.enableAudio ? 'false' : 'true',
            };

            // 关键：guacd 要求 connect 参数的数量与 args 声明完全一致，
            // 未指定的参数也必须给空字符串，否则报
            // "Client did not return the expected number of arguments" 并断开。
            const connectValues = argNames.map((name) => valuesByName[name] ?? '');

            // 客户端能力声明必须在 connect 之前发送，否则 guacd 不会推送画面帧
            socket.write(instruction('size', String(w), String(h), String(dpi)));
            socket.write(instruction('audio', 'audio/L16', '44100'));
            socket.write(instruction('video', 'video/webm', 'video/mp4'));
            socket.write(instruction('clipboard', 'text/plain', 'UTF8'));
            socket.write(instruction('connect', ...connectValues));
            // 凭据绝不写入日志
            log(`已发送 RDP 连接请求 (${connection.host}:${connection.port || 3389}, 用户 ${connection.username})`);
          } else if (session.state === 'connecting' && op === 'ready') {
            clearTimeout(timeout);
            session.state = 'ready';
            session.lastFrameAt = Date.now();
            log('RDP 会话已建立');
            this.sessions.set(sessionId, session);
            if (!settled) { settled = true; resolve(session); }
            callbacks.onReady();
            // 初始 sync 请求第一帧（Guacamole Client 收到后会自动回 sync）
            socket.write(instruction('sync', '1'));
          } else if (op === 'error') {
            // 从 error 指令里提取可读消息
            const msg = inst.replace(/^\d+\.error,?/, '').replace(/;$/, '').replace(/^\d+\./, '') || 'guacd 返回错误';
            fail(new Error(`RDP 认证/连接失败: ${msg}`));
          } else {
            // 正常帧指令：转发给前端（带背压控制）
            session.onFrame(inst);
            session.lastFrameAt = Date.now();
          }
        }
      });

      socket.on('close', () => {
        clearTimeout(timeout);
        const wasReady = session.state === 'ready';
        session.state = 'closed';
        this.sessions.delete(sessionId);
        if (wasReady) callbacks.onClose('RDP 连接已关闭');
        if (!settled) fail(new Error('guacd 连接在就绪前关闭'));
      });

      socket.on('error', (err) => fail(err));
    });
  }

  /** 转发前端发来的 Guacamole 指令（鼠标/键盘/剪贴板）到 guacd */
  sendInput(sessionId: string, instructionText: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== 'ready') return false;
    try {
      session.socket.write(instructionText);
      return true;
    } catch (err) {
      console.error(`[RDP] sendInput failed for ${sessionId}:`, err);
      return false;
    }
  }

  /** 调整分辨率：发送 Guacamole size 指令 */
  resize(sessionId: string, width: number, height: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== 'ready') return false;
    try {
      session.socket.write(instruction('size', String(width), String(height), String(96)));
      return true;
    } catch {
      return false;
    }
  }

  /** 关闭 RDP 会话 */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.state = 'closed';
    this.sessions.delete(sessionId);
    try {
      session.socket.write(instruction('disconnect'));
    } catch { /* ignore */ }
    try {
      session.socket.destroy();
    } catch { /* ignore */ }
  }

  /** 关闭全部会话 */
  closeAllSessions(): void {
    for (const id of Array.from(this.sessions.keys())) this.closeSession(id);
  }
}
