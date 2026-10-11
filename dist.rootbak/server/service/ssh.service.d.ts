import { Client, type ClientChannel } from 'ssh2';
import { ConnectionService } from './connection.service';
import { type ChildProcess } from 'child_process';
/**
 * 会话接口（统一 SSH 和本地 shell）
 */
interface TerminalSession {
    id: string;
    connectionId: string;
    type: 'ssh' | 'local';
    name: string;
    client?: Client;
    stream?: ClientChannel;
    pty?: any;
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
    /** 复用的 SFTP 实例（每个会话只建一次，避免 channel 泄漏） */
    sftp?: any;
    /** 后台刷新 CWD 的防抖定时器 */
    cwdRefreshTimer?: NodeJS.Timeout;
    /** 上次后台刷新 CWD 的时间戳 */
    lastCwdRefreshAt?: number;
    /** 是否正在刷新 CWD（避免并发 exec） */
    cwdRefreshing?: boolean;
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
export declare class SSHService {
    private sessions;
    private sessionMetadata;
    private connectionService;
    private outputListeners;
    /** SSH 会话 MOTD 捕获 Promise（连接后自动后台采集） */
    private pendingMOTDCaptures;
    /** Session 元数据持久化文件路径 */
    private sessionsFilePath;
    /** 是否曾在本实例创建过 session（用于区分主进程/渲染进程实例，仅主进程实例执行定时清理） */
    private hasCreatedSession;
    /** 定时清理僵尸 session 的定时器 */
    private cleanupTimer;
    /** 正在建立中的 SFTP 连接（避免并发重复创建） */
    private sftpPromises;
    constructor(connectionService: ConnectionService);
    /**
     * 创建会话（自动判断 SSH 或本地 shell）
     */
    createSession(sessionId: string, connectionId: string, cols?: number, rows?: number, name?: string, onLog?: (msg: string) => void): Promise<TerminalSession>;
    /**
     * 创建本地 Shell 会话（优先使用 node-pty，降级使用 child_process.spawn）
     */
    private createLocalSession;
    /**
     * 创建 SSH 会话
     */
    private createSSHSession;
    /**
     * 获取默认 Shell
     */
    private getDefaultShell;
    /**
     * 构建干净的 Shell 环境变量
     * 过滤掉 Node.js / npm / pnpm 相关变量，避免子 shell 出现 nvm 等工具警告
     */
    private buildShellEnv;
    /**
     * 获取所有会话信息列表（从 sessionMetadata 读取）
     */
    getSessions(): SessionInfo[];
    /**
     * 重命名会话
     */
    renameSession(sessionId: string, name: string): void;
    /**
     * 删除会话（关闭进程并从 server 端移除 metadata）
     * 注意：由于 Electron 主进程和渲染进程各自有独立的模块实例，
     * 渲染进程实例的 sessionMetadata 可能不含主进程创建的 session，
     * 因此先从磁盘重新加载以确保同步，再执行删除。
     */
    deleteSession(sessionId: string): void;
    /**
     * 获取会话
     */
    getSession(sessionId: string): TerminalSession | undefined;
    /**
     * 从磁盘加载 session 元数据
     */
    private loadSessionsFromDisk;
    /**
     * 将 session 元数据写入磁盘
     */
    private saveSessionsToDisk;
    /**
     * 获取会话的系统上下文（确保每次都有）
     * 如果 session 没有缓存的环境信息，自动采集并持久化
     * 对于 startupScript（跳板机）会话，始终主动采集以确保获取目标服务器信息
     */
    getSystemContext(sessionId: string): Promise<string>;
    /**
     * 启动后台 MOTD 捕获（不阻塞 session 创建）
     */
    private startMOTDCapture;
    /**
     * 捕获 SSH 登录 MOTD 并解析为系统信息
     */
    private captureMOTD;
    /**
     * Active system info collection for SSH sessions (e.g. jump host)
     * Sends a compact command to the remote terminal and captures the output
     */
    private activeCollectRemoteSystemInfo;
    /**
     * 解析 SSH 登录 MOTD，提取系统环境信息
     * 兼容 Ubuntu/Debian/CentOS/RHEL/Fedora/FreeBSD 等不同发行版格式
     */
    private parseMOTD;
    /**
     * 采集本地系统环境信息（仅用于 local session）
     */
    private collectLocalSystemInfo;
    /**
     * 采集 Windows 系统环境信息（PowerShell）
     */
    private collectWindowsSystemInfo;
    /**
     * 采集 Unix/macOS/Linux 系统环境信息（Bash）
     */
    private collectUnixSystemInfo;
    /**
     * 格式化采集结果
     */
    private formatSystemInfo;
    /**
     * 向会话写入数据（用户输入）
     */
    writeData(sessionId: string, data: string | Buffer): boolean;
    /**
     * 根据用户输入的命令实时更新跟踪的 CWD。
     * 只处理简单形式的 cd/pushd/popd；遇到复杂结构（变量、管道、subshell 等）则重置为未知，
     * 由后台刷新 / 上传时的探测兜底。
     *
     * 注意：xterm 默认「逐字符」发送按键，writeData 每次收到的往往只是单个字符，
     * 因此必须先把输入累积成完整命令行、等回车提交后再解析，否则 cd 跟踪形同虚设。
     */
    private updateCwdFromInput;
    /** 连接后后台探测一次会话身份（shell PID + CWD）并缓存（不阻塞，失败忽略） */
    private seedCwd;
    /**
     * 调度一次后台 CWD 刷新（终端输出静默后执行）。
     *
     * 目的：让 rz/上传触发时 session.cwd 已经是最新值，从而完全避免在 rz 运行期间
     * 向交互式 shell 注入命令（那会打断 rz，且输入会被 rz 吞掉导致探测失败）。
     * 刷新走独立 exec 通道，对终端零影响。
     */
    private scheduleCwdRefresh;
    /**
     * 刷新并缓存会话的当前工作目录（走 exec 通道，不干扰交互式终端）。
     * 优先用已缓存的 shell PID 直接读 /proc/<pid>/cwd（一次 readlink，极轻量），
     * 否则回退到完整进程探测。失败时保留旧值不清除。
     */
    private refreshCwd;
    /**
     * 通过 exec 通道读取指定 PID 的工作目录（远端 Linux /proc）。
     * 同时校验进程名，避免 PID 复用导致读到无关进程的目录。
     */
    private readPidCwd;
    /**
     * 探测本会话的交互式 shell 与正在运行的 rz/sz 进程。
     * 走独立 exec 通道，不向交互式终端写入任何内容。
     */
    private probeSessionProcess;
    /**
     * 在远端执行一条命令（独立 exec 通道），返回 stdout。
     * 不会向交互式终端写入任何内容，因此不会打断 rz/vim 等前台进程。
     */
    private execRemote;
    /**
     * 注册输出监听器（用于 Agent 捕获终端输出）
     * 注意：此方法不拦截现有 WebSocket 转发，仅添加额外监听
     */
    addOutputListener(sessionId: string, listener: (data: string) => void): void;
    /**
     * 移除输出监听器
     */
    removeOutputListener(sessionId: string): void;
    /**
     * 通知输出监听器（由 WebSocket 处理器在收到终端输出时调用）
     */
    notifyOutput(sessionId: string, data: string): void;
    /**
     * 捕获会话在指定时间内的输出
     * @param sessionId 会话 ID
     * @param timeoutMs 等待时间（毫秒），默认 2000
     * @returns 捕获的输出文本（已去除 ANSI 转义序列）
     */
    captureOutput(sessionId: string, timeoutMs?: number, stopWhen?: (text: string) => boolean): Promise<string>;
    /**
     * 调整终端窗口大小
     */
    resize(sessionId: string, cols: number, rows: number): boolean;
    /**
     * 关闭会话
     */
    closeSession(sessionId: string): void;
    /**
     * 关闭所有会话
     */
    closeAllSessions(): void;
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
    getSessionCwd(sessionId: string, opts?: {
        allowShellProbe?: boolean;
        preferTransferProcess?: boolean;
        force?: boolean;
    }): Promise<string>;
    /** 向交互式 shell 注入 printf $PWD 探测 CWD（会先 Ctrl+C 打断前台进程） */
    private probeCwdViaShell;
    /**
     * 通过 SFTP 上传文件到远程服务器（绕过 PTY，速度快）
     * @param sessionId 会话 ID
     * @param remotePath 远程文件路径（相对路径或绝对路径）
     * @param base64Data 文件的 base64 编码数据
     * @returns 写入的字节数
     */
    uploadFileViaSftp(sessionId: string, remotePath: string, fileBuffer: Buffer): Promise<number>;
    /**
     * 启动定时清理任务（每 30 秒执行一次）
     * 清理磁盘上存在但进程已不存在的 session 元数据
     * 仅在本实例曾创建过 session 时才执行（避免渲染进程实例误删主进程的数据）
     */
    private startPeriodicCleanup;
    /**
     * 清理僵尸 session：从磁盘重新加载，移除进程已不存在的条目
     */
    private cleanupZombieSessions;
    /**
     * 停止定时清理（应用退出时调用）
     */
    destroy(): void;
    /**
     * 获取活跃会话数量
     */
    getActiveSessionCount(): number;
    /**
     * 获取所有活跃会话 ID
     */
    getActiveSessionIds(): string[];
    /**
     * 获取（并复用）SFTP 客户端（ssh2 的 sftp 子系统）
     *
     * 必须复用：OpenSSH 默认 MaxSessions=10，而每次 client.sftp() 都会新开一个
     * subsystem channel。若每次调用都新建且不关闭，几次之后就会
     * "Channel open failure: open failed"，表现为上传时好时坏、重连后又正常。
     */
    private getSftp;
    /** 丢弃并关闭失效的 SFTP 实例（下次使用时重建） */
    private invalidateSftp;
    /**
     * 列出远程（或本地）目录内容
     */
    listDirectory(sessionId: string, remotePath: string): Promise<RemoteFileInfo[]>;
    /**
     * 创建远程目录
     */
    makeDirectory(sessionId: string, remotePath: string): Promise<void>;
    /**
     * 删除远程文件或目录（目录递归删除）
     */
    removePath(sessionId: string, remotePath: string): Promise<void>;
    /**
     * 重命名 / 移动远程文件或目录
     */
    renamePath(sessionId: string, oldPath: string, newPath: string): Promise<void>;
    /**
     * 下载远程文件，返回 Buffer
     */
    downloadFile(sessionId: string, remotePath: string): Promise<Buffer>;
    /**
     * 获取会话默认目录（SSH: SFTP 起始目录 / 本地: 用户家目录）
     */
    getDefaultDirectory(sessionId: string): Promise<string>;
    private listViaSftp;
    private listViaLocal;
    private entryToInfo;
    private statToInfo;
    private sortFileList;
    private removeRecursive;
}
/** 将数字权限位转换为 ls -l 风格的字符串（如 'rwxr-xr-x'），处理 setuid/setgid/sticky 位 */
export declare function modeToPermissions(mode: number): string;
export {};
//# sourceMappingURL=ssh.service.d.ts.map