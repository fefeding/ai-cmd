import WebSocket = require('ws');

export interface WsMessage {
  type: string;
  sessionId?: string;
  data?: any;
  [key: string]: any;
}

type Predicate = (msg: WsMessage) => boolean;

interface Waiter {
  predicate: Predicate;
  resolve: (msg: WsMessage) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * 到后端 `/ws/terminal` 的一条 WebSocket 连接。
 *
 * 注意：server.js 在 WS close 时会关闭该连接上 create 出来的会话，
 * 因此为了执行输入而打开的连接绝不 create 会话；FS Provider 创建的
 * 会话则由本类持有连接直到 dispose。
 */
export class AicmdSocket {
  private ws?: WebSocket;
  private connecting?: Promise<void>;
  private readonly buffer: WsMessage[] = [];
  private readonly waiters: Waiter[] = [];
  private disposed = false;

  constructor(private readonly baseUrl: () => string) {}

  private get url(): string {
    const u = new URL(this.baseUrl());
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/ws/terminal';
    u.search = '';
    u.hash = '';
    return u.toString();
  }

  async ensureOpen(): Promise<void> {
    if (this.disposed) throw new Error('WebSocket bridge disposed');
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;

    const pending = new Promise<void>((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        reject(err as Error);
        return;
      }
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { ws.terminate(); } catch { /* ignore */ }
        reject(new Error('WebSocket 连接超时'));
      }, 8000);

      ws.on('open', () => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        this.ws = ws;
        resolve();
      });
      ws.on('message', (raw) => this.onMessage(raw));
      ws.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
      ws.on('close', () => {
        clearTimeout(timer);
        if (this.ws === ws) this.ws = undefined;
        this.failWaiters(new Error('WebSocket 连接已关闭'));
      });
    });

    this.connecting = pending;
    try {
      await pending;
    } finally {
      if (this.connecting === pending) this.connecting = undefined;
    }
  }

  private onMessage(raw: WebSocket.RawData): void {
    let msg: WsMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      if (w.predicate(msg)) {
        clearTimeout(w.timer);
        this.waiters.splice(i, 1);
        w.resolve(msg);
        return;
      }
    }
    this.buffer.push(msg);
    if (this.buffer.length > 200) this.buffer.shift();
  }

  private failWaiters(err: Error): void {
    for (const w of this.waiters.splice(0)) {
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  send(msg: WsMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    this.ws.send(JSON.stringify(msg));
  }

  waitFor(predicate: Predicate, timeoutMs = 15000): Promise<WsMessage> {
    const idx = this.buffer.findIndex(predicate);
    if (idx >= 0) {
      const msg = this.buffer.splice(idx, 1)[0];
      return Promise.resolve(msg);
    }
    return new Promise<WsMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.findIndex((w) => w.timer === timer);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error('等待服务端响应超时'));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  /** 建立一条专供文件管理使用的 SSH 会话，连接必须保持打开否则会话会被服务端关闭。 */
  async createSession(connectionId: string, name: string): Promise<string> {
    await this.ensureOpen();
    const sessionId = `aicmd-fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reply = this.waitFor(
      (m) =>
        (m.type === 'status' && m.sessionId === sessionId) ||
        (m.type === 'error' && (m.sessionId === sessionId || !m.sessionId)),
      25000
    );
    this.send({
      type: 'create',
      sessionId,
      data: { connectionId, name, cols: 80, rows: 24 }
    });
    const res = await reply;
    if (res.type === 'error') {
      throw new Error(String(res.data || 'SSH 会话创建失败'));
    }
    return sessionId;
  }

  close(): void {
    this.disposed = true;
    this.failWaiters(new Error('WebSocket bridge disposed'));
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = undefined;
  }
}

/** 扩展宿主共用的终端输入通道：只发 `terminal` 消息，不创建会话。 */
export class TerminalBridge {
  private readonly socket: AicmdSocket;

  constructor(private readonly baseUrl: () => string) {
    this.socket = new AicmdSocket(baseUrl);
  }

  async writeToSession(sessionId: string, text: string): Promise<void> {
    await this.socket.ensureOpen();
    this.socket.send({ type: 'terminal', sessionId, data: text });
  }

  createSocket(): AicmdSocket {
    return new AicmdSocket(this.baseUrl);
  }

  close(): void {
    this.socket.close();
  }
}
