import * as path from 'path';
import * as vscode from 'vscode';
import { ServerLauncher } from './server-launcher';
import { AicmdSocket, TerminalBridge } from './ws-bridge';

interface RemoteEntry {
  name: string;
  path: string;
  size: number;
  mtime: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
}

interface SessionEntry {
  sessionId: string;
  defaultDir: string;
  socket?: AicmdSocket;
}

/**
 * `aicmd://<connectionId>/<远程绝对路径>` 虚拟文件系统。
 *
 * 所有文件操作都走后端已有的 SFTP / 本地文件 API；每个连接按需复用一个
 * SSH 会话（优先复用终端面板已在跑的会话，否则新建一条专用会话）。
 */
export class AicmdFileSystemProvider implements vscode.FileSystemProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;

  private readonly sessions = new Map<string, Promise<SessionEntry>>();
  private readonly ownedSockets = new Set<AicmdSocket>();

  constructor(
    private readonly launcher: ServerLauncher,
    private readonly bridge: TerminalBridge
  ) {}

  private connId(uri: vscode.Uri): string {
    return decodeURIComponent(uri.authority);
  }

  private remotePath(uri: vscode.Uri): string {
    return uri.path || '/';
  }

  private fileType(e: RemoteEntry): vscode.FileType {
    return e.isSymbolicLink
      ? vscode.FileType.SymbolicLink
      : e.isDirectory
      ? vscode.FileType.Directory
      : vscode.FileType.File;
  }

  /**
   * getSessions() 会返回 sessions.json 里的历史元数据，其中不少是已失活的
   * "僵尸会话"，直接用会令 /api/file/* 返回 500。这里逐个用 defaultDir
   * 探测，只有真正可用的会话才复用；全不可用则新建一条专用会话。
   */
  private async resolveSession(connId: string): Promise<SessionEntry> {
    const list: any[] = await this.launcher.api('/api/terminal/getSessions', {});
    const candidates = (Array.isArray(list) ? list : [])
      .filter((s) => s.connectionId === connId && (s.type === 'ssh' || s.type === 'local'))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    for (const candidate of candidates) {
      try {
        const dir = (await this.launcher.api('/api/file/defaultDir', {
          sessionId: candidate.sessionId
        })) as string;
        if (dir) return { sessionId: candidate.sessionId, defaultDir: dir };
      } catch {
        // 僵尸 / 已关闭会话，继续尝试下一个
      }
    }

    const socket = this.bridge.createSocket();
    this.ownedSockets.add(socket);
    try {
      const sessionId = await socket.createSession(connId, 'aicmd-fs');
      const dir = (await this.launcher.api('/api/file/defaultDir', { sessionId })) as string;
      if (!dir) throw new Error('无法获取远程默认目录');
      return { sessionId, defaultDir: dir, socket };
    } catch (err) {
      this.ownedSockets.delete(socket);
      socket.close();
      throw err;
    }
  }

  private getSession(connId: string): Promise<SessionEntry> {
    const cached = this.sessions.get(connId);
    if (cached) return cached;
    const pending = this.resolveSession(connId).catch((err) => {
      if (this.sessions.get(connId) === pending) this.sessions.delete(connId);
      throw err;
    });
    this.sessions.set(connId, pending);
    return pending;
  }

  private invalidate(connId: string): void {
    this.sessions.delete(connId);
  }

  private isSessionError(err: any): boolean {
    const msg = String(err?.message || err);
    return /Session not found|session.*(closed|not connected|disconnected)|连接已关闭|WebSocket/i.test(msg);
  }

  /** 执行一次文件 API；仅在会话失效时重建并重试一次（普通文件错误不重连）。 */
  private async withSession<T>(
    connId: string,
    fn: (sessionId: string) => Promise<T>
  ): Promise<T> {
    let session: SessionEntry;
    try {
      session = await this.getSession(connId);
    } catch (err) {
      this.invalidate(connId);
      session = await this.getSession(connId);
    }
    try {
      return await fn(session.sessionId);
    } catch (err) {
      if (!this.isSessionError(err)) throw err;
      this.invalidate(connId);
      const fresh = await this.getSession(connId);
      return fn(fresh.sessionId);
    }
  }

  private async defaultDir(connId: string): Promise<string> {
    const session = await this.getSession(connId);
    return session.defaultDir;
  }

  /** 供「浏览远程文件」命令使用：直接定位到会话的家目录，而不是虚拟根。 */
  async rootUri(connId: string): Promise<vscode.Uri> {
    const dir = await this.defaultDir(connId);
    return vscode.Uri.from({
      scheme: 'aicmd',
      authority: encodeURIComponent(connId),
      path: dir
    });
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => { /* 轮询式文件系统，不提供 watch */ });
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const connId = this.connId(uri);
    const p = this.remotePath(uri);
    const empty: vscode.FileStat = { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    if (p === '/' || p === (await this.defaultDir(connId))) return empty;

    const parent = path.posix.dirname(p);
    const name = path.posix.basename(p);
    const entries: RemoteEntry[] = await this.withSession(connId, (sessionId) =>
      this.launcher.api('/api/file/list', { sessionId, path: parent }) as Promise<RemoteEntry[]>
    );
    const entry = (entries || []).find((e) => e.name === name);
    if (!entry) throw vscode.FileSystemError.FileNotFound(uri);
    return {
      type: this.fileType(entry),
      ctime: 0,
      mtime: Number(entry.mtime) || 0,
      size: Number(entry.size) || 0
    };
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const connId = this.connId(uri);
    const p = this.remotePath(uri);
    if (p === '/') {
      const home = await this.defaultDir(connId);
      return [[path.posix.basename(home), vscode.FileType.Directory]];
    }
    const entries: RemoteEntry[] = await this.withSession(connId, (sessionId) =>
      this.launcher.api('/api/file/list', { sessionId, path: p }) as Promise<RemoteEntry[]>
    );
    return (entries || []).map((e) => [e.name, this.fileType(e)]);
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const connId = this.connId(uri);
    const p = this.remotePath(uri);
    if (p === '/') throw vscode.FileSystemError.FileNotFound(uri);
    return this.withSession(connId, (sessionId) => this.launcher.downloadFile(sessionId, p));
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    const connId = this.connId(uri);
    const p = this.remotePath(uri);
    if (p === '/') throw new Error('不能写入虚拟根目录');
    const exists = await this.exists(uri);
    if (exists && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }
    if (!exists && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    const buffer = Buffer.from(content);
    await this.withSession(connId, (sessionId) =>
      this.launcher.uploadFile(sessionId, p, buffer)
    );
    this.emitter.fire([{ uri, type: exists ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created }]);
  }

  private async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await this.stat(uri);
      return true;
    } catch (e) {
      if (e instanceof vscode.FileSystemError && e.code === 'FileNotFound') return false;
      throw e;
    }
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    const connId = this.connId(uri);
    const p = this.remotePath(uri);
    if (p === '/') return;
    await this.withSession(connId, (sessionId) =>
      this.launcher.api('/api/file/mkdir', { sessionId, path: p })
    );
    this.emitter.fire([{ uri, type: vscode.FileChangeType.Created }]);
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    const connId = this.connId(uri);
    const p = this.remotePath(uri);
    if (p === '/') throw new Error('不能删除虚拟根目录');
    const stat = await this.stat(uri);
    if (stat.type === vscode.FileType.Directory && !options.recursive) {
      throw new Error('删除目录需要 recursive 选项');
    }
    await this.withSession(connId, (sessionId) =>
      this.launcher.api('/api/file/remove', { sessionId, path: p })
    );
    this.emitter.fire([{ uri, type: vscode.FileChangeType.Deleted }]);
  }

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean }
  ): Promise<void> {
    if (this.connId(oldUri) !== this.connId(newUri)) {
      throw new Error('不能跨连接移动文件，请下载后重新上传');
    }
    const connId = this.connId(oldUri);
    await this.withSession(connId, (sessionId) =>
      this.launcher.api('/api/file/rename', {
        sessionId,
        oldPath: this.remotePath(oldUri),
        newPath: this.remotePath(newUri)
      })
    );
    this.emitter.fire([
      { uri: oldUri, type: vscode.FileChangeType.Deleted },
      { uri: newUri, type: vscode.FileChangeType.Created }
    ]);
  }

  dispose(): void {
    for (const socket of this.ownedSockets) socket.close();
    this.ownedSockets.clear();
    this.sessions.clear();
    this.emitter.dispose();
  }
}
