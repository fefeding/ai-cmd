import * as fs from 'fs';
import { ensureDataDir, getDataPath } from '../utils/data-dir';
import { assessDangerousCommand } from '../utils/shell';
import type { SSHService } from './ssh.service';
import type { ConnectionService } from './connection.service';
import type { AuditService } from './audit.service';

/**
 * MCP 会话桥接服务
 *
 * 让 AI 编辑器（CodeBuddy / Cursor 等）的对话通过 MCP 只操作「用户显式添加」的那一个
 * 终端会话。设计要点：
 *
 * - 绑定状态只存在于本服务内存中（唯一真相）。工具不接收 sessionId 参数，
 *   外部进程（aicmd mcp）每次调用都只能作用在当前绑定的会话上，无法触达其它连接。
 * - 会话本体始终在插件后端进程内：这里只往该会话写命令、读输出，
 *   所以命令与输出对用户终端可见，天然可审计。
 * - 数据目录下的 mcp-session.json 只做「服务发现」（仅含本服务的回环地址），
 *   不含 sessionId、不含任何凭据。
 */

/** 服务发现文件名（位于数据目录） */
const DISCOVERY_FILE = 'mcp-session.json';

const DEFAULT_EXEC_TIMEOUT_MS = 20000;
const MIN_EXEC_TIMEOUT_MS = 1000;
const MAX_EXEC_TIMEOUT_MS = 300000;
/** 单条命令最大长度（伪终端规范模式下单行输入有长度上限） */
const MAX_COMMAND_LENGTH = 20000;
/** 单次返回给 AI 的输出上限；完整输出保留在内存里，可用 session_output 分段读取 */
const MAX_OUTPUT_LENGTH = 20000;
/** 完整输出缓冲区上限，避免一条命令把内存打爆 */
const MAX_OUTPUT_BUFFER_LENGTH = 200000;

export interface BoundSession {
  sessionId: string;
  sessionName: string;
  connectionId: string;
  type: string;
  connectionName?: string;
  host?: string;
  username?: string;
  boundAt: number;
}

export interface McpExecResult {
  output: string;
  durationMs: number;
  /** 到达最长等待时间仍未看到完成标记（命令可能仍在运行，或被前台程序阻塞） */
  timedOut: boolean;
  truncated: boolean;
  /** 命令退出码；被中断或超时时为 undefined */
  exitCode?: number;
  /** 完整输出缓冲的 ID，配合 session_output 读取被截断的剩余内容 */
  outputId?: string;
  totalLength: number;
}

export interface McpOutputChunk {
  outputId: string;
  offset: number;
  totalLength: number;
  output: string;
  truncated: boolean;
}

/** 去掉命令回显：命令的每一行（及其续行提示符）都会出现在输出开头 */
function stripCommandEcho(output: string, command: string): string {
  const cmdLines = command
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!cmdLines.length) return output;
  const lines = output.split('\n');
  let dropped = 0;
  for (const line of lines) {
    if (dropped >= cmdLines.length) break;
    const probe = cmdLines[dropped].substring(0, 20);
    if (probe && line.trim().includes(probe)) {
      dropped++;
      continue;
    }
    break;
  }
  return lines.slice(dropped).join('\n').trim();
}

/**
 * 在用户命令后追加一条「完成标记」命令。
 * - 类 Unix：`printf '\n<marker>:<exit code>\n' "$?"`
 * - PowerShell：`Write-Output "<marker>:<code>"`
 * 这样既能精确判断命令何时结束（无输出的 cd/true 也不会被误判为超时），
 * 又能把退出码带回给 AI，而不依赖解析不同语言的提示符。
 */
function buildWrappedCommand(command: string, marker: string, shell: 'unix' | 'windows'): string {
  const cmd = command.replace(/\r/g, '');
  if (shell === 'windows') {
    const tail =
      '$__aicmd_code = if ($LASTEXITCODE -eq $null) { if ($?) { 0 } else { 1 } } else { $LASTEXITCODE }; ' +
      'Write-Output "' +
      marker +
      ':$__aicmd_code"';
    return `${cmd}\n${tail}\r`;
  }
  return `${cmd}\nprintf '\\n${marker}:%s\\n' "$?"\r`;
}

/** 输出里出现完整的一行 `marker:<数字>` 即认为命令已结束。 */
function markerCompleted(text: string, marker: string): boolean {
  // 命令回显里也会出现一次 marker（printf 的 %s 模板），必须跳过它，
  // 只接受真正由 shell 输出的 `marker:<数字>` 行。
  let from = 0;
  for (;;) {
    const at = text.indexOf(`${marker}:`, from);
    if (at < 0) return false;
    const after = text.slice(at + marker.length + 1);
    if (/^\d+\r?\n/.test(after)) return true;
    from = at + marker.length + 1;
  }
}

function parseExitCode(text: string, marker: string): number | undefined {
  const match = text.match(new RegExp(`${marker}:(\\d+)`));
  return match ? Number(match[1]) : undefined;
}

function removeMarkerLines(text: string, marker: string): string {
  return text
    .split('\n')
    .filter((line) => !line.includes(marker))
    .join('\n')
    .trim();
}

export class McpBridgeService {
  private bound: BoundSession | null = null;
  private running = false;
  /** 上一条命令到达等待上限后可能仍在运行：终端视为被占用，直到被中断 */
  private pending = false;
  private baseUrl = '';
  /** 最近一次 exec 的完整输出，供 session_output 分段读取 */
  private lastOutput: { id: string; text: string; createdAt: number } | null = null;

  constructor(
    private readonly sshService: SSHService,
    private readonly connectionService: ConnectionService,
    private readonly auditService: AuditService
  ) {
    // 会话关闭（终端面板关闭、断线）即解除绑定，避免 AI 继续对一个已不存在的会话操作
    this.sshService.onSessionClose((sessionId) => {
      if (this.bound && this.bound.sessionId === sessionId) this.unbind();
    });
  }

  /**
   * 设置本服务的回环地址（由 server.js 在监听前调用）。
   * Electron IPC / Vite dev 等不经由 server.js 的运行模式下不会被调用，
   * 此时绑定会返回明确的错误。
   */
  setBaseUrl(url: string): void {
    this.baseUrl = String(url || '').replace(/\/+$/, '');
  }

  /** 把指定会话绑定到 AI 对话；同一时刻只允许绑定一个会话，后绑定者覆盖前者。 */
  async bind(sessionId: string): Promise<BoundSession> {
    const id = String(sessionId || '').trim();
    if (!id) throw new Error('Missing parameter: sessionId');
    if (!this.baseUrl) {
      throw new Error(
        'MCP 绑定仅在 server.js 启动的服务下可用 / MCP binding is only available for the server.js runtime'
      );
    }
    const session = this.sshService.getSession(id);
    if (!session) {
      throw new Error('会话不存在或已断开 / Session not found or already closed');
    }

    let detail: Partial<BoundSession> = {};
    try {
      const conn: any = session.connectionId
        ? await this.connectionService.getConnectionById(session.connectionId)
        : undefined;
      // 只取非敏感字段，绝不把解密后的凭据带进绑定信息
      if (conn) {
        detail = {
          type: conn.type,
          connectionName: conn.name,
          host: conn.host,
          username: conn.username,
        };
      }
    } catch {
      /* 连接配置读取失败不影响绑定 */
    }

    const bound: BoundSession = {
      sessionId: id,
      sessionName: session.name || session.connectionId || id,
      connectionId: session.connectionId || '',
      type: detail.type || session.type || 'ssh',
      connectionName: detail.connectionName,
      host: detail.host,
      username: detail.username,
      boundAt: Date.now(),
    };
    this.bound = bound;
    this.pending = false;
    this.lastOutput = null;
    this.writeDiscovery(bound);
    console.log(`[MCP] session bound: ${id} (${bound.sessionName})`);
    return bound;
  }

  /** 解除绑定并删除发现文件 */
  unbind(): void {
    const previous = this.bound;
    this.bound = null;
    this.pending = false;
    this.lastOutput = null;
    this.removeDiscovery();
    if (previous) console.log(`[MCP] session unbound: ${previous.sessionId}`);
  }

  /** 当前绑定的会话；会话已不存在时自动解绑并返回 null */
  status(): BoundSession | null {
    if (this.bound && !this.sshService.getSession(this.bound.sessionId)) {
      this.unbind();
    }
    return this.bound;
  }

  /** 读取绑定会话最近的终端输出（不执行任何命令，无副作用） */
  read(lines?: number): string {
    const bound = this.requireBound();
    const maxLines = Math.min(Math.max(Number(lines) || 100, 10), 400);
    return this.sshService.getOutputBuffer(bound.sessionId, maxLines);
  }

  /** 分段读取最近一次 exec 的完整输出，避免长输出被截断后只能重跑命令。 */
  readOutput(offset?: number, length?: number): McpOutputChunk {
    this.requireBound();
    const stored = this.lastOutput;
    if (!stored) {
      return {
        outputId: '',
        offset: 0,
        totalLength: 0,
        output: '(没有可读取的上一条命令输出 / No previous exec output)',
        truncated: false,
      };
    }
    const start = Math.max(0, Math.floor(Number(offset) || 0));
    const size = Math.min(
      Math.max(Math.floor(Number(length) || MAX_OUTPUT_LENGTH), 1000),
      MAX_OUTPUT_BUFFER_LENGTH
    );
    const output = stored.text.slice(start, start + size);
    return {
      outputId: stored.id,
      offset: start,
      totalLength: stored.text.length,
      output,
      truncated: start + output.length < stored.text.length,
    };
  }

  /** 向绑定会话发送 Ctrl+C，中断正在运行的前台命令（同时解除「命令可能仍在运行」的占用状态） */
  interrupt(): void {
    const bound = this.requireBound();
    this.sshService.writeData(bound.sessionId, '\x03');
    this.pending = false;
    this.audit(bound, 'mcp.session_interrupt', '^C', '', 0, 'success');
  }

  /**
   * 在绑定会话的交互式 shell 中执行命令并返回输出。
   * 命令后追加完成标记：无输出的 cd/true 不再被误判为超时，并能拿到退出码。
   * 与内置 AI Agent 走同一条执行链（危险命令拦截 + 审计）。
   */
  async exec(command: string, timeoutMs?: number): Promise<McpExecResult> {
    const bound = this.requireBound();
    const cmd = String(command || '');
    if (!cmd.trim()) throw new Error('Missing parameter: command');
    if (cmd.length > MAX_COMMAND_LENGTH) {
      throw new Error(
        `命令过长（上限 ${MAX_COMMAND_LENGTH} 字符）/ Command too long (limit ${MAX_COMMAND_LENGTH} chars)`
      );
    }

    const risk = assessDangerousCommand(cmd);
    if (!risk.safe) {
      this.audit(bound, 'mcp.session_exec', cmd, risk.reason || '', 0, 'blocked');
      throw new Error(risk.reason || 'Command blocked');
    }

    const maxMs = Math.min(
      Math.max(Number(timeoutMs) || DEFAULT_EXEC_TIMEOUT_MS, MIN_EXEC_TIMEOUT_MS),
      MAX_EXEC_TIMEOUT_MS
    );
    if (this.running) {
      throw new Error(
        '该终端已有一条命令正在执行，请等待其结束或先中断 / Another command is still running on this terminal'
      );
    }
    if (this.pending) {
      throw new Error(
        '上一条命令到达等待上限后可能仍在运行，终端暂不可用。请先调用 session_interrupt 中断（或 session_read 查看屏幕）后再执行。' +
          ' / The previous command may still be running after its time limit. Call session_interrupt (or session_read) first.'
      );
    }

    this.running = true;
    const startedAt = Date.now();
    try {
      const marker = `__AICMD_DONE_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const shell = this.sshService.getShellKind(bound.sessionId);
      const wrapped = buildWrappedCommand(cmd, marker, shell);
      // 必须先挂采集再写命令：SSH stream 的即时回显/输出会在监听前到达而丢失。
      const capture = this.sshService.captureOutput(bound.sessionId, maxMs, (text) =>
        markerCompleted(text, marker)
      );
      const written = this.sshService.writeData(bound.sessionId, wrapped);
      if (!written) {
        capture.catch(() => undefined);
        this.audit(bound, 'mcp.session_exec', cmd, 'Failed to write command to session', 0, 'error');
        throw new Error('无法向终端会话写入命令 / Failed to write command to the attached session');
      }

      const raw = await capture;
      const durationMs = Date.now() - startedAt;
      const exitCode = parseExitCode(raw, marker);
      // 没看到完成标记才意味着命令仍在运行 / 被前台程序占用。
      const timedOut = exitCode === undefined;
      this.pending = timedOut;
      const fullText = removeMarkerLines(stripCommandEcho(raw, wrapped), marker);
      const truncated = fullText.length > MAX_OUTPUT_LENGTH;
      const output = truncated ? fullText.substring(0, MAX_OUTPUT_LENGTH) : fullText;
      const outputId = `__AICMD_OUT_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      this.lastOutput = { id: outputId, text: fullText, createdAt: Date.now() };

      this.audit(
        bound,
        'mcp.session_exec',
        cmd,
        output.substring(0, 5000) +
          (exitCode !== undefined ? `\n[exit ${exitCode}]` : '') +
          (timedOut ? '\n[timed out: command may still be running]' : ''),
        durationMs,
        'success'
      );
      return {
        output,
        durationMs,
        timedOut,
        truncated,
        exitCode,
        outputId,
        totalLength: fullText.length,
      };
    } finally {
      this.running = false;
    }
  }

  /** 进程退出时清理发现文件 */
  dispose(): void {
    this.removeDiscovery();
  }

  // ========== 内部方法 ==========

  private requireBound(): BoundSession {
    const bound = this.status();
    if (!bound) {
      throw new Error(
        '没有终端会话被添加到对话 / No AICmd terminal is attached to this conversation'
      );
    }
    return bound;
  }

  private audit(
    bound: BoundSession,
    tool: string,
    command: string,
    result: string,
    duration: number,
    status: 'success' | 'error' | 'blocked' | 'rewritten'
  ): void {
    try {
      this.auditService.log({
        sessionId: bound.sessionId,
        sessionName: bound.sessionName,
        connectionId: bound.connectionId,
        userMessage: 'MCP',
        tool,
        command,
        result,
        duration,
        status,
      });
    } catch {
      /* 审计失败不影响主流程 */
    }
  }

  private get discoveryPath(): string {
    return getDataPath(DISCOVERY_FILE);
  }

  private writeDiscovery(bound: BoundSession): void {
    try {
      ensureDataDir();
      const file = this.discoveryPath;
      const tmp = `${file}.tmp`;
      fs.writeFileSync(
        tmp,
        JSON.stringify(
          { baseUrl: this.baseUrl, pid: process.pid, boundAt: bound.boundAt },
          null,
          2
        ),
        { encoding: 'utf-8', mode: 0o600 }
      );
      fs.renameSync(tmp, file);
    } catch (e: any) {
      console.error(`[MCP] Failed to write discovery file: ${e.message}`);
    }
  }

  private removeDiscovery(): void {
    try {
      if (fs.existsSync(this.discoveryPath)) fs.unlinkSync(this.discoveryPath);
    } catch {
      /* ignore */
    }
  }
}
