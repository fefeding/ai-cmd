import { Client, type ClientChannel } from 'ssh2';
import { ConnectionService } from './connection.service';
import { ConnectionEntity } from '../model/connection.entity';
import { spawn, type ChildProcess } from 'child_process';
import { execSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// 尝试加载 node-pty，如果可用则使用 PTY 模式
let nodePty: any = null;
try {
  nodePty = require('node-pty');
} catch (e) {
  console.warn('[SSH] node-pty 不可用，本地 Shell 将使用降级模式（无 PTY）');
}

/**
 * 会话接口（统一 SSH 和本地 shell）
 */
interface TerminalSession {
  id: string;
  connectionId: string;
  type: 'ssh' | 'local';
  name: string;
  // SSH 特有
  client?: Client;
  stream?: ClientChannel;
  // 本地 shell: node-pty 实例
  pty?: any;
  // 本地 shell 降级: child_process
  childProcess?: ChildProcess;
  createdAt: Date;
}

/** Session 元数据（用于在 server 端持久化 tab 信息） */
interface SessionMetadata {
  sessionId: string;
  connectionId: string;
  type: 'ssh' | 'local';
  name: string;
  createdAt: Date;
  systemContext?: string;
}

/** 会话信息（用于返回给前端） */
export interface SessionInfo {
  sessionId: string;
  connectionId: string;
  type: 'ssh' | 'local';
  name: string;
  createdAt: Date;
  systemContext?: string;
}

/**
 * 终端会话管理服务
 * 支持 SSH 远程连接和本地 Shell
 */
export class SSHService {
  private sessions: Map<string, TerminalSession> = new Map();
  private sessionMetadata: Map<string, SessionMetadata> = new Map();
  private connectionService: ConnectionService;
  private outputListeners: Map<string, (data: string) => void> = new Map();
  /** SSH 会话 MOTD 捕获 Promise（连接后自动后台采集） */
  private pendingMOTDCaptures: Map<string, Promise<string>> = new Map();
  /** Session 元数据持久化文件路径 */
  private sessionsFilePath: string;

  constructor(connectionService: ConnectionService) {
    this.connectionService = connectionService;
    const dataDir = process.env.fterm_DATA_DIR || path.join(os.homedir(), '.fterm');
    this.sessionsFilePath = path.join(dataDir, 'sessions.json');
    this.loadSessionsFromDisk();
  }

  /**
   * 创建会话（自动判断 SSH 或本地 shell）
   */
  async createSession(sessionId: string, connectionId: string, cols: number = 80, rows: number = 24, name?: string): Promise<TerminalSession> {
    // 如果已存在同 ID 的会话，先关闭
    if (this.sessions.has(sessionId)) {
      this.closeSession(sessionId);
    }

    // 本地 Shell 使用特殊 connectionId
    if (connectionId === '__local__') {
      const localConn: ConnectionEntity = {
        id: '__local__',
        name: name || '本地 Shell',
        type: 'local',
        host: '',
        port: 22,
        username: '',
        authType: 'password',
        shell: '',
        terminal: { cols: 80, rows: 24, fontSize: 14, fontFamily: '', theme: 'dark', cursorStyle: 'block' },
        options: {},
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const localSession = await this.createLocalSession(sessionId, connectionId, localConn, cols, rows, name);
      // 保存 session 元数据到 server 端
      this.sessionMetadata.set(sessionId, {
        sessionId,
        connectionId,
        type: localSession.type,
        name: localSession.name,
        createdAt: localSession.createdAt,
        systemContext: this.collectLocalSystemInfo(),
      });
      this.saveSessionsToDisk();
      return localSession;
    }

    const connection = await this.connectionService.getConnectionById(connectionId);
    if (!connection) {
      throw new Error('连接配置不存在');
    }

    let session: TerminalSession;
    if (connection.type === 'local') {
      session = await this.createLocalSession(sessionId, connectionId, connection, cols, rows, name);
    } else {
      session = await this.createSSHSession(sessionId, connectionId, connection, cols, rows, name);
    }

    // 保存 session 元数据（SSH 会话的 systemContext 通过 MOTD 自动采集）
    this.sessionMetadata.set(sessionId, {
      sessionId,
      connectionId,
      type: session.type,
      name: session.name,
      createdAt: session.createdAt,
      systemContext: session.type === 'local' ? this.collectLocalSystemInfo() : '',
    });
    this.saveSessionsToDisk();

    // SSH 会话：后台自动捕获 MOTD 作为系统信息
    if (session.type === 'ssh') {
      this.startMOTDCapture(sessionId);
    }

    return session;
  }

  /**
   * 创建本地 Shell 会话（优先使用 node-pty，降级使用 child_process.spawn）
   */
  private createLocalSession(sessionId: string, connectionId: string, connection: ConnectionEntity, cols: number, rows: number, name?: string): Promise<TerminalSession> {
    return new Promise<TerminalSession>((resolve, reject) => {
      try {
        const sessionName = name || connection.name || '本地 Shell';
        const shell = connection.shell || this.getDefaultShell();
        const homeDir = os.homedir();

        // 构建干净的 Shell 环境（过滤掉 Node.js / npm 相关变量，避免 nvm 等工具警告）
        const cleanEnv = this.buildShellEnv(cols, rows);

        // 优先使用 node-pty（支持真正的 PTY，有回显、提示符、颜色等）
        if (nodePty) {
          try {
            const ptyProcess = nodePty.spawn(shell, [], {
              name: 'xterm-256color',
              cols,
              rows,
              cwd: homeDir,
              env: cleanEnv,
              useBinary: true, // 启用二进制模式，保留 ZMODEM 等协议数据
            });

            const session: TerminalSession = {
              id: sessionId,
              connectionId,
              type: 'local',
              name: sessionName,
              pty: ptyProcess,
              createdAt: new Date(),
            };

            this.sessions.set(sessionId, session);

            ptyProcess.onExit(() => {
              this.sessions.delete(sessionId);
            });

            resolve(session);
            return;
          } catch (ptyErr) {
            console.warn('[SSH] node-pty 创建失败，降级到 pipe 模式:', (ptyErr as Error).message);
          }
        }

        // 降级模式：使用 child_process.spawn（无 PTY，功能受限）
        const child = spawn(shell, [], {
          cwd: homeDir,
          env: cleanEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const session: TerminalSession = {
          id: sessionId,
          connectionId,
          type: 'local',
          name: sessionName,
          childProcess: child,
          createdAt: new Date(),
        };

        this.sessions.set(sessionId, session);

        child.on('exit', () => {
          this.sessions.delete(sessionId);
        });

        child.on('error', (err) => {
          console.error(`[SSH] Local shell error:`, err);
          this.sessions.delete(sessionId);
        });

        resolve(session);
      } catch (e) {
        reject(new Error('创建本地 Shell 失败: ' + (e as Error).message));
      }
    });
  }

  /**
   * 创建 SSH 会话
   */
  private createSSHSession(sessionId: string, connectionId: string, connection: ConnectionEntity, cols: number, rows: number, name?: string): Promise<TerminalSession> {
    return new Promise<TerminalSession>((resolve, reject) => {
      const sshConfig = this.connectionService.getSSHConfig(connection);
      const client = new Client();
      const sessionName = name || connection.name || 'SSH';

      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('SSH 连接超时'));
      }, 30000);

      client.on('ready', () => {
        clearTimeout(timeout);

        client.shell({
          term: 'xterm-256color',
          cols,
          rows,
        }, (err: Error | undefined, stream: ClientChannel) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          const session: TerminalSession = {
            id: sessionId,
            connectionId,
            type: 'ssh',
            name: sessionName,
            client,
            stream,
            createdAt: new Date(),
          };

          this.sessions.set(sessionId, session);

          stream.on('close', () => {
            this.sessions.delete(sessionId);
          });

          resolve(session);
        });
      }).on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      }).connect(sshConfig);
    });
  }

  /**
   * 获取默认 Shell
   */
  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/sh';
  }

  /**
   * 构建干净的 Shell 环境变量
   * 过滤掉 Node.js / npm / pnpm 相关变量，避免子 shell 出现 nvm 等工具警告
   */
  private buildShellEnv(cols: number, rows: number): Record<string, string> {
    const skipPrefixes = [
      'npm_', 'NPM_', 'pnpm_', 'PNPM_',
      'NODE_', 'node_',
    ];
    const skipExact = new Set([
      'INIT_CWD', 'PWD',
    ]);

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue;
      if (skipExact.has(key)) continue;
      if (skipPrefixes.some(p => key.startsWith(p))) continue;
      env[key] = value;
    }

    // 设置终端必要变量
    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';
    env.COLUMNS = String(cols);
    env.LINES = String(rows);

    return env;
  }

  /**
   * 获取所有会话信息列表（从 sessionMetadata 读取）
   */
  getSessions(): SessionInfo[] {
    const sessions: SessionInfo[] = [];
    for (const [_, meta] of this.sessionMetadata) {
      sessions.push({
        sessionId: meta.sessionId,
        connectionId: meta.connectionId,
        type: meta.type,
        name: meta.name,
        createdAt: meta.createdAt,
        systemContext: meta.systemContext,
      });
    }
    return sessions;
  }

  /**
   * 重命名会话
   */
  renameSession(sessionId: string, name: string): void {
    // 更新内存中的 session 名称
    const session = this.sessions.get(sessionId);
    if (session) {
      session.name = name;
    }
    // 更新元数据
    const meta = this.sessionMetadata.get(sessionId);
    if (meta) {
      meta.name = name;
      this.saveSessionsToDisk();
    }
  }

  /**
   * 删除会话（关闭进程并从 server 端移除 metadata）
   */
  deleteSession(sessionId: string): void {
    // 先关闭进程
    this.closeSession(sessionId);
    // 再删除元数据
    this.sessionMetadata.delete(sessionId);
    this.saveSessionsToDisk();
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ========== Session 元数据持久化 ==========

  /**
   * 从磁盘加载 session 元数据
   */
  private loadSessionsFromDisk(): void {
    try {
      if (fs.existsSync(this.sessionsFilePath)) {
        const raw = fs.readFileSync(this.sessionsFilePath, 'utf-8');
        const list: any[] = JSON.parse(raw);
        for (const item of list) {
          this.sessionMetadata.set(item.sessionId, {
            sessionId: item.sessionId,
            connectionId: item.connectionId,
            type: item.type,
            name: item.name,
            createdAt: new Date(item.createdAt),
            systemContext: item.systemContext,
          });
        }
        console.log(`[SSH] Loaded ${list.length} session(s) from disk`);
      }
    } catch (error) {
      console.error('[SSH] Failed to load sessions from disk:', error);
    }
  }

  /**
   * 将 session 元数据写入磁盘
   */
  private saveSessionsToDisk(): void {
    try {
      const list = Array.from(this.sessionMetadata.values()).map(m => ({
        sessionId: m.sessionId,
        connectionId: m.connectionId,
        type: m.type,
        name: m.name,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
        systemContext: m.systemContext,
      }));
      fs.writeFileSync(this.sessionsFilePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (error) {
      console.error('[SSH] Failed to save sessions to disk:', error);
    }
  }

  // ========== 系统环境自动采集 ==========

  /**
   * 获取会话的系统上下文（确保每次都有）
   * 如果 session 没有缓存的环境信息，自动采集并持久化
   */
  async getSystemContext(sessionId: string): Promise<string> {
    const meta = this.sessionMetadata.get(sessionId);
    if (meta?.systemContext) {
      return meta.systemContext;
    }

    // SSH 会话：等待后台 MOTD 捕获完成
    const pending = this.pendingMOTDCaptures.get(sessionId);
    if (pending) {
      const info = await pending;
      if (meta) {
        meta.systemContext = info;
        this.saveSessionsToDisk();
      }
      this.pendingMOTDCaptures.delete(sessionId);
      return info;
    }

    // local 会话或未捕获的 SSH 会话
    let info: string;
    if (meta?.type === 'ssh') {
      // SSH 但没有 pending，可能是重启后的旧 session，尝试重新捕获
      info = await this.captureMOTD(sessionId);
    } else {
      info = this.collectLocalSystemInfo();
    }
    if (meta) {
      meta.systemContext = info;
      this.saveSessionsToDisk();
    }
    return info;
  }

  /**
   * 启动后台 MOTD 捕获（不阻塞 session 创建）
   */
  private startMOTDCapture(sessionId: string): void {
    const promise = this.captureMOTD(sessionId);
    this.pendingMOTDCaptures.set(sessionId, promise);
    promise.then((info) => {
      const meta = this.sessionMetadata.get(sessionId);
      if (meta && !meta.systemContext && info) {
        meta.systemContext = info;
        this.saveSessionsToDisk();
      }
    }).catch(() => {});
  }

  /**
   * 捕获 SSH 登录 MOTD 并解析为系统信息
   */
  private async captureMOTD(sessionId: string): Promise<string> {
    try {
      // 等待 3 秒收集 MOTD 输出（SSH 登录后自动显示）
      const output = await this.captureOutput(sessionId, 3000);
      if (output && output.trim()) {
        return this.parseMOTD(output);
      }
      return '';
    } catch {
      return '';
    }
  }

  /**
   * 解析 SSH 登录 MOTD，提取系统环境信息
   * 兼容 Ubuntu/Debian/CentOS/RHEL/Fedora/FreeBSD 等不同发行版格式
   */
  private parseMOTD(motd: string): string {
    const info: Record<string, string> = {};

    // === OS 和内核信息 ===
    // Ubuntu/Debian: "Welcome to Ubuntu 22.04 LTS (GNU/Linux 5.15.0-94-generic x86_64)"
    const welcomeMatch = motd.match(/Welcome to (.+?)\s*\(GNU\/Linux\s+(.+?)\s+(.+?)\)/);
    if (welcomeMatch) {
      info['OS'] = welcomeMatch[1];
      info['Kernel'] = welcomeMatch[2];
      info['Arch'] = welcomeMatch[3];
    }
    // CentOS/RHEL: "Welcome to CentOS Linux release 7.9.2009 (Core)" 或类似
    if (!info['OS']) {
      const centosMatch = motd.match(/Welcome to (.+?release\s+[\d.]+.*)/i);
      if (centosMatch) info['OS'] = centosMatch[1].trim();
    }
    // FreeBSD: "FreeBSD 13.2-RELEASE (GENERIC)"
    if (!info['OS']) {
      const bsdMatch = motd.match(/(FreeBSD|OpenBSD|NetBSD)\s+([\d.]+-\w+)/);
      if (bsdMatch) {
        info['OS'] = bsdMatch[1];
        info['Kernel'] = bsdMatch[2];
      }
    }
    // 通用 Linux: 尝试匹配任意 "Welcome to <OS>"
    if (!info['OS']) {
      const genericWelcome = motd.match(/Welcome to (.+?)(?:\s*[\(\n])/);
      if (genericWelcome) info['OS'] = genericWelcome[1].trim();
    }

    // === 系统指标（Ubuntu landscape 格式，键值对可能在不同行） ===
    // System load
    const loadMatch = motd.match(/System load:\s*(\S+)/);
    if (loadMatch) info['System load'] = loadMatch[1];
    
    // Processes
    const procMatch = motd.match(/Processes:\s*(\d+)/);
    if (procMatch) info['Processes'] = procMatch[1];
    
    // Disk usage - 支持多种格式
    const diskMatch = motd.match(/Usage of (?:\/.+?):\s*(.+?)$/m)
      || motd.match(/\/\s+(?:is\s+using\s+)?(\d+[%\w.]+\s*(?:of\s+[\d.]+\w+)?)/);
    if (diskMatch) info['Disk usage'] = diskMatch[1].trim();
    
    // Memory usage
    const memMatch = motd.match(/Memory usage:\s*(\S+)/);
    if (memMatch) info['Memory usage'] = memMatch[1];
    
    // Swap usage
    const swapMatch = motd.match(/Swap usage:\s*(\S+)/);
    if (swapMatch) info['Swap usage'] = swapMatch[1];
    
    // Temperature (部分系统有)
    const tempMatch = motd.match(/Temperature:\s*(\S+)/);
    if (tempMatch) info['Temperature'] = tempMatch[1];
    
    // IPv4 address - 可能有多个网卡
    const ipMatches = [...motd.matchAll(/IPv4 address for (\w+):\s*(\S+)/g)];
    if (ipMatches.length > 0) {
      if (ipMatches.length === 1) {
        info['IPv4'] = ipMatches[0][2];
      } else {
        info['IPv4'] = ipMatches.map(m => `${m[2]}(${m[1]})`).join(', ');
      }
    }
    // 也尝试匹配 "inet " 格式
    if (!info['IPv4']) {
      const inetMatch = motd.match(/inet\s+([\d.]+)(?!\s*127\.0\.0)/);
      if (inetMatch) info['IPv4'] = inetMatch[1];
    }
    
    // Users logged in
    const usersMatch = motd.match(/Users logged in:\s*(\d+)/);
    if (usersMatch) info['Users logged in'] = usersMatch[1];
    
    // Last login
    const loginMatch = motd.match(/Last login:.+?from\s+([\d.]+)/);
    if (loginMatch) info['Last login from'] = loginMatch[1];
    
    // New release available
    const releaseMatch = motd.match(/New release '(.+?)' available/);
    if (releaseMatch) info['New release available'] = releaseMatch[1];
    
    // Zombie processes
    const zombieMatch = motd.match(/(\d+)\s+zombie processes?/i);
    if (zombieMatch) info['Zombie processes'] = zombieMatch[1];

    // === 通用兜底：从文本中提取 key: value 对 ===
    // 适用于 CentOS/RHEL 等没有固定 landscape 格式的系统
    if (Object.keys(info).length <= 2) {
      const genericKV = motd.matchAll(/^\s*([A-Z][a-zA-Z\s]{1,20}):\s+(.+?)$/gm);
      for (const m of genericKV) {
        const key = m[1].trim();
        const val = m[2].trim();
        if (!val || val.length > 100) continue; // 跳过空值或过长的值
        // 映射常见 key
        const keyMap: Record<string, string> = {
          'System load': 'System load', 'Memory usage': 'Memory usage',
          'Swap usage': 'Swap usage', 'Processes': 'Processes',
          'Users logged in': 'Users logged in', 'Temperature': 'Temperature',
          'Kernel': 'Kernel', 'Hostname': 'Hostname',
          'Uptime': 'Uptime', 'Load average': 'Load average',
        };
        const label = keyMap[key] || key;
        if (!info[label]) info[label] = val;
      }
    }

    // === 最终兜底：如果只匹配到极少信息，保留原始 MOTD 作为上下文 ===
    if (Object.keys(info).length === 0) {
      // 完全没有匹配，返回清理后的原始文本（截取前 800 字符）
      const cleaned = motd.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '').trim();
      return cleaned.substring(0, 800);
    }

    const lines = ['System environment info:'];
    for (const [key, val] of Object.entries(info)) {
      lines.push(`- ${key}: ${val}`);
    }
    return lines.join('\n');
  }

  /**
   * 采集本地系统环境信息（仅用于 local session）
   */
  private collectLocalSystemInfo(): string {
    const commands = [
      'echo "__OS__: $(uname -s 2>/dev/null || echo unknown)"',
      'echo "__KERNEL__: $(uname -r 2>/dev/null || echo unknown)"',
      'echo "__HOSTNAME__: $(hostname 2>/dev/null || echo unknown)"',
      'echo "__SHELL__: $SHELL"',
      'echo "__ARCH__: $(uname -m 2>/dev/null || echo unknown)"',
      'echo "__USER__: $(whoami 2>/dev/null || echo unknown)"',
      'if command -v apt-get >/dev/null 2>&1; then echo "__PM__: apt (Debian/Ubuntu)"; elif command -v yum >/dev/null 2>&1; then echo "__PM__: yum (RHEL/CentOS)"; elif command -v dnf >/dev/null 2>&1; then echo "__PM__: dnf (Fedora)"; elif command -v pacman >/dev/null 2>&1; then echo "__PM__: pacman (Arch)"; elif command -v brew >/dev/null 2>&1; then echo "__PM__: brew (macOS)"; else echo "__PM__: unknown"; fi',
      'if command -v docker >/dev/null 2>&1; then echo "__DOCKER__: $(docker --version 2>/dev/null)"; else echo "__DOCKER__: none"; fi',
      'if command -v nginx >/dev/null 2>&1; then echo "__WEBSERVER__: nginx"; elif command -v httpd >/dev/null 2>&1; then echo "__WEBSERVER__: apache"; elif command -v caddy >/dev/null 2>&1; then echo "__WEBSERVER__: caddy"; else echo "__WEBSERVER__: none"; fi',
      'if command -v mysql >/dev/null 2>&1; then echo "__DB__: mysql"; elif command -v psql >/dev/null 2>&1; then echo "__DB__: postgresql"; elif command -v mongosh >/dev/null 2>&1; then echo "__DB__: mongodb"; else echo "__DB__: none"; fi',
      'echo "__NODE__: $(node --version 2>/dev/null || echo none)"',
      'echo "__PYTHON__: $(python3 --version 2>/dev/null || python --version 2>/dev/null || echo none)"',
      'echo "__CPU__: $(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo unknown) cores"',
      'echo "__MEM__: $(free -h 2>/dev/null | awk \'/Mem:/{print $2}\' || sysctl -n hw.memsize 2>/dev/null | awk \'{printf \\"%.0fGB\\", $1/1024/1024/1024}\' || echo unknown)"',
    ].join('\n');

    try {
      const result = execSync(commands, { encoding: 'utf-8', timeout: 5000, shell: '/bin/bash' });
      return this.formatSystemInfo(result);
    } catch {
      try {
        const basic = execSync('uname -a && whoami && echo $SHELL', { encoding: 'utf-8', timeout: 3000 });
        return `Basic system info:\n${basic}`;
      } catch {
        return 'Unable to collect system info';
      }
    }
  }

  /**
   * 格式化采集结果
   */
  private formatSystemInfo(raw: string): string {
    const map: Record<string, string> = {};
    const labelMap: Record<string, string> = {
      '__OS__': 'OS', '__KERNEL__': 'Kernel', '__HOSTNAME__': 'Hostname',
      '__SHELL__': 'Shell', '__ARCH__': 'Arch', '__USER__': 'User',
      '__PM__': 'Package Manager', '__DOCKER__': 'Docker', '__WEBSERVER__': 'Web Server',
      '__DB__': 'Database', '__FW__': 'Firewall', '__NODE__': 'Node.js',
      '__PYTHON__': 'Python', '__CPU__': 'CPU', '__MEM__': 'Memory',
    };
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^(__\w+__):\s*(.*)/);
      if (match) {
        const val = match[2].trim();
        const label = labelMap[match[1]] || match[1];
        if (val && val !== 'none' && val !== 'unknown') {
          map[label] = val;
        }
      }
    }
    if (Object.keys(map).length === 0) return raw;
    const lines = ['System environment info:'];
    for (const [key, val] of Object.entries(map)) {
      lines.push(`- ${key}: ${val}`);
    }
    return lines.join('\n');
  }

  /**
   * 向会话写入数据（用户输入）
   */
  writeData(sessionId: string, data: string | Buffer): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      if (session.pty) {
        session.pty.write(data);
      } else if (session.type === 'local' && session.childProcess?.stdin) {
        session.childProcess.stdin.write(data);
      } else if (session.stream) {
        session.stream.write(data);
      }
      return true;
    } catch (error) {
      console.error(`写入会话 ${sessionId} 失败:`, error);
      return false;
    }
  }

  /**
   * 注册输出监听器（用于 Agent 捕获终端输出）
   * 注意：此方法不拦截现有 WebSocket 转发，仅添加额外监听
   */
  addOutputListener(sessionId: string, listener: (data: string) => void): void {
    this.outputListeners.set(sessionId, listener);
  }

  /**
   * 移除输出监听器
   */
  removeOutputListener(sessionId: string): void {
    this.outputListeners.delete(sessionId);
  }

  /**
   * 通知输出监听器（由 WebSocket 处理器在收到终端输出时调用）
   */
  notifyOutput(sessionId: string, data: string): void {
    const listener = this.outputListeners.get(sessionId);
    if (listener) {
      try {
        listener(data);
      } catch (e) {
        // 忽略监听器错误
      }
    }
  }

  /**
   * 捕获会话在指定时间内的输出
   * @param sessionId 会话 ID
   * @param timeoutMs 等待时间（毫秒），默认 2000
   * @returns 捕获的输出文本（已去除 ANSI 转义序列）
   */
  captureOutput(sessionId: string, timeoutMs: number = 2000): Promise<string> {
    return new Promise((resolve) => {
      let output = '';
      const listener = (data: string) => {
        output += data;
      };
      this.addOutputListener(sessionId, listener);
      setTimeout(() => {
        this.removeOutputListener(sessionId);
        // 去除 ANSI 转义序列
        resolve(output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\].*?\x07/g, ''));
      }, timeoutMs);
    });
  }

  /**
   * 调整终端窗口大小
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      if (session.pty) {
        session.pty.resize(cols, rows);
      } else if (session.type === 'ssh' && session.stream) {
        session.stream.setWindow(rows, cols, 0, 0);
      }
      return true;
    } catch (error) {
      console.error(`调整终端大小 ${sessionId} 失败:`, error);
      return false;
    }
  }

  /**
   * 关闭会话
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        if (session.pty) {
          session.pty.kill();
        } else if (session.type === 'local' && session.childProcess) {
          session.childProcess.kill('SIGTERM');
        } else {
          session.stream?.end();
          session.client?.end();
        }
      } catch (error) {
        console.error(`关闭会话 ${sessionId} 失败:`, error);
      }
      this.sessions.delete(sessionId);
    }
  }

  /**
   * 关闭所有会话
   */
  closeAllSessions(): void {
    for (const [sessionId] of this.sessions) {
      this.closeSession(sessionId);
    }
  }

  /**
   * 获取活跃会话数量
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 获取所有活跃会话 ID
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
}
