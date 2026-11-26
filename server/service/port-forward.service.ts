import * as net from 'net';
import type { Client, ClientChannel } from 'ssh2';
import { SSHService } from './ssh.service';
import { ConnectionEntity, type PortForwardRule } from '../model/connection.entity';

interface ActiveTunnel {
  /** `${connectionId}::${ruleId}`，同一连接的同一规则全局只有一条隧道 */
  key: string;
  connectionId: string;
  rule: PortForwardRule;
  client: Client;
  /** 当前承载隧道的会话；该会话关闭时隧道会交接给其它使用者 */
  ownerSessionId: string;
  /** 所有需要这条隧道的会话（多开标签页 / 多浏览器页面） */
  users: Set<string>;
  /** local 方向：本地监听 server */
  server?: net.Server;
  /** 活跃的转发通道，用于 stop 时统一销毁 */
  channels: Set<net.Socket | ClientChannel>;
  /** 活跃连接数（一条 TCP 连接算 1，channels 里 socket/stream 各占 1） */
  activeConnections: number;
  status: 'starting' | 'active' | 'error';
  error?: string;
  startedAt: Date;
  /** remote 方向：tcp connection 事件监听引用 */
  tcpipHandler?: (info: any, accept: () => ClientChannel, reject: () => void) => void;
}

function log(msg: string) {
  console.log(`[PortForward] ${msg}`);
}

/** 连接本机目标服务的超时（ms）：目标不可达时快速失败，而不是长时间挂起 */
const LOCAL_CONNECT_TIMEOUT = 10000;

function validPort(value: any): value is number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

/**
 * SSH 端口转发服务（本地隧道 -L / 远程转发 -R）
 *
 * 复用 SSH 已建立的 ssh2 Client，不新建连接：
 * - local：在本机 listen，每个接入的连接通过 client.forwardOut 打到 SSH 服务器侧的目标
 * - remote：通过 client.forwardIn 让 SSH 服务器监听，tcp connection 事件到达后连本机目标
 *
 * 关键设计：隧道按「连接 + 规则」去重并共享。同一连接开多个终端标签页、或开多个
 * Web 页面时，只会真正启动一条隧道（避免抢同一监听端口导致 EADDRINUSE）；
 * 承载会话关闭时，隧道自动交接给另一个仍在线的会话，不会让转发凭空消失。
 */
export class PortForwardService {
  /** tunnelKey -> tunnel */
  private tunnels: Map<string, ActiveTunnel> = new Map();
  /** sessionId -> 该会话需要的 tunnelKey 集合 */
  private sessionWants: Map<string, Set<string>> = new Map();
  /** 已给哪些 Client 挂过 tcp connection 监听，避免重复注册 */
  private tcpipClients: Set<Client> = new Set();
  /** 按 Client 共享的 tcp connection 处理器 */
  private remoteHandlers: Map<Client, (info: any, accept: () => ClientChannel, reject: () => void) => void> = new Map();

  constructor(private sshService: SSHService) {}

  private tunnelKey(connectionId: string, ruleId: string): string {
    return `${connectionId}::${ruleId}`;
  }

  /** 会话建立后自动启动所有 enabled && autoStart 的规则 */
  startAuto(sessionId: string, connection: ConnectionEntity): void {
    const rules = (connection.portForwards || []).filter(r => r && r.enabled !== false && r.autoStart !== false);
    if (!rules.length) return;
    log(`session ${sessionId}: auto-starting ${rules.length} rule(s)`);
    for (const rule of rules) {
      this.start(sessionId, rule, connection.id).catch(err => {
        log(`session ${sessionId} rule ${rule.id} auto-start failed: ${err.message}`);
      });
    }
  }

  /** 列出某会话下所有规则的运行状态 */
  list(sessionId: string): Array<{
    ruleId: string;
    status: 'starting' | 'active' | 'error';
    error?: string;
    startedAt?: Date;
    connections?: number;
    shared?: boolean;
  }> {
    const keys = this.sessionWants.get(sessionId);
    if (!keys) return [];
    const result: Array<{ ruleId: string; status: 'starting' | 'active' | 'error'; error?: string; startedAt?: Date; connections?: number; shared?: boolean }> = [];
    for (const key of keys) {
      const t = this.tunnels.get(key);
      if (!t) continue;
      result.push({
        ruleId: t.rule.id,
        status: t.status,
        error: t.error,
        startedAt: t.startedAt,
        connections: t.activeConnections,
        shared: t.users.size > 1,
      });
    }
    return result;
  }

  /** 启动单条规则（幂等：同一连接+规则已 active/starting 时复用，不重复监听） */
  async start(sessionId: string, rule: PortForwardRule, connectionId?: string): Promise<void> {
    if (!rule || !rule.id) throw new Error('缺少转发规则 id');
    const direction = rule.direction === 'remote' ? 'remote' : 'local';
    if (!validPort(rule.listenPort)) throw new Error(`无效监听端口: ${rule.listenPort}`);
    if (!validPort(rule.targetPort)) throw new Error(`无效目标端口: ${rule.targetPort}`);
    const listenHost = String(rule.listenHost || '127.0.0.1');
    const targetHost = String(rule.targetHost || '127.0.0.1');

    const session = this.sshService.getSession(sessionId);
    if (!session?.client) throw new Error('SSH 会话不存在或已断开');
    const connId = connectionId || session.connectionId || '';
    const key = this.tunnelKey(connId, rule.id);

    // 登记使用者：多个会话/页面共享同一条隧道
    let wants = this.sessionWants.get(sessionId);
    if (!wants) {
      wants = new Set();
      this.sessionWants.set(sessionId, wants);
    }
    wants.add(key);

    const existing = this.tunnels.get(key);
    if (existing && (existing.status === 'active' || existing.status === 'starting')) {
      existing.users.add(sessionId);
      log(`session ${sessionId} rule ${rule.id}: reuse tunnel (${existing.users.size} session(s))`);
      return;
    }
    // 之前失败的隧道：释放后重建（手动重试场景）
    if (existing) {
      this.destroyTunnel(existing);
      this.tunnels.delete(key);
    }

    const tunnel: ActiveTunnel = {
      key,
      connectionId: connId,
      rule: { ...rule, direction, listenHost, targetHost },
      client: session.client,
      ownerSessionId: sessionId,
      users: new Set([sessionId]),
      channels: new Set(),
      activeConnections: 0,
      status: 'starting',
      startedAt: new Date(),
    };
    this.tunnels.set(key, tunnel);
    await this.startTunnel(tunnel, sessionId);
  }

  /** 真正建立监听/转发；失败时保留 error 状态供 UI 展示原因 */
  private async startTunnel(tunnel: ActiveTunnel, sessionId: string): Promise<void> {
    const { direction, listenHost, listenPort, targetHost, targetPort } = tunnel.rule;
    try {
      if (direction === 'local') {
        await this.startLocal(tunnel);
      } else {
        await this.startRemote(tunnel);
      }
      tunnel.status = 'active';
      tunnel.error = undefined;
      log(`session ${sessionId} rule ${tunnel.rule.id}: ${direction} ${listenHost}:${listenPort} -> ${targetHost}:${targetPort} active`);
      // 运行期 server error（监听成功之后）也要回收资源、纠正状态
      if (tunnel.server) {
        tunnel.server.on('error', (err: any) => {
          log(`session ${sessionId} rule ${tunnel.rule.id} runtime error: ${err.message}`);
          this.removeTunnel(tunnel.key);
        });
      }
    } catch (err: any) {
      tunnel.status = 'error';
      tunnel.error = err?.message || String(err);
      // forwardIn 失败时 tcp connection handler 可能已注册，必须一并回收
      this.destroyTunnel(tunnel);
      log(`session ${sessionId} rule ${tunnel.rule.id} start failed: ${tunnel.error}`);
      throw err;
    }
  }

  /** 本地转发：本机监听 → client.forwardOut → SSH 服务器侧目标 */
  private startLocal(tunnel: ActiveTunnel): Promise<void> {
    return new Promise((resolve, reject) => {
      const { listenHost, listenPort, targetHost, targetPort } = tunnel.rule;
      const server = net.createServer((socket) => {
        try { socket.setNoDelay(true); } catch (_) {}
        tunnel.channels.add(socket);
        let upstream: ClientChannel | undefined;
        let cleaned = false;
        // 双向清理：任一端断开都立即销毁另一端，避免 SSH channel 残留占用 MaxSessions
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          tunnel.channels.delete(socket);
          if (upstream) {
            tunnel.channels.delete(upstream);
            try { upstream.destroy(); } catch (_) {}
          }
          if (tunnel.activeConnections > 0) tunnel.activeConnections--;
        };
        socket.on('close', cleanup);
        socket.on('error', cleanup);
        tunnel.activeConnections++;

        tunnel.client.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
          if (err || !stream) {
            socket.destroy();
            log(`forwardOut failed: ${err?.message || 'no stream'}`);
            return;
          }
          upstream = stream;
          tunnel.channels.add(stream);
          stream.on('close', cleanup);
          stream.on('error', (e: any) => {
            log(`forwardOut channel error: ${e?.message || e}`);
            cleanup();
          });
          socket.pipe(stream).pipe(socket);
        });
      });
      server.on('error', (err: any) => {
        tunnel.status = 'error';
        tunnel.error = err.message;
        reject(err);
      });
      server.listen(listenPort, listenHost, () => resolve());
      tunnel.server = server;
    });
  }

  /** 远程转发：client.forwardIn → 服务器监听 → tcp connection 事件 → 本机目标 */
  private async startRemote(tunnel: ActiveTunnel): Promise<void> {
    const { listenHost, listenPort, targetHost, targetPort } = tunnel.rule;
    const client = tunnel.client;
    // 每个 Client 只注册一个处理器，按监听端口分发到对应规则
    if (!this.tcpipClients.has(client)) {
      // ssh2 v1.x 的事件名是 'tcp connection'（不是 'tcpip'），字段为 destPort
      const handler = (info: any, accept: () => ClientChannel, reject: () => void) => {
        const port = Number(info?.destPort);
        const matched = this.findRemoteTunnelByPort(client, port);
        if (!matched) {
          log(`remote forward request for unmatched port ${port}, rejecting`);
          try { reject(); } catch (_) {}
          return;
        }

        let upstream: ClientChannel;
        try {
          upstream = accept();
        } catch (e: any) {
          log(`accept() failed for port ${port}: ${e?.message || e}`);
          try { reject(); } catch (_) {}
          return;
        }
        // 立即登记，stop() 才能回收（否则本地连接未建好时无法销毁）
        matched.channels.add(upstream);

        let downstream: net.Socket | undefined;
        let connectTimer: ReturnType<typeof setTimeout> | undefined;
        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          if (connectTimer) clearTimeout(connectTimer);
          matched.channels.delete(upstream);
          try { upstream.destroy(); } catch (_) {}
          if (downstream) {
            matched.channels.delete(downstream);
            try { downstream.destroy(); } catch (_) {}
          }
          if (matched.activeConnections > 0) matched.activeConnections--;
        };
        matched.activeConnections++;

        // 服务端拒绝开通道（MaxSessions 已满等）时立刻断开，
        // 否则对端会一直等到超时（表现为浏览器十几秒后 net::ERR_TIMED_OUT）
        upstream.on('error', (err: any) => {
          log(`remote forward channel error (port ${port}): ${err?.message || err} — ` +
            '若服务端 MaxSessions 已满（新开通道被拒），请调高 sshd_config 的 MaxSessions');
          cleanup();
        });
        upstream.on('close', cleanup);

        // 只对「建立连接」阶段设超时：socket 的 timeout 是空闲超时，
        // 若长期挂着会误杀 HTTP keep-alive 的空闲长连接
        connectTimer = setTimeout(() => {
          log(`local target ${matched.rule.targetHost}:${matched.rule.targetPort} connect timeout`);
          cleanup();
        }, LOCAL_CONNECT_TIMEOUT);

        downstream = net.connect({
          port: matched.rule.targetPort,
          host: matched.rule.targetHost,
        }, () => {
          clearTimeout(connectTimer);
          try { downstream!.setNoDelay(true); } catch (_) {}
          upstream.pipe(downstream!).pipe(upstream);
        });
        matched.channels.add(downstream);
        downstream.on('error', (err: any) => {
          log(`local target ${matched.rule.targetHost}:${matched.rule.targetPort} error: ${err?.message || err}`);
          cleanup();
        });
        downstream.on('close', cleanup);
      };
      client.on('tcp connection', handler);
      tunnel.tcpipHandler = handler;
      this.remoteHandlers.set(client, handler);
      this.tcpipClients.add(client);
    } else {
      // 复用已注册的 handler，当前 tunnel 关闭时不应移除共享 handler；
      // 由最后一个 remote tunnel 关闭时统一移除
      tunnel.tcpipHandler = this.remoteHandlers.get(client);
    }

    await new Promise<void>((resolve, reject) => {
      client.forwardIn(listenHost, listenPort, (err?: Error) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private findRemoteTunnelByPort(client: Client, port: number): ActiveTunnel | undefined {
    for (const t of this.tunnels.values()) {
      // 'starting' 也要匹配：forwardIn 注册监听与状态置 active 之间存在窗口
      if (t.client === client && t.rule.direction === 'remote' && t.rule.listenPort === port &&
          (t.status === 'active' || t.status === 'starting')) {
        return t;
      }
    }
    return undefined;
  }

  /** 停止某会话对某规则的使用（其它会话仍在用则保留隧道） */
  stop(sessionId: string, ruleId: string): void {
    const session = this.sshService.getSession(sessionId);
    const connId = session?.connectionId || '';
    // 若无法确定 connectionId，按 ruleId 兜底匹配
    const key = connId ? this.tunnelKey(connId, ruleId) : this.findKeyByRule(ruleId);
    if (!key) return;
    this.releaseTunnel(key, sessionId);
  }

  /** 会话关闭：释放该会话的全部隧道；仍有其它使用者的隧道交接给在线会话 */
  stopAll(sessionId: string): void {
    const keys = this.sessionWants.get(sessionId);
    if (!keys) return;
    for (const key of Array.from(keys)) {
      this.releaseTunnel(key, sessionId);
    }
    this.sessionWants.delete(sessionId);
  }

  private findKeyByRule(ruleId: string): string | undefined {
    for (const key of this.tunnels.keys()) {
      if (key.endsWith(`::${ruleId}`)) return key;
    }
    return undefined;
  }

  /** 释放一个使用者；无使用者则销毁，owner 退出则交接 */
  private releaseTunnel(key: string, sessionId: string): void {
    const tunnel = this.tunnels.get(key);
    const wants = this.sessionWants.get(sessionId);
    wants?.delete(key);
    if (!tunnel) return;

    tunnel.users.delete(sessionId);
    if (tunnel.users.size === 0) {
      this.removeTunnel(key);
      log(`tunnel ${key}: stopped (no users)`);
      return;
    }
    if (tunnel.ownerSessionId === sessionId) {
      this.handoffTunnel(tunnel);
    } else {
      log(`tunnel ${key}: session ${sessionId} released, still owned by ${tunnel.ownerSessionId}`);
    }
  }

  /** 把隧道交接给另一个仍在线的使用者会话 */
  private handoffTunnel(tunnel: ActiveTunnel): void {
    const nextSessionId = Array.from(tunnel.users).find(id => {
      const s = this.sshService.getSession(id);
      return !!s?.client;
    });
    if (!nextSessionId) {
      this.removeTunnel(tunnel.key);
      log(`tunnel ${tunnel.key}: stopped (owner closed, no other live session)`);
      return;
    }
    const nextSession = this.sshService.getSession(nextSessionId)!;
    this.destroyTunnel(tunnel);
    tunnel.client = nextSession.client;
    tunnel.ownerSessionId = nextSessionId;
    tunnel.channels = new Set();
    tunnel.activeConnections = 0;
    tunnel.status = 'starting';
    tunnel.startedAt = new Date();
    log(`tunnel ${tunnel.key}: handed off to session ${nextSessionId}`);
    this.startTunnel(tunnel, nextSessionId).catch(err => {
      log(`tunnel ${tunnel.key} handoff failed: ${err.message}`);
    });
  }

  private removeTunnel(key: string): void {
    const tunnel = this.tunnels.get(key);
    if (!tunnel) return;
    this.destroyTunnel(tunnel);
    this.tunnels.delete(key);
    // 清理所有使用者的登记，避免 UI 显示已不存在的隧道
    for (const wants of this.sessionWants.values()) wants.delete(key);
  }

  private destroyTunnel(tunnel: ActiveTunnel): void {
    try { tunnel.server?.close(); } catch (_) {}
    for (const ch of Array.from(tunnel.channels)) {
      try { ch.destroy(); } catch (_) {}
    }
    tunnel.channels.clear();
    tunnel.activeConnections = 0;
    if (tunnel.rule.direction === 'remote') {
      // 通知 SSH 服务器取消监听（best effort）；交接期间可能失败，忽略
      try {
        tunnel.client.unforwardIn(tunnel.rule.listenHost, tunnel.rule.listenPort, () => {});
      } catch (_) {}
      // 仅当该 client 已无其它 remote tunnel 时才移除共享 handler
      const stillUsed = Array.from(this.tunnels.values()).some(t =>
        t !== tunnel && t.client === tunnel.client && t.rule.direction === 'remote'
      );
      if (!stillUsed) {
        const handler = this.remoteHandlers.get(tunnel.client) || tunnel.tcpipHandler;
        if (handler) {
          try { tunnel.client.removeListener('tcp connection', handler); } catch (_) {}
        }
        this.remoteHandlers.delete(tunnel.client);
        this.tcpipClients.delete(tunnel.client);
      }
    }
  }

  /** 服务销毁 */
  destroy(): void {
    for (const key of Array.from(this.tunnels.keys())) this.removeTunnel(key);
    this.sessionWants.clear();
    this.tcpipClients.clear();
    this.remoteHandlers.clear();
  }
}
