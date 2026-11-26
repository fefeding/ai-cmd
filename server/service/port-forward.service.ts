import * as net from 'net';
import type { Client, ClientChannel } from 'ssh2';
import { SSHService } from './ssh.service';
import { ConnectionEntity, type PortForwardRule } from '../model/connection.entity';

interface ActiveTunnel {
  rule: PortForwardRule;
  client: Client;
  /** local 方向：本地监听 server */
  server?: net.Server;
  /** 活跃的转发通道，用于 stop 时统一销毁 */
  channels: Set<net.Socket | ClientChannel>;
  status: 'starting' | 'active' | 'error';
  error?: string;
  startedAt: Date;
  /** remote 方向：tcpip 事件监听引用 */
  tcpipHandler?: (info: any, accept: () => ClientChannel, reject: () => void) => void;
}

function log(msg: string) {
  console.log(`[PortForward] ${msg}`);
}

function validPort(value: any): value is number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

/**
 * SSH 端口转发服务（本地隧道 -L / 远程转发 -R）
 *
 * 复用 SSHService 已建立的 ssh2 Client，不新建连接：
 * - local：在本机 listen，每个接入的连接通过 client.forwardOut 打到 SSH 服务器侧的目标
 * - remote：通过 client.forwardIn 让 SSH 服务器监听，tcpip 事件到达后连本机目标
 *
 * 生命周期跟随 SSH 会话：会话关闭时由 SSHService 的 close hook 停止该会话全部隧道。
 */
export class PortForwardService {
  /** sessionId -> ruleId -> tunnel */
  private tunnels: Map<string, Map<string, ActiveTunnel>> = new Map();
  /** 已给哪些 Client 挂过 tcpip 监听，避免重复注册 */
  private tcpipClients: Set<Client> = new Set();

  constructor(private sshService: SSHService) {}

  /** 会话建立后自动启动所有 enabled && autoStart 的规则 */
  startAuto(sessionId: string, connection: ConnectionEntity): void {
    const rules = (connection.portForwards || []).filter(r => r && r.enabled !== false && r.autoStart !== false);
    if (!rules.length) return;
    log(`session ${sessionId}: auto-starting ${rules.length} rule(s)`);
    for (const rule of rules) {
      this.start(sessionId, rule).catch(err => {
        log(`session ${sessionId} rule ${rule.id} auto-start failed: ${err.message}`);
      });
    }
  }

  /** 列出某会话下所有规则的运行状态 */
  list(sessionId: string): Array<{ ruleId: string; status: string; error?: string; startedAt?: Date; connections?: number }> {
    const sessionMap = this.tunnels.get(sessionId);
    if (!sessionMap) return [];
    return Array.from(sessionMap.values()).map(t => ({
      ruleId: t.rule.id,
      status: t.status,
      error: t.error,
      startedAt: t.startedAt,
      connections: t.channels.size,
    }));
  }

  /** 启动单条规则（幂等：已 active/starting 直接返回） */
  async start(sessionId: string, rule: PortForwardRule): Promise<void> {
    if (!rule || !rule.id) throw new Error('缺少转发规则 id');
    const direction = rule.direction === 'remote' ? 'remote' : 'local';
    if (!validPort(rule.listenPort)) throw new Error(`无效监听端口: ${rule.listenPort}`);
    if (!validPort(rule.targetPort)) throw new Error(`无效目标端口: ${rule.targetPort}`);
    const listenHost = String(rule.listenHost || '127.0.0.1');
    const targetHost = String(rule.targetHost || '127.0.0.1');

    const session = this.sshService.getSession(sessionId);
    if (!session?.client) throw new Error('SSH 会话不存在或已断开');

    let sessionMap = this.tunnels.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map();
      this.tunnels.set(sessionId, sessionMap);
    }
    const existing = sessionMap.get(rule.id);
    if (existing && (existing.status === 'active' || existing.status === 'starting')) {
      log(`rule ${rule.id} already ${existing.status}`);
      return;
    }

    const tunnel: ActiveTunnel = {
      rule: { ...rule, direction, listenHost, targetHost },
      client: session.client,
      channels: new Set(),
      status: 'starting',
      startedAt: new Date(),
    };
    sessionMap.set(rule.id, tunnel);

    try {
      if (direction === 'local') {
        await this.startLocal(tunnel);
      } else {
        await this.startRemote(tunnel);
      }
      tunnel.status = 'active';
      log(`session ${sessionId} rule ${rule.id}: ${direction} ${listenHost}:${rule.listenPort} -> ${targetHost}:${rule.targetPort} active`);
      // 运行期 server error（监听成功之后）也要回收资源、纠正状态
      if (tunnel.server) {
        tunnel.server.on('error', (err: any) => {
          log(`session ${sessionId} rule ${rule.id} runtime error: ${err.message}`);
          this.stop(sessionId, rule.id);
        });
      }
    } catch (err: any) {
      tunnel.status = 'error';
      tunnel.error = err?.message || String(err);
      // forwardIn 失败时 tcpip handler 可能已注册，必须一并回收
      this.destroyTunnel(tunnel);
      sessionMap.delete(rule.id);
      if (sessionMap.size === 0) this.tunnels.delete(sessionId);
      throw err;
    }
  }

  /** 本地转发：本机监听 → client.forwardOut → SSH 服务器侧目标 */
  private startLocal(tunnel: ActiveTunnel): Promise<void> {
    return new Promise((resolve, reject) => {
      const { listenHost, listenPort, targetHost, targetPort } = tunnel.rule;
      const server = net.createServer((socket) => {
        tunnel.channels.add(socket);
        let upstream: ClientChannel | undefined;
        // 本地连接异常断开时同步销毁 SSH channel，避免残留占用 MaxSessions
        socket.on('close', () => {
          tunnel.channels.delete(socket);
          if (upstream) {
            tunnel.channels.delete(upstream);
            try { upstream.destroy(); } catch (_) {}
          }
        });
        socket.on('error', () => { /* 交给 close 统一清理 */ });

        tunnel.client.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
          if (err || !stream) {
            socket.destroy();
            log(`forwardOut failed: ${err?.message || 'no stream'}`);
            return;
          }
          upstream = stream;
          tunnel.channels.add(stream);
          stream.on('close', () => {
            tunnel.channels.delete(stream);
            if (upstream === stream) upstream = undefined;
            try { socket.destroy(); } catch (_) {}
          });
          stream.on('error', () => { /* 交给 close 统一清理 */ });
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

  /** 远程转发：client.forwardIn → 服务器监听 → tcpip 事件 → 本机目标 */
  private async startRemote(tunnel: ActiveTunnel): Promise<void> {
    const { listenHost, listenPort, targetHost, targetPort } = tunnel.rule;
    const client = tunnel.client;
    // 每个 Client 只注册一个 tcpip 处理器，按监听端口分发到对应规则
    if (!this.tcpipClients.has(client)) {
      const handler = (info: any, accept: () => ClientChannel, reject: () => void) => {
        const port = Number(info?.port);
        const matched = this.findRemoteTunnelByPort(client, port);
        if (!matched) {
          log(`tcpip request for unmatched port ${port}, rejecting`);
          try { reject(); } catch (_) {}
          return;
        }
        const upstream = accept();
        const downstream = net.connect(matched.rule.targetPort, matched.rule.targetHost, () => {
          matched.channels.add(upstream);
          matched.channels.add(downstream);
          upstream.pipe(downstream).pipe(upstream);
        });
        downstream.on('error', (err) => {
          log(`tcpip downstream ${matched.rule.targetHost}:${matched.rule.targetPort} error: ${err.message}`);
          upstream.destroy();
        });
        upstream.on('error', () => downstream.destroy());
        upstream.on('close', () => {
          matched.channels.delete(upstream);
          downstream.destroy();
        });
        downstream.on('close', () => {
          matched.channels.delete(downstream);
          try { upstream.destroy(); } catch (_) {}
        });
      };
      // ssh2 的类型定义未声明 tcpip 事件（运行时支持），此处用 any 绕过
      (client as any).on('tcpip', handler);
      tunnel.tcpipHandler = handler;
      this.remoteHandlers.set(client, handler);
      this.tcpipClients.add(client);
    } else {
      // 复用已注册的 handler，当前 tunnel 关闭时不应移除共享 handler；
      // 由最后一个 remote tunnel 关闭时统一移除（见 stopAll / destroyTunnel）。
      tunnel.tcpipHandler = this.sharedHandlerFor(client);
    }

    await new Promise<void>((resolve, reject) => {
      client.forwardIn(listenHost, listenPort, (err?: Error) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private remoteHandlers: Map<Client, (info: any, accept: () => ClientChannel, reject: () => void) => void> = new Map();

  private sharedHandlerFor(client: Client) {
    return this.remoteHandlers.get(client);
  }

  private findRemoteTunnelByPort(client: Client, port: number): ActiveTunnel | undefined {
    for (const sessionMap of this.tunnels.values()) {
      for (const t of sessionMap.values()) {
        if (t.client === client && t.rule.direction === 'remote' && t.rule.listenPort === port && t.status === 'active') {
          return t;
        }
      }
    }
    return undefined;
  }

  /** 停止单条规则 */
  stop(sessionId: string, ruleId: string): void {
    const sessionMap = this.tunnels.get(sessionId);
    const tunnel = sessionMap?.get(ruleId);
    if (!tunnel || !sessionMap) return;
    this.destroyTunnel(tunnel);
    sessionMap.delete(ruleId);
    if (sessionMap.size === 0) this.tunnels.delete(sessionId);
    log(`session ${sessionId} rule ${ruleId}: stopped`);
  }

  /** 停止会话的全部规则（会话关闭时调用） */
  stopAll(sessionId: string): void {
    const sessionMap = this.tunnels.get(sessionId);
    if (!sessionMap) return;
    for (const [ruleId, tunnel] of Array.from(sessionMap.entries())) {
      this.destroyTunnel(tunnel);
      sessionMap.delete(ruleId);
    }
    this.tunnels.delete(sessionId);
    log(`session ${sessionId}: all tunnels stopped`);
  }

  private destroyTunnel(tunnel: ActiveTunnel): void {
    try { tunnel.server?.close(); } catch (_) {}
    for (const ch of Array.from(tunnel.channels)) {
      try { ch.destroy(); } catch (_) {}
    }
    tunnel.channels.clear();
    // 远程转发：通知 SSH 服务器取消监听（best effort）
    if (tunnel.rule.direction === 'remote') {
      try {
        tunnel.client.unforwardIn(tunnel.rule.listenHost, tunnel.rule.listenPort, () => {});
      } catch (_) {}
      // 仅当该 client 已无其它 remote tunnel 时才移除共享 tcpip handler
      const stillUsed = Array.from(this.tunnels.values()).some(m =>
        Array.from(m.values()).some(t => t.client === tunnel.client && t.rule.direction === 'remote' && t !== tunnel)
      );
      if (!stillUsed) {
        const handler = this.remoteHandlers.get(tunnel.client) || tunnel.tcpipHandler;
        if (handler) {
          try { (tunnel.client as any).removeListener('tcpip', handler); } catch (_) {}
        }
        this.remoteHandlers.delete(tunnel.client);
        this.tcpipClients.delete(tunnel.client);
      }
    }
  }

  /** 服务销毁 */
  destroy(): void {
    for (const sessionId of Array.from(this.tunnels.keys())) this.stopAll(sessionId);
    this.tcpipClients.clear();
    this.remoteHandlers.clear();
  }
}
