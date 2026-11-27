/**
 * 连接代理工具：直连 / 系统代理 / 自定义代理（HTTP、HTTPS、SOCKS4、SOCKS5）。
 *
 * SSH 通过 ssh2 的 sock 选项使用这里建立好的 socket；RDP 隧道在 TLS 握手前
 * 使用这里建立好的 socket。system 模式先读常规的 *_proxy / *_PROXY 与
 * NO_PROXY / no_proxy 环境变量（小写优先），未设置时再读取操作系统代理设置
 * （macOS scutil、Windows 注册表、Linux gsettings），从而与浏览器「使用系统
 * 代理」的场景保持一致。
 */
import * as net from 'net';
import * as tls from 'tls';
import { execFileSync } from 'child_process';
import { ConnectionEntity } from '../model/connection.entity';

type LogFn = (msg: string) => void;

/**
 * Node 18.13+ 的 Happy Eyeballs 在全部候选地址失败时会抛 AggregateError，
 * 它的 message 可能是空串（例如 .local 的 mDNS 记录里混着 link-local IPv6），
 * 直接取 err.message 会让日志只剩「连接 xxx: 「而看不出 errno。
 */
export function describeSocketError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [];
  if (err.message) parts.push(err.message);
  const code = (err as NodeJS.ErrnoException).code;
  if (code) parts.push(code);
  const errors = (err as Error & { errors?: unknown[] }).errors;
  if (Array.isArray(errors) && errors.length) {
    const codes = Array.from(new Set(errors.map((e: any) => e?.code || e?.message || '?')));
    parts.push(`[${codes.join(', ')}]`);
  }
  return parts.join(' ') || err.name;
}

export interface ResolvedProxy {
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

const DEFAULT_PORTS: Record<ResolvedProxy['type'], number> = {
  http: 80,
  https: 443,
  socks4: 1080,
  socks5: 1080,
};

/**
 * 代理握手阶段多个步骤共用同一个 socket，TCP 粘包会把下一步的字节提前送来。
 * 这里按 socket 暂存多余字节，而不是 unshift —— unshift 需要先 pause，
 * 但显式 pause 后调用方再挂 data 监听不会自动恢复流动，连接会静默卡死。
 */
const handshakeBuffers = new WeakMap<net.Socket, Buffer>();

function takeBuffered(socket: net.Socket, length: number): Buffer | null {
  const buf = handshakeBuffers.get(socket);
  if (!buf || buf.length < length) return null;
  const result = Buffer.from(buf.subarray(0, length));
  handshakeBuffers.set(socket, buf.subarray(length));
  return result;
}

function appendBuffered(socket: net.Socket, chunk: Buffer): void {
  const buf = handshakeBuffers.get(socket);
  handshakeBuffers.set(socket, buf ? Buffer.concat([buf, chunk]) : Buffer.from(chunk));
}

function flushBuffered(socket: net.Socket): void {
  const buf = handshakeBuffers.get(socket);
  handshakeBuffers.delete(socket);
  if (buf?.length) socket.unshift(buf);
}

/** 失败路径销毁 socket；保留一个空 error 监听，避免后续异步 error 变成未捕获异常 */
function safeDestroy(socket: net.Socket): void {
  socket.removeAllListeners('error');
  socket.on('error', () => {});
  socket.destroy();
}

function envValue(lower: string, upper: string): string {
  return process.env[lower] || process.env[upper] || '';
}

function parseProxyUrl(raw: string): ResolvedProxy | null {
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    const scheme = url.protocol.replace(':', '').toLowerCase();
    const type = scheme === 'socks5h' ? 'socks5' : scheme;
    if (!['http', 'https', 'socks4', 'socks5'].includes(type)) return null;
    const host = decodeURIComponent(url.hostname);
    if (!host) return null;
    return {
      type: type as ResolvedProxy['type'],
      host,
      port: Number(url.port) || DEFAULT_PORTS[type as ResolvedProxy['type']],
      username: decodeURIComponent(url.username) || undefined,
      password: decodeURIComponent(url.password) || undefined,
    };
  } catch {
    return null;
  }
}

interface SystemProxySetting {
  proxy: ResolvedProxy;
  bypass: string[];
}

const OS_PROXY_CACHE_MS = 3000;
let osProxyCache: { platform: string; at: number; value: SystemProxySetting | null } | null = null;

/** 系统命令只读、固定参数，失败时静默回退（例如 Linux 未装 gsettings） */
function runSystemCommand(file: string, args: string[]): string {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function proxyFromHostPort(host: string, port: string | number, type: ResolvedProxy['type']): ResolvedProxy | null {
  if (!host) return null;
  return { type, host, port: Number(port) || DEFAULT_PORTS[type] };
}

/** macOS：scutil --proxy */
function readMacOSProxy(): SystemProxySetting | null {
  const out = runSystemCommand('scutil', ['--proxy']);
  if (!out) return null;
  const values: Record<string, string> = {};
  const exceptions: string[] = [];
  let inExceptions = false;
  for (const line of out.split(/\r?\n/)) {
    const text = line.trim();
    if (/^ExceptionsList\s*:\s*<array>\s*\{/.test(text)) { inExceptions = true; continue; }
    if (inExceptions) {
      if (text === '}') { inExceptions = false; continue; }
      const item = text.match(/^\d+\s*:\s*(.*)$/);
      if (item) exceptions.push(item[1]);
      continue;
    }
    const kv = text.match(/^([A-Za-z0-9]+)\s*:\s*(.*)$/);
    if (kv) values[kv[1]] = kv[2];
  }
  const enabled = (key: string) => values[key] === '1' || values[key] === 'true';
  let proxy: ResolvedProxy | null = null;
  if (enabled('HTTPSEnable') && values.HTTPSProxy) {
    // 系统设置里的「HTTPS 代理」指的是用于 HTTPS 流量的 HTTP 代理（CONNECT），
    // 并非要求与代理本身建立 TLS，因此按 http 处理。
    proxy = proxyFromHostPort(values.HTTPSProxy, values.HTTPSPort || '', 'http');
  } else if (enabled('HTTPEnable') && values.HTTPProxy) {
    proxy = proxyFromHostPort(values.HTTPProxy, values.HTTPPort || '', 'http');
  } else if (enabled('SOCKSEnable') && values.SOCKSProxy) {
    proxy = proxyFromHostPort(values.SOCKSProxy, values.SOCKSPort || '', 'socks5');
  }
  return proxy ? { proxy, bypass: exceptions } : null;
}

/** Windows：HKCU\...\Internet Settings（浏览器「使用系统代理」读取的同一处配置） */
function readWindowsProxy(): SystemProxySetting | null {
  const out = runSystemCommand('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings']);
  if (!out) return null;
  const values: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const kv = line.trim().match(/^([A-Za-z]+)\s+REG_\w+\s+(.*)$/);
    if (kv) values[kv[1]] = kv[2];
  }
  if (values.ProxyEnable !== '0x1' && values.ProxyEnable !== '1') return null;

  let proxy: ResolvedProxy | null = null;
  const server = values.ProxyServer || '';
  if (/^\w+=/i.test(server)) {
    const entries: Record<string, string> = {};
    for (const part of server.split(';')) {
      const kv = part.trim().match(/^(\w+)=(.*)$/i);
      if (kv) entries[kv[1].toLowerCase()] = kv[2];
    }
    // 同上：ProxyServer 的 https= 是用于 HTTPS 流量的 HTTP 代理，不是 TLS 代理
    const type: ResolvedProxy['type'] = entries.https || entries.http ? 'http' : 'socks5';
    const address = entries.https || entries.http || entries.socks || entries.all;
    if (address) {
      const [host, port] = address.split(':');
      proxy = proxyFromHostPort(host, port || '', type);
    }
  } else if (server) {
    const [host, port] = server.split(':');
    proxy = proxyFromHostPort(host, port || '', 'http');
  }

  const bypass = (values.ProxyOverride || '').split(';')
    .filter(Boolean)
    .map((entry) => entry === '<local>' ? 'localhost' : entry);
  return proxy ? { proxy, bypass } : null;
}

/** Linux/GNOME：gsettings org.gnome.system.proxy */
function readLinuxProxy(): SystemProxySetting | null {
  const unquote = (text: string) => (text.trim().match(/^'(.*)'$/s)?.[1] ?? text.trim());
  if (unquote(runSystemCommand('gsettings', ['get', 'org.gnome.system.proxy', 'mode'])) !== 'manual') return null;

  let proxy: ResolvedProxy | null = null;
  const schemas: Array<[string, ResolvedProxy['type']]> = [['https', 'http'], ['http', 'http'], ['socks', 'socks5']];
  for (const [schema, type] of schemas) {
    const host = unquote(runSystemCommand('gsettings', ['get', `org.gnome.system.proxy.${schema}`, 'host']));
    if (host) {
      proxy = proxyFromHostPort(host, unquote(runSystemCommand('gsettings', ['get', `org.gnome.system.proxy.${schema}`, 'port'])), type);
      break;
    }
  }
  if (!proxy) return null;

  const ignoreHosts = runSystemCommand('gsettings', ['get', 'org.gnome.system.proxy', 'ignore-hosts']);
  const bypass = ignoreHosts.match(/'([^']*)'/g)?.map((entry) => entry.slice(1, -1)) || [];
  return { proxy, bypass };
}

/** 带 3 秒缓存，避免每次连接都 fork 系统命令；平台变化立即失效 */
function readOsProxy(): SystemProxySetting | null {
  const now = Date.now();
  if (osProxyCache && osProxyCache.platform === process.platform && now - osProxyCache.at < OS_PROXY_CACHE_MS) {
    return osProxyCache.value;
  }
  let value: SystemProxySetting | null = null;
  try {
    if (process.platform === 'darwin') value = readMacOSProxy();
    else if (process.platform === 'win32') value = readWindowsProxy();
    else if (process.platform === 'linux') value = readLinuxProxy();
  } catch {
    value = null;
  }
  osProxyCache = { platform: process.platform, at: now, value };
  return value;
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc * 256 + Number(part)) >>> 0, 0);
}

/** 单条绕过规则匹配：支持 host、*.domain、.domain、host:port、IPv4 CIDR、* */
function matchesBypassRule(hostname: string, port: number, entry: string): boolean {
  if (entry === '*') return true;
  let rule = entry.toLowerCase();
  const colon = rule.lastIndexOf(':');
  if (colon > -1 && /^\d+$/.test(rule.slice(colon + 1))) {
    if (Number(rule.slice(colon + 1)) !== port) return false;
    rule = rule.slice(0, colon);
  }
  const slash = rule.indexOf('/');
  if (slash > -1 && net.isIP(hostname) === 4) {
    const bits = Number(rule.slice(slash + 1));
    const base = rule.slice(0, slash);
    if (net.isIP(base) !== 4 || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ipv4ToInt(hostname) & mask) === (ipv4ToInt(base) & mask);
  }
  rule = rule.replace(/^\*\./, '').replace(/^\./, '');
  return hostname === rule || hostname.endsWith('.' + rule);
}

/** NO_PROXY 环境变量 + 系统代理绕过列表 */
function matchesNoProxy(host: string, port: number, extraBypass = ''): boolean {
  const raw = [envValue('no_proxy', 'NO_PROXY'), extraBypass].filter(Boolean).join(',');
  if (!raw) return false;
  const hostname = host.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  return raw.split(/[,\s]+/).some((entry) => entry && matchesBypassRule(hostname, port, entry));
}

/** 解析某个目标连接实际使用的代理；null 表示直连 */
export function resolveProxy(connection: ConnectionEntity, targetHost: string, targetPort: number): ResolvedProxy | null {
  const mode = connection.proxy?.mode || 'direct';
  if (mode === 'direct') return null;

  if (mode === 'system') {
    // 环境变量优先（显式配置），未设置时回退到浏览器的「使用系统代理」来源
    const raw = envValue('all_proxy', 'ALL_PROXY')
      || envValue('https_proxy', 'HTTPS_PROXY')
      || envValue('http_proxy', 'HTTP_PROXY');
    const systemProxy = raw ? null : readOsProxy();
    if (matchesNoProxy(targetHost, targetPort, systemProxy?.bypass.join(',') || '')) return null;
    return raw ? parseProxyUrl(raw) : (systemProxy?.proxy || null);
  }

  const proxy = connection.proxy;
  if (!proxy?.host?.trim()) return null;
  const type = proxy.type || 'http';
  return {
    type,
    host: proxy.host.trim(),
    port: Number(proxy.port) || DEFAULT_PORTS[type],
    username: proxy.username || undefined,
    password: proxy.password || undefined,
  };
}

/**
 * socket 连接阶段（含代理握手）统一超时，成功后清除，避免干扰后续协议超时。
 * TLSSocket 会先触发 TCP 'connect'，必须等 'secureConnect' 才算连上 HTTPS 代理，
 * 否则会在 TLS 握手完成前把 CONNECT 明文写出去。
 */
function waitForConnect(
  socket: net.Socket,
  timeout: number,
  label: string,
  waitEvent: 'connect' | 'secureConnect' = 'connect',
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.removeListener('error', onError);
      socket.removeListener('timeout', onTimeout);
      socket.removeListener(waitEvent, onConnect);
      socket.setTimeout(0);
    };
    const onError = (err: Error) => { cleanup(); safeDestroy(socket); reject(new Error(`${label}: ${describeSocketError(err)}`)); };
    const onTimeout = () => { cleanup(); safeDestroy(socket); reject(new Error(`${label} 超时 (${timeout}ms)`)); };
    const onConnect = () => { cleanup(); resolve(socket); };
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
    socket.once(waitEvent, onConnect);
    socket.setTimeout(timeout);
  });
}

/** 从 socket 读取指定字节数；多读的字节留在 handshakeBuffers 中供下一步使用 */
function readExactly(socket: net.Socket, length: number, timeout: number): Promise<Buffer> {
  const immediate = takeBuffered(socket, length);
  if (immediate) return Promise.resolve(immediate);

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('timeout', onTimeout);
      socket.setTimeout(0);
    };
    const onError = (err: Error) => {
      if (settled) return;
      settled = true; cleanup(); safeDestroy(socket); reject(new Error(`代理读取失败: ${describeSocketError(err)}`));
    };
    const onTimeout = () => {
      if (settled) return;
      settled = true; cleanup(); safeDestroy(socket); reject(new Error(`代理响应超时 (${timeout}ms)`));
    };
    const onData = (chunk: Buffer) => {
      if (settled) return;
      appendBuffered(socket, chunk);
      const data = takeBuffered(socket, length);
      if (!data) return;
      settled = true;
      cleanup();
      resolve(data);
    };
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
    socket.setTimeout(timeout);
  });
}

/** HTTP/HTTPS 代理：CONNECT 隧道；隧道建立后返回原始 socket，由调用方叠加 TLS */
/** 在已连到代理的 socket 上发 CONNECT 并等待 2xx 响应 */
function sendConnect(socket: net.Socket, proxy: ResolvedProxy, host: string, port: number, timeout: number): Promise<void> {
  const target = `${host}:${port}`;
  let head = `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n`;
  if (proxy.username) {
    const auth = Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64');
    head += `Proxy-Authorization: Basic ${auth}\r\n`;
  }
  head += 'Proxy-Connection: Keep-Alive\r\n\r\n';
  socket.write(head);

  return new Promise<void>((resolve, reject) => {
    let text = '';
    let settled = false;
    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('timeout', onTimeout);
      socket.setTimeout(0);
    };
    const onError = (err: Error) => {
      if (settled) return;
      settled = true; cleanup(); reject(new Error(`代理连接失败: ${describeSocketError(err)}`));
    };
    const onTimeout = () => {
      if (settled) return;
      settled = true; cleanup(); reject(new Error(`代理 CONNECT 超时 (${timeout}ms)`));
    };
    const onData = (chunk: Buffer) => {
      if (settled) return;
      appendBuffered(socket, chunk);
      text += chunk.toString('latin1');
      const end = text.indexOf('\r\n\r\n');
      if (end === -1) {
        if (text.length > 65536) {
          settled = true; cleanup(); reject(new Error('代理 CONNECT 响应过大'));
        }
        return;
      }
      settled = true;
      cleanup();
      const response = text.slice(0, end + 4);
      takeBuffered(socket, Buffer.byteLength(response, 'latin1'));
      const match = response.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/);
      if (!match || Number(match[1]) < 200 || Number(match[1]) >= 300) {
        reject(new Error(`代理拒绝 CONNECT: ${response.split('\r\n')[0]}`));
      } else {
        resolve();
      }
    };
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
    socket.setTimeout(timeout);
  });
}

/**
 * HTTP(S) 代理：宽松策略 —— HTTPS 代理先尝试 TLS，握手失败（例如代理其实是
 * 本地工具的 Mixed/HTTP 端口，或 https_proxy 里的 https:// 只是表示用于 HTTPS
 * 流量）时自动降级为明文 CONNECT，不因协议标记不一致而直接断连。
 */
async function connectHttpProxy(
  proxy: ResolvedProxy, host: string, port: number, timeout: number, log: LogFn,
): Promise<net.Socket> {
  if (proxy.type === 'https') {
    const tlsSocket = tls.connect({
      host: proxy.host,
      port: proxy.port,
      servername: net.isIP(proxy.host) ? undefined : proxy.host,
      rejectUnauthorized: true,
    }) as unknown as net.Socket;
    try {
      // 探测超时收短：明文代理不会响应 TLS ClientHello，不能让用户等满 30 秒连接超时
      await waitForConnect(
        tlsSocket, Math.min(timeout, 3000),
        `HTTPS 代理 ${proxy.host}:${proxy.port} TLS 握手`, 'secureConnect',
      );
      await sendConnect(tlsSocket, proxy, host, port, timeout);
      return tlsSocket;
    } catch (err: any) {
      safeDestroy(tlsSocket);
      log(`HTTPS 代理 ${proxy.host}:${proxy.port} TLS 握手失败，降级为明文 CONNECT: ${err.message}`);
    }
  }

  const socket = net.createConnection({ host: proxy.host, port: proxy.port });
  try {
    await waitForConnect(socket, timeout, `代理 ${proxy.host}:${proxy.port}`);
    await sendConnect(socket, proxy, host, port, timeout);
    return socket;
  } catch (err) {
    safeDestroy(socket);
    throw err;
  }
}

function socks5Address(host: string): Buffer {
  const ipv4 = net.isIP(host) === 4 ? host : '';
  if (ipv4) return Buffer.concat([Buffer.from([1]), Buffer.from(ipv4.split('.').map(Number))]);
  const domain = Buffer.from(host, 'utf8');
  if (domain.length > 255) throw new Error('SOCKS5 代理目标域名过长');
  return Buffer.concat([Buffer.from([3, domain.length]), domain]);
}

/** SOCKS5：握手（可选用户名密码）+ CONNECT 请求 */
async function connectSocks5Proxy(proxy: ResolvedProxy, host: string, port: number, timeout: number): Promise<net.Socket> {
  const socket = net.createConnection({ host: proxy.host, port: proxy.port });
  try {
    await waitForConnect(socket, timeout, `SOCKS5 代理 ${proxy.host}:${proxy.port}`);

    socket.write(proxy.username ? Buffer.from([5, 2, 2, 0]) : Buffer.from([5, 1, 0]));
    const greeting = await readExactly(socket, 2, timeout);
    if (greeting[0] !== 5) throw new Error(`代理不是 SOCKS5 协议 (VER=${greeting[0]})`);
    if (greeting[1] === 2) {
      if (!proxy.username) throw new Error('SOCKS5 代理要求用户名密码认证');
      const user = Buffer.from(proxy.username, 'utf8');
      const pass = Buffer.from(proxy.password || '', 'utf8');
      socket.write(Buffer.concat([Buffer.from([1, user.length]), user, Buffer.from([pass.length]), pass]));
      const authReply = await readExactly(socket, 2, timeout);
      if (authReply[1] !== 0) throw new Error(`SOCKS5 代理认证失败 (STATUS=${authReply[1]})`);
    } else if (greeting[1] !== 0) {
      throw new Error(`SOCKS5 代理不支持的认证方式 (METHOD=${greeting[1]})`);
    }

    const portBuf = Buffer.alloc(2);
    portBuf.writeUInt16BE(port);
    socket.write(Buffer.concat([Buffer.from([5, 1, 0]), socks5Address(host), portBuf]));

    const replyHead = await readExactly(socket, 4, timeout);
    if (replyHead[1] !== 0) throw new Error(`SOCKS5 代理拒绝连接 (REP=${replyHead[1]})`);
    const atyp = replyHead[3];
    let restLen = -1;
    if (atyp === 1) restLen = 6;
    else if (atyp === 4) restLen = 18;
    else if (atyp === 3) restLen = (await readExactly(socket, 1, timeout))[0] + 2;
    if (restLen < 0) throw new Error(`SOCKS5 代理返回未知地址类型 (ATYP=${atyp})`);
    await readExactly(socket, restLen, timeout);
    return socket;
  } catch (err) {
    safeDestroy(socket);
    throw err;
  }
}

/** SOCKS4/4a：域名通过 0.0.0.1 + 域名 发送（SOCKS4a 扩展） */
async function connectSocks4Proxy(proxy: ResolvedProxy, host: string, port: number, timeout: number): Promise<net.Socket> {
  const socket = net.createConnection({ host: proxy.host, port: proxy.port });
  try {
    await waitForConnect(socket, timeout, `SOCKS4 代理 ${proxy.host}:${proxy.port}`);

    const isIpv4 = net.isIP(host) === 4;
    const ip = isIpv4 ? host : '0.0.0.1';
    const userId = Buffer.from(proxy.username || '', 'utf8');
    const address = Buffer.concat([
      Buffer.from(ip.split('.').map(Number)),
      userId,
      Buffer.from([0]),
      ...(!isIpv4 ? [Buffer.from(host, 'utf8'), Buffer.from([0])] : []),
    ]);
    const portBuf = Buffer.alloc(2);
    portBuf.writeUInt16BE(port);
    socket.write(Buffer.concat([Buffer.from([4, 1]), portBuf, address]));

    const reply = await readExactly(socket, 8, timeout);
    if (reply[0] !== 0 || reply[1] !== 0x5a) throw new Error(`SOCKS4 代理拒绝连接 (CD=${reply[1]})`);
    return socket;
  } catch (err) {
    safeDestroy(socket);
    throw err;
  }
}

/**
 * 按连接配置建立到目标的 TCP socket。
 * 返回的 socket 已完成代理握手，调用方可直接交给 ssh2 / tls.connect。
 */
export async function connectWithProxy(
  connection: ConnectionEntity,
  host: string,
  port: number,
  timeout = 30000,
  log: LogFn = () => {},
): Promise<net.Socket> {
  const proxy = resolveProxy(connection, host, port);
  if (!proxy) {
    log(`直连 ${host}:${port}`);
    const socket = net.createConnection({ host, port });
    try {
      return await waitForConnect(socket, timeout, `连接 ${host}:${port}`);
    } catch (err) {
      safeDestroy(socket);
      throw err;
    }
  }

  log(`通过 ${proxy.type.toUpperCase()} 代理 ${proxy.host}:${proxy.port} 连接 ${host}:${port}`);
  let socket: net.Socket;
  if (proxy.type === 'http' || proxy.type === 'https') {
    socket = await connectHttpProxy(proxy, host, port, timeout, log);
  } else if (proxy.type === 'socks5') {
    socket = await connectSocks5Proxy(proxy, host, port, timeout);
  } else {
    socket = await connectSocks4Proxy(proxy, host, port, timeout);
  }
  // 握手阶段多读的字节交还给调用方（ssh2 / TLS）
  flushBuffered(socket);
  return socket;
}
