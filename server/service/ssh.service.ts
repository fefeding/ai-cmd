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
  /** 实时跟踪的当前工作目录（通过解析 cd 命令维护 + 后台 /proc 刷新） */
  cwd?: string;
  /** cwd 最后一次被成功解析的时间戳（用于判断缓存是否过期） */
  cwdAt?: number;
  /** 未提交的输入行缓冲（xterm 逐字符发送，需累积成完整命令行才能解析 cd） */
  inputBuffer?: string;
  /** 远端交互式 shell 的 PID（用于 /proc/<pid>/cwd 精确读取当前目录，不影响终端） */
  shellPid?: number;
  /** 后台刷新 CWD 的防抖定时器 */
  cwdRefreshTimer?: NodeJS.Timeout;
  /** 上次后台刷新 CWD 的时间戳 */
  lastCwdRefreshAt?: number;
  /** 是否正在刷新 CWD（避免并发 exec） */
  cwdRefreshing?: boolean;
}

/**
 * CWD 缓存有效期：超过该时长没能再次成功解析目录，缓存即视为不可信。
 * 后台刷新在终端静默 700ms 后就会跑，正常情况下 cwd 时间戳远新于此值。
 */
const CWD_CACHE_TTL = 120000;

/**
 * cd 跟踪值的保护期：这段时间内后台探测结果不会覆盖它（见 refreshCwd）。
 */
const CWD_TRACK_GRACE = 5000;

/**
 * 远端进程探测脚本（通过独立 exec 通道执行，不会向交互式终端写入任何内容）。
 *
 * 输出格式（每行一条，可能 0~2 行）：
 *   SHELL:<pid>:<cwd>   本会话的交互式 shell
 *   XFER:<pid>:<cwd>    本会话正在运行的 rz/sz 进程（rz 的 cwd 即文件将写入的目录）
 *
 * 设计要点：
 *   1) 只认与本 exec 通道同源（祖先链命中同一个 sshd 会话进程）的候选，
 *      避免同一台机器开多个标签页时串台读到别的终端目录；
 *   2) 排除 exec 通道自身及其祖先，避免把 exec 自己的 shell（cwd 恒为 $HOME）
 *      误判成终端 —— 这正是"文件被传到家目录"的根因；
 *   3) 不使用 exec 通道的 pwd 兜底，探测不到就返回空，宁可让用户手填。
 */
const SESSION_PROBE_SCRIPT = [
  // 无 /proc 的远端（macOS / BSD）：改用 lsof 读取 shell 的 cwd
  'if [ ! -d /proc ]; then',
  '  for pid in $(ps -eo pid=,comm= 2>/dev/null | awk \'$2 ~ /^(bash|zsh|sh|fish|dash|ksh|ksh93|mksh|tcsh|csh)$/ {print $1}\'); do',
  '    d=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n "s/^n//p" | head -n 1)',
  '    case "$d" in /*) echo "SHELL:$pid:$d"; break;; esac',
  '  done',
  '  exit 0',
  'fi',
  'self=$$',
  'ppid_of() { sed -n "s/^PPid:[[:space:]]*//p" "/proc/$1/status" 2>/dev/null | head -n 1; }',
  'name_of() { sed -n "s/^Name:[[:space:]]*//p" "/proc/$1/status" 2>/dev/null | head -n 1; }',
  'cwd_of() { readlink "/proc/$1/cwd" 2>/dev/null; }',
  // 收集 exec 通道自身的进程链（self + 祖先），这些必须排除
  'self_chain=" $self "',
  'p=$self',
  'i=0',
  'while [ $i -lt 12 ]; do',
  '  p=$(ppid_of "$p")',
  '  case "$p" in ""|0|1) break;; esac',
  '  self_chain="$self_chain$p "',
  '  i=$((i+1))',
  'done',
  // 最近的 sshd 会话祖先：用于把候选限定在本 SSH 会话内
  'sshd_anc=""',
  'for q in $self_chain; do',
  '  n=$(name_of "$q")',
  '  case "$n" in sshd*) sshd_anc="$q"; break;; esac',
  'done',
  'in_chain() { case "$self_chain" in *" $1 "*) return 0;; esac; return 1; }',
  // 返回值即优先级：2 = 与 sshd 会话同源（最准），1 = 仅 stdin 是 tty（tmux/su 等兜底），0 = 不匹配
  'match_pri() {',
  '  pid=$1',
  '  if [ -n "$sshd_anc" ]; then',
  '    q=$pid; j=0',
  '    while [ $j -lt 12 ]; do',
  '      q=$(ppid_of "$q")',
  '      case "$q" in ""|0|1) break;; esac',
  '      [ "$q" = "$sshd_anc" ] && return 2',
  '      j=$((j+1))',
  '    done',
  '  fi',
  '  tty=$(readlink "/proc/$pid/fd/0" 2>/dev/null)',
  '  case "$tty" in /dev/pts/*|/dev/tty*|/dev/console) return 1;; esac',
  '  return 0',
  '}',
  // 进程深度（到 PID 1 的层数）：多个候选时取最深的那个。
  // 用户的登录 shell 可能只是外层进程（tmux/byobu/su 后真正交互的是它的子孙），
  // 最内层的 shell 才是用户实际在执行命令的地方。
  'depth_of() {',
  '  d=0; q=$1',
  '  while [ $d -lt 20 ]; do',
  '    pp=$(ppid_of "$q")',
  '    case "$pp" in ""|0|1) break;; esac',
  '    q=$pp; d=$((d+1))',
  '  done',
  '  echo $d',
  '}',
  'best_shell=""; best_shell_key=0',
  'best_xfer=""; best_xfer_key=0',
  'for pid in $(ls /proc 2>/dev/null | grep -E "^[0-9]+$"); do',
  '  in_chain "$pid" && continue',
  '  n=$(name_of "$pid")',
  '  case "$n" in',
  '    bash|sh|zsh|fish|dash|ksh|ksh93|mksh|tcsh|csh|ash|busybox) kind=shell;;',
  '    rz|sz|lrz|lsz|lrzsz) kind=xfer;;',
  '    *) continue;;',
  '  esac',
  '  c=$(cwd_of "$pid")',
  '  [ -n "$c" ] || continue',
  '  match_pri "$pid"',
  '  pri=$?',
  '  [ "$pri" = 0 ] && continue',
  '  dep=$(depth_of "$pid")',
  '  key=$((pri * 100 + dep))',
  '  echo "CAND:$kind:$pid:$c:$pri:$dep"',
  '  if [ "$kind" = shell ]; then',
  '    if [ "$key" -gt "$best_shell_key" ]; then best_shell="$pid:$c"; best_shell_key=$key; fi',
  '  else',
  '    if [ "$key" -gt "$best_xfer_key" ]; then best_xfer="$pid:$c"; best_xfer_key=$key; fi',
  '  fi',
  'done',
  '[ -n "$best_shell" ] && echo "SHELL:$best_shell"',
  '[ -n "$best_xfer" ] && echo "XFER:$best_xfer"',
  'exit 0',
].join('\n');

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
  async createSession(sessionId: string, connectionId: string, cols: number = 80, rows: number = 24, name?: string, onLog?: (msg: string) => void): Promise<TerminalSession> {
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
      const localSession = await this.createLocalSession(sessionId, connectionId, localConn, cols, rows, name, onLog);
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
      session = await this.createLocalSession(sessionId, connectionId, connection, cols, rows, name, onLog);
    } else {
      session = await this.createSSHSession(sessionId, connectionId, connection, cols, rows, name, onLog);
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
  private createLocalSession(sessionId: string, connectionId: string, connection: ConnectionEntity, cols: number, rows: number, name?: string, onLog?: (msg: string) => void): Promise<TerminalSession> {
    const log = (msg: string) => { console.log(`[SSH] ${msg}`); onLog?.(msg); };
    return new Promise<TerminalSession>((resolve, reject) => {
      try {
        const sessionName = name || connection.name || '本地 Shell';
        const shell = connection.shell || this.getDefaultShell();
        const homeDir = os.homedir();
        log(`启动本地 Shell: ${shell}`);

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
  private createSSHSession(sessionId: string, connectionId: string, connection: ConnectionEntity, cols: number, rows: number, name?: string, onLog?: (msg: string) => void): Promise<TerminalSession> {
    const log = (msg: string) => { console.log(`[SSH] ${msg}`); onLog?.(msg); };
    return new Promise<TerminalSession>((resolve, reject) => {
      const sshConfig = this.connectionService.getSSHConfig(connection, onLog);
      const client = new Client();
      const sessionName = name || connection.name || 'SSH';

      log(`正在连接到 ${connection.host}:${connection.port || 22} (用户: ${connection.username})`);

      const timeout = setTimeout(() => {
        client.end();
        log(`连接超时 (30s)`);
        reject(new Error('SSH 连接超时'));
      }, 30000);

      client.on('ready', () => {
        clearTimeout(timeout);
        log(`SSH 认证成功，正在打开 shell...`);

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
            log(`打开 shell 失败: ${err.message}`);
            client.end();
            reject(err);
            return;
          }

          log(`Shell 会话已建立`);

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

          // 终端输出静默后，在后台通过 exec 通道刷新一次 CWD。
          // 这样即便用户 cd 之后立刻执行 rz，session.cwd 也已是最新值，
          // 无需在 rz 等待接收文件时向交互式 shell 注入命令（那会打断 rz）。
          stream.on('data', () => this.scheduleCwdRefresh(sessionId));

          stream.on('close', () => {
            log(`Shell 流已关闭`);
            const closing = this.sessions.get(sessionId);
            if (closing?.cwdRefreshTimer) clearTimeout(closing.cwdRefreshTimer);
            this.sessions.delete(sessionId);
          });

          // Execute startup script if configured (e.g. jump host SSH hop)
          if (connection.startupScript && connection.startupScript.trim()) {
            const script = connection.startupScript.trim();
            log(`执行启动脚本: ${script.substring(0, 80)}`);
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
        log(`连接错误: ${err.message}`);
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
   * 由后台刷新 / 上传时的探测兜底。
   *
   * 注意：xterm 默认「逐字符」发送按键，writeData 每次收到的往往只是单个字符，
   * 因此必须先把输入累积成完整命令行、等回车提交后再解析，否则 cd 跟踪形同虚设。
   */
  private updateCwdFromInput(session: TerminalSession, data: string): void {
    let buf = (session.inputBuffer || '') + data;

    // Ctrl+U 清空行、Ctrl+C 取消当前输入：丢弃控制符之前的内容
    const uIdx = buf.lastIndexOf('\x15');
    if (uIdx >= 0) buf = buf.slice(uIdx + 1);
    const cIdx = buf.lastIndexOf('\x03');
    if (cIdx >= 0) buf = buf.slice(cIdx + 1);

    // 取最后一个换行/回车之前的内容作为「已提交的命令行」
    const idx = Math.max(buf.lastIndexOf('\r'), buf.lastIndexOf('\n'));
    if (idx < 0) {
      // 尚未提交：保留缓冲（限制长度，防止长时间输入导致内存膨胀）
      session.inputBuffer = buf.length > 4096 ? buf.slice(-2048) : buf;
      return;
    }
    const submitted = buf.slice(0, idx);
    session.inputBuffer = buf.slice(idx + 1);

    for (const raw of submitted.split(/[\r\n]+/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(?:cd|pushd|popd)\b(.*)$/);
      if (!m) continue;
      const rest = m[1].trim();
      // Tab 补全（cd /data/se<Tab>）时输入流里只有补全前的片段，
      // 上下箭头调出的历史命令同理：输入的都不是完整路径，无法解析 -> 交给探测兜底。
      if (raw.includes('\t') || raw.includes('\x1b')) {
        console.log(`[SSH] cwd tracked: '${line}' skipped (completion/history, using probe)`);
        session.cwd = undefined;
        session.cwdAt = undefined;
        continue;
      }
      // 含 ; | && || $ ( ) ` ' " 等无法可靠解析的结构 -> 重置为未知
      if (/[;|&$()`'"]/.test(rest) || rest.includes('~')) {
        session.cwd = undefined;
        session.cwdAt = undefined;
        continue;
      }
      const target = rest.trim();
      if (!target || target === '-') {
        // cd 无参数回到 home，或 cd - 回到上一个目录：无法可靠跟踪，重置
        session.cwd = undefined;
        session.cwdAt = undefined;
        continue;
      }
      let next: string | undefined;
      if (target.startsWith('/')) {
        next = target;
      } else if (session.cwd && session.cwd.startsWith('/')) {
        next = path.posix.resolve(session.cwd, target);
      } else {
        // 当前目录未知，无法拼接相对路径，重置为未知
        next = undefined;
      }
      session.cwd = next;
      session.cwdAt = next ? Date.now() : undefined;
      console.log(`[SSH] cwd tracked: '${line}' -> ${next || '(unknown)'}`);
    }
  }

  /** 连接后后台探测一次会话身份（shell PID + CWD）并缓存（不阻塞，失败忽略） */
  private async seedCwd(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    // 只探测 SSH 会话；本地会话的 cwd 由 cd 跟踪维护
    if (session.type !== 'ssh' || !session.client) return;
    if (session.shellPid && session.cwd && session.cwd.startsWith('/')) return;
    try {
      await this.refreshCwd(sessionId);
      if (session.cwd) console.log(`[SSH] seeded cwd for ${sessionId}: ${session.cwd} (pid=${session.shellPid || '-'})`);
    } catch {
      // 忽略，上传时再探测
    }
  }

  /**
   * 调度一次后台 CWD 刷新（终端输出静默后执行）。
   *
   * 目的：让 rz/上传触发时 session.cwd 已经是最新值，从而完全避免在 rz 运行期间
   * 向交互式 shell 注入命令（那会打断 rz，且输入会被 rz 吞掉导致探测失败）。
   * 刷新走独立 exec 通道，对终端零影响。
   */
  private scheduleCwdRefresh(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.type !== 'ssh' || !session.client) return;
    if (session.cwdRefreshTimer) clearTimeout(session.cwdRefreshTimer);
    session.cwdRefreshTimer = setTimeout(() => {
      session.cwdRefreshTimer = undefined;
      // 限流：距离上次刷新不足 1.5s 则跳过，避免高频 exec
      if (session.lastCwdRefreshAt && Date.now() - session.lastCwdRefreshAt < 1500) return;
      this.refreshCwd(sessionId).catch(() => {});
    }, 700);
  }

  /**
   * 刷新并缓存会话的当前工作目录（走 exec 通道，不干扰交互式终端）。
   * 优先用已缓存的 shell PID 直接读 /proc/<pid>/cwd（一次 readlink，极轻量），
   * 否则回退到完整进程探测。失败时保留旧值不清除。
   */
  private async refreshCwd(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session || session.type !== 'ssh' || !session.client) return session?.cwd || '';
    if (session.cwdRefreshing) return session.cwd || '';
    session.cwdRefreshing = true;
    try {
      let cwd = '';
      if (session.shellPid) {
        cwd = await this.readPidCwd(sessionId, session.shellPid);
        if (!cwd) session.shellPid = undefined; // 进程已退出或 PID 失效
      }
      if (!cwd) {
        const probe = await this.probeSessionProcess(sessionId);
        if (probe.shellPid) session.shellPid = probe.shellPid;
        cwd = probe.shellCwd;
      }
      if (cwd && cwd.startsWith('/')) {
        // 用户刚刚敲过 cd（cd 跟踪值很新鲜）时，不覆盖它：
        // cd 是用户的显式意图，比推断出的进程目录更可信，
        // 也能避免探测到错误进程时把正确目录改回成家目录。
        const trackedRecently = !!session.cwdAt && (Date.now() - session.cwdAt) < CWD_TRACK_GRACE;
        if (trackedRecently && session.cwd !== cwd) {
          console.log(`[SSH] refreshCwd: keep tracked cwd '${session.cwd}' (probe said '${cwd}')`);
        } else {
          session.cwd = cwd;
          session.cwdAt = Date.now();
        }
      }
      return session.cwd && session.cwd.startsWith('/') ? session.cwd : '';
    } catch {
      return session.cwd && session.cwd.startsWith('/') ? session.cwd : '';
    } finally {
      session.cwdRefreshing = false;
      session.lastCwdRefreshAt = Date.now();
    }
  }

  /**
   * 通过 exec 通道读取指定 PID 的工作目录（远端 Linux /proc）。
   * 同时校验进程名，避免 PID 复用导致读到无关进程的目录。
   */
  private async readPidCwd(sessionId: string, pid: number): Promise<string> {
    if (!Number.isInteger(pid) || pid <= 0) return '';
    const out = await this.execRemote(
      sessionId,
      `cat /proc/${pid}/comm 2>/dev/null; readlink /proc/${pid}/cwd 2>/dev/null`,
      4000,
    );
    const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return '';
    const comm = lines[0];
    const cwd = lines[lines.length - 1];
    if (!cwd.startsWith('/')) return '';
    if (!/^(bash|sh|zsh|fish|dash|ksh|ksh93|mksh|tcsh|csh|ash|busybox|rz|sz|lrz|lsz)$/.test(comm)) return '';
    return cwd;
  }

  /**
   * 探测本会话的交互式 shell 与正在运行的 rz/sz 进程。
   * 走独立 exec 通道，不向交互式终端写入任何内容。
   */
  private async probeSessionProcess(
    sessionId: string,
  ): Promise<{ shellPid?: number; shellCwd: string; xferCwd: string; candidates: string[] }> {
    const result = {
      shellPid: undefined as number | undefined,
      shellCwd: '',
      xferCwd: '',
      candidates: [] as string[],
    };
    const out = await this.execRemote(sessionId, SESSION_PROBE_SCRIPT, 5000);
    for (const raw of out.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('CAND:')) {
        // 诊断用：列出全部候选进程（kind:pid:cwd:pri:depth）
        result.candidates.push(line.substring(5));
        continue;
      }
      const m = line.match(/^(SHELL|XFER):(\d+):(\/.*)$/);
      if (!m) continue;
      const pid = Number(m[2]);
      const cwd = m[3].trim();
      if (m[1] === 'SHELL') {
        result.shellPid = pid;
        result.shellCwd = cwd;
      } else {
        result.xferCwd = cwd;
      }
    }
    console.log(
      `[SSH] probeSessionProcess: shell=${result.shellPid || '-'}:${result.shellCwd || '-'} ` +
      `xfer=${result.xferCwd || '-'} cands=[${result.candidates.join(' | ')}]`,
    );
    return result;
  }

  /**
   * 在远端执行一条命令（独立 exec 通道），返回 stdout。
   * 不会向交互式终端写入任何内容，因此不会打断 rz/vim 等前台进程。
   */
  private execRemote(sessionId: string, command: string, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve) => {
      const session = this.sessions.get(sessionId);
      if (!session?.client) {
        resolve('');
        return;
      }
      let stdout = '';
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(stdout);
      };
      const timer = setTimeout(finish, timeoutMs);
      try {
        session.client.exec(command, (err: Error | undefined, stream: ClientChannel) => {
          if (err) {
            console.log('[SSH] execRemote error:', err.message);
            finish();
            return;
          }
          stream.on('data', (data: Buffer) => { stdout += data.toString('utf-8'); });
          stream.stderr.on('data', () => {});
          stream.on('close', finish);
          stream.on('error', finish);
        });
      } catch (e) {
        finish();
      }
    });
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
  captureOutput(
    sessionId: string,
    timeoutMs: number = 2000,
    stopWhen?: (text: string) => boolean,
  ): Promise<string> {
    return new Promise((resolve) => {
      let output = '';
      let settled = false;
      // 直接在 SSH stream 上监听（避免 notifyOutput 重复捕获导致数据翻倍）
      const session = this.sessions.get(sessionId);
      let streamHandler: ((chunk: Buffer) => void) | null = null;
      let listener: ((data: string) => void) | null = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (streamHandler && session?.stream) {
          session.stream.removeListener('data', streamHandler);
        } else if (listener) {
          this.removeOutputListener(sessionId);
        }
        resolve(output
          .replace(/\x1B\][^\x07]*\x07/g, '')
          .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
          .replace(/\x1B[^\x1B]*[a-zA-Z]/g, '')
        );
      };

      const timer = setTimeout(finish, timeoutMs);
      const onData = (text: string) => {
        output += text;
        // 拿到目标内容就立刻返回，不必每次都等满 timeout（探测 CWD 时可省下数秒）
        if (stopWhen && stopWhen(output)) finish();
      };

      if (session?.stream) {
        streamHandler = (chunk: Buffer) => onData(chunk.toString('utf-8'));
        session.stream.on('data', streamHandler);
      } else {
        // 本地 shell fallback：通过 notifyOutput 机制
        listener = onData;
        this.addOutputListener(sessionId, listener);
      }
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
      if (session.cwdRefreshTimer) {
        clearTimeout(session.cwdRefreshTimer);
        session.cwdRefreshTimer = undefined;
      }
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
   * 优先级（前 3 步都走独立 exec 通道，对交互式终端零影响）：
   *   1) 缓存的 session.cwd —— 由 cd 跟踪 + 后台刷新共同维护，绝大多数情况直接命中
   *   2) 缓存的 shell PID → readlink /proc/<pid>/cwd（一次调用，最准）
   *   3) 完整进程探测（shell + rz/sz）：rz 运行时的 cwd 就是文件将要写入的目录
   *   4) 向交互式 shell 注入 printf $PWD —— 会 Ctrl+C 打断前台进程，
   *      仅在 allowShellProbe 为真（即确认不在 rz/文件上传过程中）时使用
   *
   * @param opts.allowShellProbe 是否允许注入式探测。rz 正在等待接收文件时必须传 false，
   *                             否则 Ctrl+C 会打断 rz，且注入的命令会被 rz 当作数据吞掉。
   * @param opts.preferTransferProcess 优先采用 rz/sz 进程的 cwd（rz 写文件的目录就是它自己的
   *                                   cwd，比推断出来的 shell 目录更权威）。
   * @param opts.force 强制重新探测，忽略缓存（用户手动点"重新检测"、上传前兜底时使用）。
   *
   * 缓存有效期 CWD_CACHE_TTL：超过该时间没能再次成功解析目录，就认为缓存不可信
   * （例如后台 exec 探测一直失败），此时宁可返回空让前端提示手填，
   * 也不能把陈旧的（很可能是家目录的）路径当成当前目录 —— 那会导致文件传错位置。
   */
  async getSessionCwd(
    sessionId: string,
    opts: { allowShellProbe?: boolean; preferTransferProcess?: boolean; force?: boolean } = {},
  ): Promise<string> {
    const allowShellProbe = opts.allowShellProbe !== false;
    const session = this.sessions.get(sessionId);
    if (!session) return '';

    const cached = session.cwd && session.cwd.startsWith('/') ? session.cwd : '';
    const cacheFresh = !!cached && !!session.cwdAt && (Date.now() - session.cwdAt) < CWD_CACHE_TTL;

    // 0) 强制刷新 + 允许注入探测：直接向 shell 询问，这是最权威的手段。
    //    调用方（上传前兜底、用户点"重新检测"）已确保终端处于可打断状态，
    //    否则只靠 exec 探测，一旦 shellPid 指错进程就会一直拿到错误的目录。
    if (opts.force && allowShellProbe) {
      let probed = await this.probeCwdViaShell(sessionId);
      if (!probed) probed = await this.probeCwdViaShell(sessionId);
      if (probed && probed.startsWith('/')) {
        session.cwd = probed;
        session.cwdAt = Date.now();
        console.log(`[SSH] getSessionCwd (forced shell probe): '${probed}'`);
        return probed;
      }
    }

    // 0.5) rz/sz 正在等待传输：直接取 rz 进程自身的 cwd。
    //      这是最权威的来源 —— rz 由用户所在的 shell 启动，其 cwd 就是文件要写入的目录，
    //      不会受"登录 shell 与实际交互 shell 不是同一个进程"的影响。
    if (opts.preferTransferProcess && session.type === 'ssh' && session.client) {
      const probe = await this.probeSessionProcess(sessionId);
      if (probe.shellPid) session.shellPid = probe.shellPid;
      const cwd = probe.xferCwd || probe.shellCwd;
      if (cwd) {
        session.cwd = cwd;
        session.cwdAt = Date.now();
        return cwd;
      }
    }

    // 1) 缓存命中（且未过期、未强制刷新）
    if (cached && cacheFresh && !opts.force) {
      return cached;
    }

    // 2) 已知 shell PID：直接读 /proc
    if (session.type === 'ssh' && session.client) {
      if (session.shellPid) {
        const cwd = await this.readPidCwd(sessionId, session.shellPid);
        if (cwd) {
          session.cwd = cwd;
          session.cwdAt = Date.now();
          return cwd;
        }
        session.shellPid = undefined;
      }

      // 3) 完整进程探测（默认 shell 优先，rz 场景下优先 rz 进程自身的 cwd）
      const probe = await this.probeSessionProcess(sessionId);
      if (probe.shellPid) session.shellPid = probe.shellPid;
      const cwd = (opts.preferTransferProcess && probe.xferCwd)
        ? probe.xferCwd
        : (probe.shellCwd || probe.xferCwd);
      if (cwd) {
        session.cwd = cwd;
        session.cwdAt = Date.now();
        return cwd;
      }
    }

    // 4) 注入式探测（会打断前台进程）
    if (allowShellProbe) {
      let cwd = await this.probeCwdViaShell(sessionId);
      if (!cwd) cwd = await this.probeCwdViaShell(sessionId);
      if (cwd && cwd.startsWith('/')) {
        session.cwd = cwd;
        session.cwdAt = Date.now();
        return cwd;
      }
    }

    // 全部失败：缓存已过期时返回空（让前端提示手填），避免把陈旧目录当当前目录使用
    const fallback = cacheFresh ? cached : '';
    console.log(
      `[SSH] getSessionCwd: probes failed for ${sessionId} ` +
      `(allowShellProbe=${allowShellProbe}, force=${!!opts.force}, staleCache=${cached || '-'}, returning='${fallback || ''}')`,
    );
    return fallback;
  }

  /** 向交互式 shell 注入 printf $PWD 探测 CWD（会先 Ctrl+C 打断前台进程） */
  private async probeCwdViaShell(sessionId: string): Promise<string> {
    const marker = `__AICmd_CWD_${Date.now()}__`;
    // 先发送 Ctrl+C 中断可能正在运行的前台进程（如 rz、vim、top 等），
    // 否则 printf 命令会被前台进程吞掉，shell 不会执行
    this.writeData(sessionId, '\x03');
    await new Promise(r => setTimeout(r, 200));

    // 启动捕获后发送命令（marker 行输出完整就立即返回，通常几百毫秒）
    const stopWhen = (text: string) => {
      const i = text.indexOf(marker);
      if (i < 0) return false;
      const after = text.slice(i + marker.length);
      return after.includes('\n') || after.length > 80;
    };
    const outputPromise = this.captureOutput(sessionId, 3000, stopWhen);
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
