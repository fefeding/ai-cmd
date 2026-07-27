import { Client, type ClientChannel } from 'ssh2';
import { ConnectionService } from './connection.service';
import { ConnectionEntity } from '../model/connection.entity';
import { spawn, type ChildProcess } from 'child_process';
import { execSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { getDataPath } from '../utils/data-dir';
import { shellQuote } from '../utils/shell';

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
  /** 实时跟踪的当前工作目录（通过解析 cd 命令维护，最可靠） */
  cwd?: string;
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

/** 远程文件信息（用于文件管理面板） */
export interface RemoteFileInfo {
  name: string;
  /** 完整路径 */
  path: string;
  size: number;
  /** 修改时间（毫秒时间戳） */
  mtime: number;
  atime: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  /** 数字权限位（如 0o755） */
  mode: number;
  /** ls -l 风格权限字符串（如 'rwxr-xr-x'） */
  permissions: string;
  owner: string;
  group: string;
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
  /** 是否曾在本实例创建过 session（用于区分主进程/渲染进程实例，仅主进程实例执行定时清理） */
  private hasCreatedSession: boolean = false;
  /** 定时清理僵尸 session 的定时器 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(connectionService: ConnectionService) {
    this.connectionService = connectionService;
    this.sessionsFilePath = getDataPath('sessions.json');
    this.loadSessionsFromDisk();
    this.startPeriodicCleanup();
  }

  /**
   * 创建会话（自动判断 SSH 或本地 shell）
   */
  async createSession(sessionId: string, connectionId: string, cols: number = 80, rows: number = 24, name?: string): Promise<TerminalSession> {
    // 标记本实例曾创建过 session（用于定时清理判断）
    this.hasCreatedSession = true;
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
              cwd: homeDir,
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
          cwd: homeDir,
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

          // 连接后后台探测初始 CWD（在 shell 初始化完成后），用于上传时定位当前目录
          setTimeout(() => {
            if (this.sessions.has(sessionId)) this.seedCwd(sessionId);
          }, 1500);

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
   * 注意：由于 Electron 主进程和渲染进程各自有独立的模块实例，
   * 渲染进程实例的 sessionMetadata 可能不含主进程创建的 session，
   * 因此先从磁盘重新加载以确保同步，再执行删除。
   */
  deleteSession(sessionId: string): void {
    // 先关闭进程
    this.closeSession(sessionId);
    // 从磁盘重新加载元数据（确保与主进程实例同步）
    this.loadSessionsFromDisk();
    // 再删除元数据
    const had = this.sessionMetadata.has(sessionId);
    this.sessionMetadata.delete(sessionId);
    console.log(`[SSH] deleteSession: ${sessionId}, had=${had}, remaining: ${this.sessionMetadata.size}, keys=[${Array.from(this.sessionMetadata.keys()).join(', ')}]`);
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
        this.sessionMetadata.clear();
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
        console.log(`[SSH] Loaded ${list.length} session(s) from disk, ids=[${list.map(i => i.sessionId).join(', ')}]`);
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
      const json = JSON.stringify(list, null, 2);
      console.log(`[SSH] saveSessionsToDisk: ${list.length} session(s), path=${this.sessionsFilePath}`);
      fs.writeFileSync(this.sessionsFilePath, json, 'utf-8');
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
      this.writeData(sessionId, cmd + '\r');
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

    // 通过解析用户发出的 cd/pushd/popd 命令，实时维护当前工作目录
    if (typeof data === 'string') {
      this.updateCwdFromInput(session, data);
    }

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
   * 根据用户输入的命令实时更新跟踪的 CWD。
   * 只处理简单形式的 cd/pushd/popd；遇到复杂结构（变量、管道、subshell 等）则重置为未知，
   * 由上传时的探测逻辑兜底。这是获取当前目录最可靠、零延迟的方式。
   */
  private updateCwdFromInput(session: TerminalSession, data: string): void {
    if (!/[\r\n]/.test(data)) return; // 只有回车提交的命令才处理
    const lines = data.split(/[\r\n]+/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(?:cd|pushd|popd)\b(.*)$/);
      if (!m) continue;
      const rest = m[1].trim();
      // 含 ; | && || $ ( ) ` ' " 等无法可靠解析的结构 -> 重置为未知
      if (/[;|&$()`'"]/.test(rest) || rest.includes('~')) {
        session.cwd = undefined;
        continue;
      }
      const target = rest.trim();
      if (!target || target === '-') {
        // cd 无参数回到 home，或 cd - 回到上一个目录：无法可靠跟踪，重置
        session.cwd = undefined;
        continue;
      }
      if (target.startsWith('/')) {
        session.cwd = target;
      } else if (session.cwd && session.cwd.startsWith('/')) {
        session.cwd = path.posix.resolve(session.cwd, target);
      } else {
        // 当前目录未知，无法拼接相对路径，重置为未知
        session.cwd = undefined;
      }
    }
  }

  /** 连接后后台探测一次初始 CWD 并缓存（不阻塞，失败忽略） */
  private async seedCwd(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || (session.cwd && session.cwd.startsWith('/'))) return;
    try {
      let cwd = '';
      if (session.client) cwd = await this.getSessionCwdViaExec(sessionId);
      if (!cwd) cwd = await this.probeCwdViaShell(sessionId);
      if (!cwd) cwd = await this.probeCwdViaShell(sessionId);
      if (cwd && cwd.startsWith('/') && !session.cwd) {
        session.cwd = cwd;
        console.log(`[SSH] seeded cwd for ${sessionId}: ${cwd}`);
      }
    } catch {
      // 忽略，上传时再探测
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
      // 直接在 SSH stream 上监听（避免 notifyOutput 重复捕获导致数据翻倍）
      const session = this.sessions.get(sessionId);
      let streamHandler: ((chunk: Buffer) => void) | null = null;
      if (session?.stream) {
        streamHandler = (chunk: Buffer) => {
          output += chunk.toString('utf-8');
        };
        session.stream.on('data', streamHandler);
      } else {
        // 本地 shell fallback：通过 notifyOutput 机制
        const listener = (data: string) => { output += data; };
        this.addOutputListener(sessionId, listener);
      }

      setTimeout(() => {
        if (streamHandler && session?.stream) {
          session.stream.removeListener('data', streamHandler);
        } else {
          this.removeOutputListener(sessionId);
        }
        resolve(output
          .replace(/\x1B\][^\x07]*\x07/g, '')
          .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
          .replace(/\x1B[^\x1B]*[a-zA-Z]/g, '')
        );
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
   * 获取 SSH 会话的当前工作目录。
   * 优先级：
   *   1) 实时跟踪的 session.cwd（解析 cd 命令维护，最可靠、零延迟）
   *   2) /proc 扫描（仅匹配交互式 shell，不依赖交互式 shell 状态）
   *   3) 向交互式 shell 注入 printf $PWD（会先 Ctrl+C 打断前台进程）
   */
  async getSessionCwd(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    // 优先使用实时跟踪到的目录
    if (session?.cwd && session.cwd.startsWith('/')) {
      return session.cwd;
    }
    let cwd = '';
    if (session?.client) {
      try {
        cwd = await this.getSessionCwdViaExec(sessionId);
      } catch (e) {
        console.warn('[SSH] getSessionCwd exec failed, fallback to shell:', (e as Error)?.message);
      }
    }
    if (!cwd) {
      cwd = await this.probeCwdViaShell(sessionId);
      if (!cwd) cwd = await this.probeCwdViaShell(sessionId);
    }
    if (cwd && cwd.startsWith('/')) {
      if (session && !session.cwd) session.cwd = cwd; // 缓存探测结果
      return cwd;
    }
    console.log(`[SSH] getSessionCwd: all probes failed for ${sessionId}`);
    return '';
  }

  /** 向交互式 shell 注入 printf $PWD 探测 CWD（会先 Ctrl+C 打断前台进程） */
  private async probeCwdViaShell(sessionId: string): Promise<string> {
    const marker = `__AICmd_CWD_${Date.now()}__`;
    // 先发送 Ctrl+C 中断可能正在运行的前台进程（如 rz、vim、top 等），
    // 否则 printf 命令会被前台进程吞掉，shell 不会执行
    this.writeData(sessionId, '\x03');
    await new Promise(r => setTimeout(r, 200));

    // 启动捕获后发送命令
    const outputPromise = this.captureOutput(sessionId, 3000);
    this.writeData(sessionId, ` printf '\\n${marker}:%s\\n' "$PWD"\r`);
    const output = await outputPromise;
    console.log(`[SSH] probeCwdViaShell: raw output: ${JSON.stringify(output.substring(0, 500))}`);
    // 更彻底的 ANSI 清理：包括 OSC 序列、CSI 序列、以及各种控制字符
    const cleaned = output
      .replace(/\x1B\][^\x07]*\x07/g, '')  // OSC 序列
      .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '') // CSI 序列
      .replace(/\x1B[^\x1B]*[a-zA-Z]/g, '')  // 其他转义序列
      .replace(/\r/g, '');
    const isCommandEcho = (text: string) => (
      text.includes('printf') ||
      text.includes('$PWD') ||
      text.includes('%s') ||
      text.includes('echo') ||
      text.includes('$(pwd)')
    );
    const isValidCwd = (cwd: string) => cwd.startsWith('/') && !isCommandEcho(cwd);

    for (const line of cleaned.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || isCommandEcho(trimmed)) continue;

      // 匹配 marker 开头的真实输出行，跳过命令回显行
      if (trimmed.startsWith(marker + ':')) {
        const cwd = trimmed.substring(marker.length + 1).trim();
        if (isValidCwd(cwd)) {
          console.log(`[SSH] probeCwdViaShell parsed: '${cwd}'`);
          return cwd;
        }
      }
      // 兜底：如果 marker 被 ANSI 序列打断，尝试用 includes 匹配
      if (trimmed.includes(marker + ':')) {
        const idx = trimmed.indexOf(marker + ':');
        const cwd = trimmed.substring(idx + marker.length + 1).trim();
        if (isValidCwd(cwd)) {
          console.log(`[SSH] probeCwdViaShell parsed (fallback): '${cwd}'`);
          return cwd;
        }
      }
    }
    console.log(`[SSH] probeCwdViaShell: no marker found: ${JSON.stringify(cleaned.substring(0, 500))}`);
    return '';
  }

  /**
   * 通过 SSH exec 独立通道获取交互式 shell 的工作目录
   * 不依赖交互式 shell 状态，即使 shell 卡在 rz/vim/异常状态也能工作
   */
  private getSessionCwdViaExec(sessionId: string): Promise<string> {
    return new Promise((resolve) => {
      const session = this.sessions.get(sessionId);
      if (!session?.client) {
        resolve('');
        return;
      }

      // 通过 /proc 查找交互式 shell 进程的 CWD。
      // 关键：必须只匹配「stdin 是 tty（/dev/pts）」的 shell，排除本 exec 通道自己启动的
      // shell（它的 stdin 是管道、CWD 是 $HOME），否则会错误地返回家目录。
      const cmd = [
        'for pid in $(ls /proc 2>/dev/null | grep "^[0-9]*$"); do',
        '  exe=$(readlink "/proc/$pid/exe" 2>/dev/null)',
        '  case "$exe" in',
        '    *bash*|*sh*|*zsh*|*dash*|*fish*|*tcsh*|*csh*)',
        '      tty=$(readlink "/proc/$pid/fd/0" 2>/dev/null)',
        '      case "$tty" in',
        '        /dev/pts/*|/dev/tty*|/dev/console)',
        '          cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null)',
        '          if [ -n "$cwd" ]; then echo "$cwd"; exit 0; fi',
        '          ;;',
        '      esac',
        '      ;;',
        '  esac',
        'done',
        'pwd'
      ].join('\n');

      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        console.log('[SSH] getSessionCwdViaExec: timeout');
        resolve('');
      }, 5000);

      session.client.exec(cmd, (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          clearTimeout(timeout);
          console.log('[SSH] getSessionCwdViaExec error:', err.message);
          resolve('');
          return;
        }
        stream.on('data', (data: Buffer) => { stdout += data.toString('utf-8'); });
        stream.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf-8'); });
        stream.on('close', () => {
          clearTimeout(timeout);
          const cwd = stdout.trim().split('\n')[0].trim();
          if (cwd && cwd.startsWith('/')) {
            console.log(`[SSH] getSessionCwdViaExec: '${cwd}'`);
            resolve(cwd);
          } else {
            console.log(`[SSH] getSessionCwdViaExec: no valid cwd, stdout: ${JSON.stringify(stdout.substring(0, 200))}, stderr: ${JSON.stringify(stderr.substring(0, 200))}`);
            resolve('');
          }
        });
      });
    });
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

    // 本地会话：直接写文件
    if (session.type === 'local') {
      let fullPath = remotePath;
      if (!remotePath.startsWith('/')) {
        const cwd = process.cwd();
        fullPath = path.resolve(cwd, remotePath);
      }
      const buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
      await fs.promises.writeFile(fullPath, buf);
      console.log(`[SSH] Local upload: ${buf.length} bytes -> ${fullPath}`);
      return buf.length;
    }

    if (session.type !== 'ssh' || !session.client) {
      throw new Error('File upload is only supported for SSH / local sessions');
    }

    console.log(`[SSH] SFTP upload: ${fileBuffer.length} bytes`);

    // 解析相对路径：必须通过交互式 shell 获取当前 CWD。
    // 注意：不能 fallback 到 SFTP realpath('.')，它通常是登录 home 目录，会导致文件传错位置。
    let fullPath = remotePath;
    if (!remotePath.startsWith('/')) {
      console.log(`[SSH] Getting shell CWD...`);
      const cwd = await this.getSessionCwd(sessionId);
      console.log(`[SSH] Shell CWD: '${cwd}'`);
      if (!cwd || !cwd.startsWith('/')) {
        throw new Error('无法获取当前终端目录，请确认终端处于正常 Shell 提示符状态后重试');
      }
      fullPath = `${cwd.replace(/\/$/, '')}/${remotePath}`;
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
              const mvCmd = `mv -f ${shellQuote(tmpPath)} ${shellQuote(fullPath)}`;
              console.log(`[SSH] Shell exec: ${mvCmd}`);
              const mvMarker = `__AICmd_MV_${Date.now()}__`;
              const captureP = this.captureOutput(sessionId, 5000);
              this.writeData(sessionId, `${mvCmd} && echo ${mvMarker}:OK || echo ${mvMarker}:FAIL\r`);
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
              this.writeData(sessionId, `sudo mv -f ${shellQuote(tmpPath)} ${shellQuote(fullPath)} && echo ${sudoMarker}:OK || echo ${sudoMarker}:FAIL\r`);
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

 // ========== 定时清理僵尸 Session ==========

  /**
   * 启动定时清理任务（每 30 秒执行一次）
   * 清理磁盘上存在但进程已不存在的 session 元数据
   * 仅在本实例曾创建过 session 时才执行（避免渲染进程实例误删主进程的数据）
   */
  private startPeriodicCleanup(): void {
    const CLEANUP_INTERVAL = 30000; // 30 秒
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanupZombieSessions();
      } catch (e) {
        console.error('[SSH] Periodic cleanup error:', e);
      }
    }, CLEANUP_INTERVAL);
    // 避免定时器阻止 Node.js 进程正常退出
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 清理僵尸 session：从磁盘重新加载，移除进程已不存在的条目
   */
  private cleanupZombieSessions(): void {
    // 仅当本实例曾创建过 session 时才执行清理（主进程实例）
    // 渲染进程实例从不创建 session（创建通过 IPC 在主进程完成），跳过以避免误删
    if (!this.hasCreatedSession) return;

    // 从磁盘重新加载最新状态
    this.loadSessionsFromDisk();

    // 找出磁盘上有但进程已不存在的 session
    const toRemove: string[] = [];
    for (const sid of this.sessionMetadata.keys()) {
      if (!this.sessions.has(sid)) {
        toRemove.push(sid);
      }
    }

    if (toRemove.length > 0) {
      for (const sid of toRemove) {
        this.sessionMetadata.delete(sid);
      }
      this.saveSessionsToDisk();
      console.log(`[SSH] Periodic cleanup: removed ${toRemove.length} zombie session(s): ${toRemove.join(', ')}`);
    }
  }

  /**
   * 停止定时清理（应用退出时调用）
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.closeAllSessions();
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

  // ========== 文件管理（SFTP / 本地 fs） ==========

  /**
   * 获取 SFTP 客户端（ssh2 的 sftp 子系统）
   */
  private getSftp(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.client) {
      return Promise.reject(new Error('SFTP is only available for SSH sessions'));
    }
    return new Promise((resolve, reject) => {
      session.client!.sftp((err: Error | undefined, sftp: any) => {
        if (err) return reject(err);
        resolve(sftp);
      });
    });
  }

  /**
   * 列出远程（或本地）目录内容
   */
  async listDirectory(sessionId: string, remotePath: string): Promise<RemoteFileInfo[]> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);

    if (session.type === 'ssh' && session.client) {
      return this.listViaSftp(sessionId, remotePath);
    }
    if (session.type === 'local') {
      return this.listViaLocal(remotePath);
    }
    throw new Error('File management is only supported for SSH / local sessions');
  }

  /**
   * 创建远程目录
   */
  async makeDirectory(sessionId: string, remotePath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);
    if (session.type === 'ssh' && session.client) {
      const sftp = await this.getSftp(sessionId);
      await new Promise<void>((resolve, reject) => {
        sftp.mkdir(remotePath, (err: Error | undefined) => err ? reject(err) : resolve());
      });
      return;
    }
    if (session.type === 'local') {
      await fs.promises.mkdir(remotePath, { recursive: true });
      return;
    }
    throw new Error('File management is only supported for SSH / local sessions');
  }

  /**
   * 删除远程文件或目录（目录递归删除）
   */
  async removePath(sessionId: string, remotePath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);
    if (session.type === 'ssh' && session.client) {
      const sftp = await this.getSftp(sessionId);
      await this.removeRecursive(sftp, remotePath);
      return;
    }
    if (session.type === 'local') {
      await fs.promises.rm(remotePath, { recursive: true, force: true });
      return;
    }
    throw new Error('File management is only supported for SSH / local sessions');
  }

  /**
   * 重命名 / 移动远程文件或目录
   */
  async renamePath(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);
    if (session.type === 'ssh' && session.client) {
      const sftp = await this.getSftp(sessionId);
      await new Promise<void>((resolve, reject) => {
        sftp.rename(oldPath, newPath, (err: Error | undefined) => err ? reject(err) : resolve());
      });
      return;
    }
    if (session.type === 'local') {
      await fs.promises.rename(oldPath, newPath);
      return;
    }
    throw new Error('File management is only supported for SSH / local sessions');
  }

  /**
   * 下载远程文件，返回 Buffer
   */
  async downloadFile(sessionId: string, remotePath: string): Promise<Buffer> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);

    const MAX_DOWNLOAD_SIZE = 200 * 1024 * 1024; // 200MB

    if (session.type === 'ssh' && session.client) {
      const sftp = await this.getSftp(sessionId);
      // 预检查文件大小，防止大文件 OOM
      const stat = await new Promise<any>((resolve, reject) => {
        sftp.stat(remotePath, (err: Error | undefined, attrs: any) => err ? reject(err) : resolve(attrs));
      }).catch(() => null);
      if (stat && typeof stat.size === 'number' && stat.size > MAX_DOWNLOAD_SIZE) {
        throw new Error(`文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，超过 200MB 限制，请使用终端 scp/sz 下载`);
      }
      return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = sftp.createReadStream(remotePath);
        stream.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', (e: Error) => reject(e));
      });
    }
    if (session.type === 'local') {
      // 预检查本地文件大小
      const localStat = await fs.promises.stat(remotePath).catch(() => null);
      if (localStat && localStat.size > MAX_DOWNLOAD_SIZE) {
        throw new Error(`文件过大 (${(localStat.size / 1024 / 1024).toFixed(1)}MB)，超过 200MB 限制，请使用终端 scp/sz 下载`);
      }
      return fs.promises.readFile(remotePath);
    }
    throw new Error('File management is only supported for SSH / local sessions');
  }

  /**
   * 获取会话默认目录（SSH: SFTP 起始目录 / 本地: 用户家目录）
   */
  async getDefaultDirectory(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);
    if (session.type === 'ssh' && session.client) {
      const sftp = await this.getSftp(sessionId);
      return new Promise<string>((resolve, reject) => {
        sftp.realpath('.', (err: Error | undefined, p: string) => err ? reject(err) : resolve(p));
      });
    }
    if (session.type === 'local') {
      return process.env.HOME || require('os').homedir();
    }
    throw new Error('File management is only supported for SSH / local sessions');
  }

  private async listViaSftp(sessionId: string, remotePath: string): Promise<RemoteFileInfo[]> {
    const sftp = await this.getSftp(sessionId);
    const list = await new Promise<any[]>((resolve, reject) => {
      sftp.readdir(remotePath, (err: Error | undefined, entries: any[]) => err ? reject(err) : resolve(entries));
    });
    const result: RemoteFileInfo[] = list
      .filter((e) => e.filename !== '.' && e.filename !== '..')
      .map((entry) => this.entryToInfo(entry, remotePath));
    return this.sortFileList(result);
  }

  private async listViaLocal(localPath: string): Promise<RemoteFileInfo[]> {
    const base = localPath || process.env.HOME || require('os').homedir();
    const names = await fs.promises.readdir(base);
    const result: RemoteFileInfo[] = [];
    for (const name of names) {
      const full = path.join(base, name);
      let stats;
      try {
        stats = await fs.promises.lstat(full);
      } catch {
        continue;
      }
      result.push(this.statToInfo(name, full, stats));
    }
    return this.sortFileList(result);
  }

  private entryToInfo(entry: any, parentPath: string): RemoteFileInfo {
    const attrs = entry.attrs || {};
    const mode = attrs.mode || 0;
    const isDirectory = (mode & 0o170000) === 0o040000;
    const isSymbolicLink = (mode & 0o170000) === 0o120000;
    return {
      name: entry.filename,
      path: parentPath.replace(/\/$/, '') + '/' + entry.filename,
      size: attrs.size ?? 0,
      mtime: (attrs.mtime ?? 0) * 1000,
      atime: (attrs.atime ?? 0) * 1000,
      isDirectory,
      isFile: (mode & 0o170000) === 0o100000,
      isSymbolicLink,
      mode,
      permissions: modeToPermissions(mode),
      owner: String(attrs.uid ?? ''),
      group: String(attrs.gid ?? ''),
    };
  }

  private statToInfo(name: string, full: string, stats: fs.Stats): RemoteFileInfo {
    const mode = stats.mode;
    const isDirectory = stats.isDirectory();
    const isSymbolicLink = stats.isSymbolicLink();
    return {
      name,
      path: full,
      size: stats.size,
      mtime: stats.mtimeMs,
      atime: stats.atimeMs,
      isDirectory,
      isFile: stats.isFile(),
      isSymbolicLink,
      mode,
      permissions: modeToPermissions(mode),
      owner: String(stats.uid),
      group: String(stats.gid),
    };
  }

  private sortFileList(list: RemoteFileInfo[]): RemoteFileInfo[] {
    return list.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  private async removeRecursive(sftp: any, p: string): Promise<void> {
    const stat = await new Promise<any>((resolve, reject) => {
      sftp.lstat(p, (err: Error | undefined, attrs: any) => err ? reject(err) : resolve(attrs));
    }).catch((e) => { console.warn(`[SSH] removeRecursive: lstat failed for ${p}:`, e?.message || e); return null; });
    if (!stat) {
      console.warn(`[SSH] removeRecursive: skipping ${p} (unable to stat)`);
      return;
    }
    const mode = stat.mode || 0;
    if ((mode & 0o170000) === 0o040000) {
      const list = await new Promise<any[]>((resolve, reject) => {
        sftp.readdir(p, (err: Error | undefined, entries: any[]) => err ? reject(err) : resolve(entries));
      });
      for (const item of list) {
        if (item.filename === '.' || item.filename === '..') continue;
        await this.removeRecursive(sftp, p.replace(/\/$/, '') + '/' + item.filename);
      }
      await new Promise<void>((resolve, reject) => {
        sftp.rmdir(p, (err: Error | undefined) => err ? reject(err) : resolve());
      });
    } else {
      await new Promise<void>((resolve, reject) => {
        sftp.unlink(p, (err: Error | undefined) => err ? reject(err) : resolve());
      });
    }
  }
}

/** 将数字权限位转换为 ls -l 风格的字符串（如 'rwxr-xr-x'），处理 setuid/setgid/sticky 位 */
export function modeToPermissions(mode: number): string {
  const typeChar =
    (mode & 0o170000) === 0o040000 ? 'd'
    : (mode & 0o170000) === 0o120000 ? 'l'
    : '-';
  const symbols = 'rwxrwxrwx';
  let str = '';
  for (let i = 0; i < 9; i++) {
    str += (mode & (1 << (8 - i))) ? symbols[i] : '-';
  }
  // 处理特殊权限位：setuid(4)、setgid(2)、sticky(1)
  if (mode & 0o4000) str = str.slice(0, 2) + (str[2] === 'x' ? 's' : 'S') + str.slice(3);
  if (mode & 0o2000) str = str.slice(0, 5) + (str[5] === 'x' ? 's' : 'S') + str.slice(6);
  if (mode & 0o1000) str = str.slice(0, 8) + (str[8] === 'x' ? 't' : 'T');
  return typeChar + str;
}
