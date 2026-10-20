import * as cp from 'child_process';
import * as net from 'net';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

/** 连接配置（与后端 connections.json 字段对齐的子集）。 */
export interface AicmdConnection {
  id: string;
  name?: string;
  type?: 'ssh' | 'local' | string;
  host?: string;
  username?: string;
}

/**
 * 负责在扩展宿主外启动 AICmd 的后端服务（Express + WebSocket）。
 *
 * 设计要点：
 * - 复用项目根目录的 server.js（与生产 / CLI 完全一致），以子进程方式运行，
 *   因此 SSH 终端、AI Agent、审计、监控、批量、文件传输等功能零改动即可使用。
 * - 服务仅在 127.0.0.1 监听，WebView 通过同源 iframe 加载前端 SPA，
 *   无需 token / 跨域处理。
 * - 数据目录默认复用桌面端 / CLI 的 ~/.aicmd，连接等数据与独立运行的 fshell 共享。
 */
export class ServerLauncher {
  private child?: cp.ChildProcess;
  private port = 0;
  private started = false;
  private startPort = 9802;
  private spawnError?: string;
  private lastStderr = '';
  // 防止并发调用重复启动：多路 ensureStarted 共享同一次启动过程
  private startPromise?: Promise<string>;
  // 是否为本扩展主动停止（用于区分「意外崩溃」）
  private intentionalStop = false;
  // 每次启动生成的一次性令牌，避免 ping 误判其它进程占用端口
  private launchToken?: string;
  // 后端进程意外退出时回调（用于通知用户并关闭所有面板）
  public onUnexpectedExit?: () => void;
  private readonly dataDir: string;

  constructor(
    private readonly projectRoot: string,
    dataDir?: string,
    private readonly logFn?: (line: string, isErr?: boolean) => void
  ) {
    // 默认复用桌面端 / CLI 的数据目录 ~/.aicmd，连接配置、会话、AI 配置、
    // 审计日志等全部与独立运行的 fshell 共用同一份文件。
    this.dataDir =
      dataDir && dataDir.trim()
        ? dataDir.trim()
        : path.join(os.homedir(), '.aicmd');
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get isStarted(): boolean {
    return this.started;
  }

  /** 同时写入 OutputChannel（若有）与控制台。 */
  private log(line: string, isErr = false): void {
    if (this.logFn) this.logFn(line, isErr);
    if (isErr) console.error(line);
    else console.log(line);
  }

  /** 启动服务（幂等，且并发安全）。返回服务根地址。 */
  async ensureStarted(startPort = 9802): Promise<string> {
    this.startPort = startPort;
    if (this.started) return this.url;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startInternal(startPort);
    try {
      return await this.startPromise;
    } finally {
      // 不论成功失败都清空，便于下次刷新可重试
      this.startPromise = undefined;
    }
  }

  /** 打包态 runtime：后端已被 esbuild 内联为单文件 server.js，不再存在 dist/server/index.js。
   *  由 scripts/prepare-vscode-runtime.mjs 在 runtime/package.json 写入 aicmdBundled 标记。 */
  private isBundledRuntime(): boolean {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8')
      );
      return pkg?.aicmdBundled === true;
    } catch {
      return false;
    }
  }

  /** 实际的启动流程（逐个候选尝试）。 */
  private async startInternal(startPort: number): Promise<string> {
    // 打包态下后端已内联进 server.js，无需（也不存在）dist/server/index.js，跳过该预检
    if (!this.isBundledRuntime()) {
      const distServer = path.join(this.projectRoot, 'dist', 'server', 'index.js');
      if (!fs.existsSync(distServer)) {
        throw new Error(
          '未找到后端构建产物 dist/server/index.js，请先在本项目根目录执行 `pnpm build-only`（或 pnpm build）。'
        );
      }
    }
    const serverJs = path.join(this.projectRoot, 'server.js');
    if (!fs.existsSync(serverJs)) {
      throw new Error('找不到 server.js：' + serverJs);
    }
    // 每次启动生成一次性令牌，作为 ping 健康检查的依据，规避端口被其它进程占用时误判
    this.launchToken = crypto.randomBytes(16).toString('hex');
    this.intentionalStop = false;

    // 优先复用已在运行的服务（桌面端 / CLI / 其它 VSCode 窗口），共享同一数据目录，
    // 避免每个宿主各拉一个进程。复用仅依赖 /health 探活，不做 token 校验。
    const reused = await this.findRunningServer(startPort);
    if (reused !== undefined) {
      this.port = reused;
      this.started = true;
      this.log(`[aicmd-server] reuse existing server at ${this.url}`);
      return this.url;
    }

    // GUI 扩展宿主的 PATH 通常不含 nvm 等用户级 node，逐个候选尝试直到成功
    const errors: string[] = [];
    for (const nodeBin of this.resolveNodeCandidates()) {
      this.port = await this.findAvailablePort(startPort);
      const err = await this.tryStart(nodeBin, serverJs);
      if (!err) {
        this.started = true;
        this.log(`[aicmd-server] ready at ${this.url} (node: ${nodeBin})`);
        return this.url;
      }
      errors.push(`${nodeBin} → ${err}`);
      this.stop();
    }
    throw new Error('AICmd 服务启动失败，已依次尝试: ' + errors.join(' | '));
  }

  /**
   * 解析可用的 node 可执行文件候选列表。
   * 优先复用以宿主（CodeBuddy/VSCode）自带的 Electron 运行时：配合
   * ELECTRON_RUN_AS_NODE=1 直接当纯 Node 运行 server.js，无需依赖用户 PATH
   * 中的 nvm / Homebrew。nvm / Homebrew / 系统 node 作为兜底（其 ABI 与
   * node-pty 更匹配，可作为后备）。
   */
  private resolveNodeCandidates(): string[] {
    const list: string[] = [];
    if (process.env.AICMD_NODE) list.push(process.env.AICMD_NODE);
    // 宿主二进制优先：直接复用宿主运行时，不另装 node
    if (process.execPath) list.push(process.execPath);
    try {
      const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
      const versions = fs.readdirSync(nvmDir).sort().reverse();
      for (const v of versions) list.push(path.join(nvmDir, v, 'bin', 'node'));
    } catch {
      /* 无 nvm */
    }
    list.push('node', '/opt/homebrew/bin/node', '/usr/local/bin/node');
    return [...new Set(list)];
  }

  /** 尝试用指定 node 可执行文件启动服务，成功返回 undefined，失败返回原因。 */
  private async tryStart(
    nodeBin: string,
    serverJs: string
  ): Promise<string | undefined> {
    this.spawnError = undefined;
    this.lastStderr = '';
    // 扩展宿主可能带有指向宿主内部模块的 NODE_OPTIONS，会让干净的
    // node / Electron-node 子进程启动即崩，这里必须剔除。
    const { NODE_OPTIONS, ...cleanEnv } = process.env;
    this.child = cp.spawn(
      nodeBin,
      [serverJs, '--port', String(this.port)],
      {
        cwd: this.projectRoot,
        env: {
          ...cleanEnv,
          NODE_ENV: 'production',
          AICMD_DATA_DIR: this.dataDir,
          // 启动令牌：server.js 的 /health 端点据此拒绝伪造的探活
          AICMD_LAUNCH_TOKEN: this.launchToken || '',
          // 宿主是 Electron 时该变量使其按纯 Node 执行；真实 node 会忽略它
          ELECTRON_RUN_AS_NODE: '1'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    this.child.stdout?.on('data', (d) => {
      const line = d.toString().trimEnd();
      // 过滤高频的 [WS] 调试噪声（含每次按键），避免 OutputChannel 被打爆
      if (line && !line.startsWith('[WS]')) {
        this.log('[aicmd-server] ' + line);
      }
    });
    this.child.stderr?.on('data', (d) => {
      const line = d.toString().trimEnd();
      if (line) {
        this.lastStderr = line;
        this.log('[aicmd-server] ' + line, true);
      }
    });
    this.child.on('error', (err) => {
      this.spawnError = err.message;
      this.log('[aicmd-server] spawn error: ' + err.message, true);
    });
    this.child.on('exit', (code) => {
      const exited = this.child;
      this.log(`[aicmd-server] exited with code ${code}`, true);
      this.started = false;
      if (!this.spawnError) {
        this.spawnError = `进程提前退出(code=${code})`;
      }
      // 非主动停止且退出的是当前活动子进程 → 视为意外崩溃
      if (!this.intentionalStop && exited === this.child) {
        this.onUnexpectedExit?.();
      }
    });

    return this.waitForReady(8000);
  }

  /** 轮询直到服务可响应；失败返回错误描述（不抛异常）。 */
  private async waitForReady(timeoutMs: number): Promise<string | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.ping()) return undefined;
      if (this.spawnError) return '无法启动进程: ' + this.spawnError;
      await new Promise((r) => setTimeout(r, 300));
    }
    this.stop();
    return `启动超时${this.lastStderr ? '，最后输出: ' + this.lastStderr : ''}`;
  }

  private ping(): Promise<boolean> {
    return new Promise((resolve) => {
      const token = this.launchToken ? `?token=${this.launchToken}` : '';
      const req = http.get(
        `http://127.0.0.1:${this.port}/health${token}`,
        (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        }
      );
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /** 探测某端口上的服务是否健康（不带 token，用于发现已存在的服务）。 */
  private probeHealth(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve(false);
          try {
            resolve(JSON.parse(data)?.ok === true);
          } catch {
            resolve(false);
          }
        });
      });
      req.on('error', () => resolve(false));
      req.setTimeout(800, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /** 在候选端口范围内寻找一个已在运行且健康的服务，返回其端口；无则 undefined。 */
  private async findRunningServer(start: number): Promise<number | undefined> {
    for (let p = start; p < start + 200; p++) {
      if (await this.probeHealth(p)) return p;
    }
    return undefined;
  }

  private async findAvailablePort(start: number): Promise<number> {
    for (let p = start; p < start + 200; p++) {
      if (await this.isPortFree(p)) return p;
    }
    throw new Error('找不到可用端口');
  }

  private isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const s = net.createServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
  }

  /**
   * 读取连接列表（与桌面端 / CLI 共用同一 connections.json）。
   * 会自动确保后端已启动。返回解密后的连接数组。
   */
  async getConnections(): Promise<AicmdConnection[]> {
    await this.ensureStarted(this.startPort);
    const body = await this.api('/api/connection/getConnections', {});
    const list = Array.isArray(body) ? body : (body?.data ?? []);
    return list as AicmdConnection[];
  }

  /** 删除连接（与桌面端 / CLI 共用同一后端 API）。 */
  async deleteConnection(id: string): Promise<void> {
    await this.ensureStarted(this.startPort);
    await this.api('/api/connection/deleteConnection', { id });
  }

  /** 简单的内部 POST 请求封装（带超时与业务码校验）。 */
  private api(pathname: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body || {});
      const req = http.request(
        {
          host: '127.0.0.1',
          port: this.port,
          path: pathname,
          method: 'POST',
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
              }
              const json = JSON.parse(data);
              // 后端出错时返回 { ret: 500, msg }，必须显式抛出，否则删除等操作会被误判为成功
              if (json && json.ret !== undefined && json.ret !== 0) {
                return reject(new Error(json.msg || `AICmd 服务错误(${json.ret})`));
              }
              resolve(json?.data !== undefined ? json.data : json);
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('timeout', () => req.destroy(new Error('请求超时')));
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /** 关闭子进程。 */
  stop(): void {
    this.intentionalStop = true;
    if (this.child) {
      try {
        this.child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      this.child = undefined;
    }
    this.started = false;
    this.startPromise = undefined;
  }
}
