import { Client, type ClientChannel } from 'ssh2';
import { ConnectionService } from './connection.service';
import { ConnectionEntity } from '../model/connection.entity';
import { spawn, type ChildProcess } from 'child_process';
import { execSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { getDataPath } from '../utils/data-dir';

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
    this.sessionsFilePath = getDataPath('sessions.json');
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
      // Skip MOTD capture for startup script sessions (jump host) - system info collected on demand
      if (!connection.startupScript?.trim()) {
        this.startMOTDCapture(sessionId);
      } else {
        console.log(`[SSH] Skipping MOTD capture for jump host session ${sessionId}, will collect on demand`);
      }
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
            const isWindows = process.platform === 'win32';
            
            // Windows: 设置 UTF-8 代码页环境变量，避免中文乱码
            if (isWindows) {
              cleanEnv.CHCP = '65001';
            }
            
            const ptyProcess = nodePty.spawn(shell, 
              isWindows && shell.includes('powershell') ? ['-NoLogo'] : [],
              {
                name: isWindows ? 'xterm' : 'xterm-256color',
                cols,
                rows,
                cwd: homeDir,
                env: cleanEnv,
                useBinary: !isWindows, // Windows 不支持二进制模式
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

            // Windows: 启动时执行 chcp 65001 设置 UTF-8 编码
            if (isWindows) {
              setTimeout(() => {
                ptyProcess.write('chcp 65001\r\n');
                // PowerShell: 额外设置输出编码
                if (shell.includes('powershell')) {
                  ptyProcess.write('[Console]::OutputEncoding = [Text.Encoding]::UTF8\r\n');
                }
                ptyProcess.write('cls\r\n');
              }, 100);
            }

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

        const shellOpts: any = {
          term: 'xterm-256color',
          cols,
          rows,
        };
        // Enable SSH agent forwarding in the shell session
        if (connection.forwardAgent) {
          shellOpts.agentForward = true;
        }

        client.shell(shellOpts, (err: Error | undefined, stream: ClientChannel) => {
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

          // Execute startup script if configured (e.g. jump host SSH hop)
          if (connection.startupScript && connection.startupScript.trim()) {
            const script = connection.startupScript.trim();
            console.log(`[SSH] Executing startup script for session ${sessionId}: ${script.substring(0, 80)}`);
            // Delay slightly to let the remote shell fully initialize
            setTimeout(() => {
              if (this.sessions.has(sessionId)) {
                stream.write(script + '\n');
              }
            }, 800);
          }

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
      // 优先 PowerShell，降级到 cmd
      const pwsh = process.env.PWSH || process.env.PSModulePath;
      if (pwsh) {
        try {
          execSync('pwsh --version', { encoding: 'utf-8', timeout: 2000 });
          return 'pwsh.exe'; // PowerShell 7+
        } catch {
          // fall through
        }
      }
      return 'powershell.exe'; // Windows PowerShell 5.x
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
   * 对于 startupScript（跳板机）会话，始终主动采集以确保获取目标服务器信息
   */
  async getSystemContext(sessionId: string): Promise<string> {
    const meta = this.sessionMetadata.get(sessionId);

    // Check if this is a jump host session (has startupScript)
    let isJumpHost = false;
    if (meta?.connectionId) {
      try {
        const conn = await this.connectionService.getConnectionById(meta.connectionId);
        isJumpHost = !!conn?.startupScript?.trim();
      } catch { /* ignore */ }
    }

    // For jump host sessions, always actively collect (cached data may be from jump host, not target)
    if (isJumpHost) {
      // Wait for startup script SSH hop to complete before collecting.
      // The startup script is sent at 800ms after shell ready; the SSH hop itself takes 2-5s.
      // Without this delay, the echo command may run on the jump host before the hop completes.
      const sessionAge = Date.now() - meta!.createdAt.getTime();
      const JUMP_HOST_SETTLE_DELAY = 8000; // 8 seconds total after session creation
      if (sessionAge < JUMP_HOST_SETTLE_DELAY) {
        const waitMs = JUMP_HOST_SETTLE_DELAY - sessionAge;
        console.log(`[SSH] Jump host session ${sessionId}: waiting ${waitMs}ms for SSH hop to complete before collecting system info`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
      console.log(`[SSH] Jump host session ${sessionId}: actively collecting target server info`);
      const info = await this.activeCollectRemoteSystemInfo(sessionId);
      if (info && meta) {
        meta.systemContext = info;
        this.saveSessionsToDisk();
      }
      return info;
    }

    // Normal sessions: use cache if available
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
      // SSH 但没有 pending，主动运行命令采集系统信息
      info = await this.activeCollectRemoteSystemInfo(sessionId);
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
   * Active system info collection for SSH sessions (e.g. jump host)
   * Sends a compact command to the remote terminal and captures the output
   */
  private async activeCollectRemoteSystemInfo(sessionId: string): Promise<string> {
    const marker = '__AICMD_SYS__';
    const cmd = `echo "${marker}:$(uname -s 2>/dev/null || echo unknown):$(uname -r 2>/dev/null || echo unknown):$(hostname 2>/dev/null || echo unknown):$(whoami 2>/dev/null || echo unknown):$SHELL:$(uname -m 2>/dev/null || echo unknown)"`;
    try {
      // Start capture, then send the command
      // Use longer timeout (5s) to account for slow SSH connections and MOTD output
      const outputPromise = this.captureOutput(sessionId, 5000);
      this.writeData(sessionId, cmd + '\n');
      const output = await outputPromise;
      // Clean ANSI escape codes for more reliable marker matching
      const cleaned = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\].*?\x07/g, '').replace(/\r/g, '');
      // Extract our marker line
      for (const line of cleaned.split('\n')) {
        const trimmed = line.trim();
        // Handle possible command echo: skip lines that still contain the raw command prefix
        if (trimmed.includes(marker + ':') && !trimmed.startsWith('echo')) {
          const markerIdx = trimmed.indexOf(marker + ':');
          const markerLine = trimmed.substring(markerIdx);
          const parts = markerLine.split(':');
          if (parts.length >= 7) {
            const info: Record<string, string> = {
              'OS': parts[1],
              'Kernel': parts[2],
              'Hostname': parts[3],
              'User': parts[4],
              'Shell': parts[5],
              'Arch': parts[6] || '',
            };
            const lines = ['System environment info:'];
            for (const [key, val] of Object.entries(info)) {
              if (val && val !== 'unknown') lines.push(`- ${key}: ${val}`);
            }
            const result = lines.join('\n');
            console.log(`[SSH] Active system info collected for ${sessionId}:`, result);
            return result;
          }
        }
      }
      console.warn(`[SSH] Marker not found in output for ${sessionId}, marker=${marker}`);
      return '';
    } catch (e) {
      console.warn(`[SSH] Failed to actively collect system info for ${sessionId}:`, e);
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
    if (process.platform === 'win32') {
      return this.collectWindowsSystemInfo();
    }
    return this.collectUnixSystemInfo();
  }

  /**
   * 采集 Windows 系统环境信息（PowerShell）
   */
  private collectWindowsSystemInfo(): string {
    const psScript = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8;
$os = (Get-CimInstance Win32_OperatingSystem).Caption
$kernel = [System.Environment]::OSVersion.Version.ToString()
$hostname = $env:COMPUTERNAME
$arch = $env:PROCESSOR_ARCHITECTURE
$user = $env:USERNAME
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$cpuCores = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
$memBytes = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$memGB = [math]::Round($memBytes / 1GB, 1)
$nodeVer = try { & node --version 2>$null } catch { 'none' }
$pyVer = try { & python --version 2>$null } catch { try { & python3 --version 2>$null } catch { 'none' } }
$dockerVer = try { & docker --version 2>$null } catch { 'none' }
Write-Output "__OS__: $os"
Write-Output "__KERNEL__: $kernel"
Write-Output "__HOSTNAME__: $hostname"
Write-Output "__SHELL__: PowerShell"
Write-Output "__ARCH__: $arch"
Write-Output "__USER__: $user"
Write-Output "__CPU__: $cpu ($cpuCores cores)"
Write-Output "__MEM__: \${memGB}GB"
Write-Output "__NODE__: $nodeVer"
Write-Output "__PYTHON__: $pyVer"
Write-Output "__DOCKER__: $dockerVer"
`.trim();

    try {
      const result = execSync(
        `chcp 65001 >nul & powershell.exe -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      return this.formatSystemInfo(result);
    } catch {
      try {
        const basic = execSync('chcp 65001 >nul & systeminfo | findstr /B /C:"OS Name" /C:"OS Version" /C:"System Type"', {
          encoding: 'utf-8', timeout: 15000,
        });
        return `Basic system info:\n${basic}`;
      } catch {
        return 'Unable to collect system info';
      }
    }
  }

  /**
   * 采集 Unix/macOS/Linux 系统环境信息（Bash）
   */
  private collectUnixSystemInfo(): string {
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
      const result = execSync(commands, { encoding: 'utf-8', timeout: 5000, shell: process.platform === 'win32' ? undefined : '/bin/bash' });
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
      // 方式1: 通过 notifyOutput 机制捕获
      this.addOutputListener(sessionId, listener);

      // 方式2: 直接在 SSH stream 上监听（绕过 hasBinary 检查）
      const session = this.sessions.get(sessionId);
      let streamHandler: ((chunk: Buffer) => void) | null = null;
      if (session?.stream) {
        streamHandler = (chunk: Buffer) => {
          // 只捕获可打印文本部分
          const text = chunk.toString('utf-8');
          output += text;
        };
        session.stream.on('data', streamHandler);
      }

      setTimeout(() => {
        this.removeOutputListener(sessionId);
        if (streamHandler && session?.stream) {
          session.stream.removeListener('data', streamHandler);
        }
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
   * 获取 SSH 会话的当前工作目录（通过 shell stream 执行 pwd）
   */
  async getSessionCwd(sessionId: string): Promise<string> {
    const marker = `__AICmd_CWD_${Date.now()}__`;
    // 前加空格避免 shell 回显（HISTCONTROL=ignorespace），先启动捕获再发命令
    const outputPromise = this.captureOutput(sessionId, 1500);
    this.writeData(sessionId, ` echo ${marker}:$(pwd)\n`);
    const output = await outputPromise;
    console.log(`[SSH] getSessionCwd: raw output: ${JSON.stringify(output.substring(0, 300))}`);
    const cleaned = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '');
    for (const line of cleaned.split('\n')) {
      const trimmed = line.trim();
      // 只匹配以 marker 开头的行（实际输出），跳过 echo 回显行（以 echo 开头）
      if (trimmed.startsWith(marker + ':')) {
        const cwd = trimmed.substring(marker.length + 1).trim();
        if (cwd && !cwd.includes('$(pwd)')) {
          console.log(`[SSH] getSessionCwd parsed: '${cwd}' from line: '${trimmed}'`);
          return cwd;
        }
      }
    }
    console.log(`[SSH] getSessionCwd: no marker found in cleaned output: ${JSON.stringify(cleaned.substring(0, 300))}`);
    return '';
  }

  /**
   * 通过 SFTP 上传文件到远程服务器（绕过 PTY，速度快）
   * @param sessionId 会话 ID
   * @param remotePath 远程文件路径（相对路径或绝对路径）
   * @param base64Data 文件的 base64 编码数据
   * @returns 写入的字节数
   */
  async uploadFileViaSftp(sessionId: string, remotePath: string, fileBuffer: Buffer): Promise<number> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);
    if (session.type !== 'ssh' || !session.client) {
      throw new Error('SFTP upload only supported for SSH sessions');
    }

    console.log(`[SSH] SFTP upload: ${fileBuffer.length} bytes`);

    // 解析相对路径：先通过 shell 获取交互式 CWD（而非 SFTP 默认的 home 目录）
    let fullPath = remotePath;
    if (!remotePath.startsWith('/')) {
      try {
        console.log(`[SSH] Getting shell CWD...`);
        const cwd = await this.getSessionCwd(sessionId);
        console.log(`[SSH] Shell CWD: '${cwd}'`);
        if (cwd) {
          fullPath = `${cwd}/${remotePath}`;
        } else {
          console.warn(`[SSH] Shell CWD empty, falling back to SFTP realpath`);
          // fallback: 用 SFTP realpath（默认 home 目录）
          fullPath = await new Promise<string>((resolve) => {
            session.client!.sftp((err: Error | undefined, sftp: any) => {
              if (err) { resolve(remotePath); return; }
              sftp.realpath('.', (rpErr: Error | undefined, absCwd: string) => {
                resolve(rpErr ? remotePath : `${absCwd}/${remotePath}`);
              });
            });
          });
        }
      } catch (cwdErr: any) {
        console.warn(`[SSH] getSessionCwd failed: ${cwdErr.message}, using relative path`);
      }
    }
    console.log(`[SSH] SFTP upload path: ${remotePath} -> ${fullPath}`);

    // 使用 Promise + 超时包装（120秒，大文件需要更多时间）
    const SFTP_TIMEOUT = 120000;
    return new Promise<number>((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; reject(new Error(`SFTP timeout after ${SFTP_TIMEOUT / 1000}s`)); }
      }, SFTP_TIMEOUT);

      const finish = (err: Error | null, bytes?: number) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) reject(err); else resolve(bytes!);
      };

      const doSftpWrite = (targetPath: string, callback: (err: Error | null) => void) => {
        console.log(`[SSH] SFTP opening subsystem...`);
        session.client!.sftp((sftpErr: Error | undefined, sftp: any) => {
          if (done) return;
          if (sftpErr) {
            callback(new Error('SFTP init failed: ' + sftpErr.message));
            return;
          }
          console.log(`[SSH] SFTP writing ${fileBuffer.length} bytes to ${targetPath}...`);

          sftp.open(targetPath, 'w', (openErr: Error | undefined, fd: number) => {
            if (done) return;
            if (openErr) {
              console.error(`[SSH] SFTP open error: ${openErr.message}`);
              callback(new Error('SFTP open failed: ' + openErr.message));
              return;
            }

            sftp.write(fd, fileBuffer, 0, fileBuffer.length, 0, (writeErr: Error | undefined) => {
              if (done) return;
              if (writeErr) {
                console.error(`[SSH] SFTP write error: ${writeErr.message}`);
                sftp.close(fd, () => {});
                callback(new Error('SFTP write failed: ' + writeErr.message));
                return;
              }

              sftp.close(fd, (closeErr: Error | undefined) => {
                if (done) return;
                if (closeErr) {
                  callback(new Error('SFTP close failed: ' + closeErr.message));
                  return;
                }
                callback(null);
              });
            });
          });
        });
      };

      // 先尝试直接写入目标路径
      doSftpWrite(fullPath, (err) => {
        if (done) return;
        if (!err) {
          // 直接写入成功，验证文件
          console.log(`[SSH] SFTP direct write succeeded, verifying...`);
          session.client!.sftp((_, sftp) => {
            sftp.stat(fullPath, (statErr: Error | undefined, stats: any) => {
              if (statErr || stats.size !== fileBuffer.length) {
                finish(new Error('SFTP verify failed'));
              } else {
                console.log(`[SSH] SFTP upload verified: ${fullPath} (${stats.size} bytes)`);
                finish(null, fileBuffer.length);
              }
            });
          });
          return;
        }

        // 权限不足 → fallback: 写入 /tmp 再用 shell mv
        if (err.message.includes('Permission denied') || err.message.includes('permission')) {
          const tmpPath = `/tmp/.aicmd_upload_${Date.now()}`;
          console.log(`[SSH] Permission denied on ${fullPath}, falling back to ${tmpPath} + mv`);

          doSftpWrite(tmpPath, async (tmpErr) => {
            if (done) return;
            if (tmpErr) {
              finish(new Error('SFTP fallback write failed: ' + tmpErr.message));
              return;
            }

            // 通过已有 shell stream 执行 mv（避免 exec channel 挂起）
            try {
              const mvCmd = `mv -f '${tmpPath}' '${fullPath}'`;
              console.log(`[SSH] Shell exec: ${mvCmd}`);
              const mvMarker = `__AICmd_MV_${Date.now()}__`;
              const captureP = this.captureOutput(sessionId, 5000);
              this.writeData(sessionId, `${mvCmd} && echo ${mvMarker}:OK || echo ${mvMarker}:FAIL\n`);
              const mvOutput = await captureP;
              console.log(`[SSH] mv output: ${JSON.stringify(mvOutput.substring(0, 200))}`);

              if (mvOutput.includes(`${mvMarker}:OK`)) {
                console.log(`[SSH] SFTP upload via mv: ${fullPath} (${fileBuffer.length} bytes)`);
                finish(null, fileBuffer.length);
                return;
              }

              // mv 失败，尝试 sudo mv
              console.log(`[SSH] mv failed, trying sudo mv...`);
              const sudoMarker = `__AICmd_SUDO_${Date.now()}__`;
              const sudoCaptureP = this.captureOutput(sessionId, 5000);
              this.writeData(sessionId, `sudo mv -f '${tmpPath}' '${fullPath}' && echo ${sudoMarker}:OK || echo ${sudoMarker}:FAIL\n`);
              const sudoOutput = await sudoCaptureP;
              console.log(`[SSH] sudo mv output: ${JSON.stringify(sudoOutput.substring(0, 200))}`);

              if (sudoOutput.includes(`${sudoMarker}:OK`)) {
                console.log(`[SSH] SFTP upload via sudo mv: ${fullPath} (${fileBuffer.length} bytes)`);
                finish(null, fileBuffer.length);
              } else {
                finish(new Error(`Upload failed: cannot write to ${fullPath}`));
              }
            } catch (mvErr: any) {
              finish(new Error('Shell mv failed: ' + mvErr.message));
            }
          });
        } else {
          finish(err);
        }
      });
    });
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
