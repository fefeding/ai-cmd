import * as net from 'net';
import * as tls from 'tls';
import type { WebSocket } from 'ws';
import { ConnectionService } from './connection.service';

/**
 * RDCleanPath WebSocket 代理。
 *
 * IronRDP-WASM 在浏览器里跑完整 RDP 协议栈，但浏览器无法直连任意 TCP:3389，
 * 因此通过一个 WebSocket 字节管道连到本机服务端，由本服务把字节转成到目标
 * Windows RDP 服务器的 TLS 连接。这不是纯 TCP 转发，而是 RDCleanPath 协议：
 *
 *   1) WASM 客户端发第一条二进制消息 = RDCleanPath Request (ASN.1 DER)
 *      含 [2] destination、[6] x224_connection_pdu（X.224 Connection Request）
 *   2) 服务端解析 destination、连目标 TCP:3389、发 X.224、收 X.224 Confirm
 *   3) 在同一 socket 上做 TLS 握手（RDP 服务器普遍自签名，rejectUnauthorized:false），
 *      提取服务端证书链
 *   4) 回 RDCleanPath Response（DER，含 x224 confirm + 证书链）
 *   5) 之后 WebSocket <-> TLS 双向原始字节转发
 *
 * 安全：destination 一律以连接配置里的 host/port 为准，忽略客户端声明的地址，
 * 避免被当作内网任意 host 的 SSRF 跳板。
 *
 * 协议参考：https://github.com/electerm/ironrdp-wasm/blob/HEAD/example/lib/rdp-proxy.js
 */

const VERSION_1 = 3390; // 3389 + 1

const TAG_SEQUENCE = 0x30;
const TAG_INTEGER = 0x02;
const TAG_OCTET_STRING = 0x04;
const TAG_UTF8STRING = 0x0c;
const TAG_CTX = (n: number) => 0xa0 + n;

function derEncodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let temp = length;
  while (temp > 0) {
    bytes.unshift(temp & 0xff);
    temp >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derWrap(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derEncodeLength(content.length), content]);
}

function derEncodeInteger(value: number): Buffer {
  if (value === 0) return derWrap(TAG_INTEGER, Buffer.from([0]));
  const bytes: number[] = [];
  let temp = value;
  while (temp > 0) {
    bytes.unshift(temp & 0xff);
    temp >>= 8;
  }
  if (bytes[0] & 0x80) bytes.unshift(0);
  return derWrap(TAG_INTEGER, Buffer.from(bytes));
}

function derEncodeUtf8String(str: string): Buffer {
  return derWrap(TAG_UTF8STRING, Buffer.from(str, 'utf-8'));
}

function derEncodeOctetString(buf: Buffer): Buffer {
  return derWrap(TAG_OCTET_STRING, buf);
}

function derWrapContext(tagNum: number, content: Buffer): Buffer {
  return derWrap(TAG_CTX(tagNum), content);
}

function derDecodeLength(buf: Buffer, offset: number): { length: number; bytesRead: number } {
  const first = buf[offset];
  if (first < 0x80) return { length: first, bytesRead: 1 };
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) length = (length << 8) | buf[offset + 1 + i];
  return { length, bytesRead: 1 + numBytes };
}

function derDecodeTLV(buf: Buffer, offset: number): { tag: number; value: Buffer; totalLength: number } {
  const tag = buf[offset];
  const { length, bytesRead } = derDecodeLength(buf, offset + 1);
  const headerLen = 1 + bytesRead;
  return {
    tag,
    value: buf.slice(offset + headerLen, offset + headerLen + length),
    totalLength: headerLen + length,
  };
}

function derDecodeInteger(buf: Buffer): number {
  let val = 0;
  for (let i = 0; i < buf.length; i++) val = (val << 8) | buf[i];
  return val;
}

function derDecodeChildren(buf: Buffer): Array<{ tag: number; value: Buffer; totalLength: number }> {
  const children: Array<{ tag: number; value: Buffer; totalLength: number }> = [];
  let offset = 0;
  while (offset < buf.length) {
    const tlv = derDecodeTLV(buf, offset);
    children.push(tlv);
    offset += tlv.totalLength;
  }
  return children;
}

interface RDCleanPathRequest {
  destination: string;
  x224ConnectionRequest: Buffer;
}

function parseRDCleanPathRequest(data: Buffer): RDCleanPathRequest {
  const outer = derDecodeTLV(data, 0);
  if (outer.tag !== TAG_SEQUENCE) throw new Error(`RDCleanPath: expected SEQUENCE, got 0x${outer.tag.toString(16)}`);

  let version: number | null = null;
  let destination: string | null = null;
  let x224ConnectionRequest: Buffer | null = null;

  for (const child of derDecodeChildren(outer.value)) {
    const ctxTag = child.tag & 0x1f;
    switch (ctxTag) {
      case 0:
        version = derDecodeInteger(derDecodeTLV(child.value, 0).value);
        break;
      case 2:
        destination = derDecodeTLV(child.value, 0).value.toString('utf-8');
        break;
      case 6:
        x224ConnectionRequest = derDecodeTLV(child.value, 0).value;
        break;
      default:
        break;
    }
  }

  if (version !== VERSION_1) throw new Error(`RDCleanPath: unsupported version ${version}`);
  if (!destination) throw new Error('RDCleanPath: missing destination');
  if (!x224ConnectionRequest || x224ConnectionRequest.length === 0) {
    throw new Error('RDCleanPath: missing x224_connection_pdu');
  }
  return { destination, x224ConnectionRequest };
}

function buildRDCleanPathResponse(serverAddr: string, x224Response: Buffer, certChain: Buffer[]): Buffer {
  const parts: Buffer[] = [
    derWrapContext(0, derEncodeInteger(VERSION_1)),
    derWrapContext(6, derEncodeOctetString(x224Response)),
  ];
  const certSeq = derWrap(TAG_SEQUENCE, Buffer.concat(certChain.map((c) => derEncodeOctetString(c))));
  parts.push(derWrapContext(7, certSeq));
  parts.push(derWrapContext(9, derEncodeUtf8String(serverAddr)));
  return derWrap(TAG_SEQUENCE, Buffer.concat(parts));
}

function buildRDCleanPathError(errorCode: number, httpStatusCode?: number): Buffer {
  const errParts: Buffer[] = [derWrapContext(0, derEncodeInteger(errorCode))];
  if (httpStatusCode != null) errParts.push(derWrapContext(1, derEncodeInteger(httpStatusCode)));
  const parts = [
    derWrapContext(0, derEncodeInteger(VERSION_1)),
    derWrapContext(1, derWrap(TAG_SEQUENCE, Buffer.concat(errParts))),
  ];
  return derWrap(TAG_SEQUENCE, Buffer.concat(parts));
}

function extractCertChain(peerCert: tls.PeerCertificate | any): Buffer[] {
  const certs: Buffer[] = [];
  if (!peerCert || !peerCert.raw) return certs;
  const seen = new Set<string>();
  let current: any = peerCert;
  while (current && current.raw) {
    const fingerprint = current.fingerprint256 || current.raw.toString('hex');
    if (seen.has(fingerprint)) break;
    seen.add(fingerprint);
    certs.push(Buffer.from(current.raw));
    if (current.issuerCertificate && current.issuerCertificate !== current) {
      current = current.issuerCertificate;
    } else {
      break;
    }
  }
  return certs;
}

interface RdpTunnelSession {
  id: string;
  connectionId: string;
  tlsSocket: tls.TLSSocket;
  ws: WebSocket;
  createdAt: Date;
}

export class RdpTunnelService {
  private sessions = new Map<string, RdpTunnelSession>();

  constructor(private connectionService: ConnectionService) {}

  getSessions(): Array<{ id: string; connectionId: string; createdAt: Date }> {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id, connectionId: s.connectionId, createdAt: s.createdAt,
    }));
  }

  closeSession(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    if (!s.tlsSocket.destroyed) s.tlsSocket.destroy();
    try { if (s.ws.readyState === 1) s.ws.close(); } catch { /* ignore */ }
    this.sessions.delete(id);
  }

  closeAllSessions(): void {
    for (const id of Array.from(this.sessions.keys())) this.closeSession(id);
  }

  /**
   * 处理一条来自 WASM 客户端的 WebSocket 连接。
   * @param ws WebSocket 实例（browser/VSCode 由 server.js 或 vite 提供，Electron 由本地代理提供）
   * @param connectionId 连接配置 id，host/port 以此为权威来源
   */
  async handleConnection(ws: WebSocket, connectionId: string, onLog?: (msg: string) => void): Promise<void> {
    const log = (msg: string) => {
      console.log(`[RDP-Tunnel] ${msg}`);
      onLog?.(msg);
    };
    const sessionId = `rdp-tunnel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const fail = (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log(`session ${sessionId} failed: ${message}`);
      try {
        if (ws.readyState === 1) ws.send(buildRDCleanPathError(1, 502));
      } catch { /* ignore */ }
      try { if (ws.readyState === 1) ws.close(); } catch { /* ignore */ }
    };

    // 只处理第一条消息：RDCleanPath Request
    ws.once('message', async (data: any) => {
      let tcpSocket: net.Socket | null = null;
      try {
        const requestData = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        const request = parseRDCleanPathRequest(requestData);
        log(`session ${sessionId}: RDCleanPath request (${requestData.length} bytes), client destination=${request.destination}`);

        // 以连接配置为权威目标，忽略客户端声明的 destination（防 SSRF）
        const connection = await this.connectionService.getConnectionById(connectionId);
        if (!connection) throw new Error('连接配置不存在');
        if (connection.type !== 'rdp') throw new Error('该连接不是 RDP 类型');
        const host = String(connection.host || '').trim();
        if (!host) throw new Error('连接配置缺少主机地址');
        const port = Number(connection.port || 3389);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`无效 RDP 端口: ${port}`);
        log(`session ${sessionId}: connecting to configured RDP server ${host}:${port}`);

        const { x224Response, certChain, tlsSocket } = await new Promise<{
          x224Response: Buffer; certChain: Buffer[]; tlsSocket: tls.TLSSocket;
        }>((resolve, reject) => {
          let settled = false;
          const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
          tcpSocket = net.createConnection({ host, port }, () => {
            log(`session ${sessionId}: TCP connected`);
            tcpSocket!.write(request.x224ConnectionRequest, () => {
              log(`session ${sessionId}: sent X.224 Connection Request (${request.x224ConnectionRequest.length} bytes)`);
            });
          });
          tcpSocket.once('error', (err) => done(() => reject(new Error(`TCP 连接失败: ${err.message}`))));
          tcpSocket.once('data', (x224Response: Buffer) => {
            log(`session ${sessionId}: received X.224 Connection Confirm (${x224Response.length} bytes)`);
            if (x224Response.length === 0) {
              done(() => reject(new Error('RDP 服务器关闭连接且未返回 X.224 响应')));
              return;
            }
            tcpSocket!.removeAllListeners('error');
            tcpSocket!.removeAllListeners('data');
            // SNI 只能用于域名（RFC 6066），IP 地址需省略避免 Node 弃用警告
            const isIp = /^[\d.]+$/.test(host) || host.includes(':');
            const tlsSocket = tls.connect({
              socket: tcpSocket!,
              ...(isIp ? {} : { servername: host }),
              rejectUnauthorized: false, // RDP 服务器普遍自签名
            }, () => {
              log(`session ${sessionId}: TLS handshake completed`);
              const certChain = extractCertChain(tlsSocket.getPeerCertificate(true));
              log(`session ${sessionId}: extracted ${certChain.length} certificate(s)`);
              done(() => resolve({ x224Response: Buffer.from(x224Response), certChain, tlsSocket }));
            });
            tlsSocket.once('error', (err) => done(() => reject(new Error(`TLS 握手失败: ${err.message}`))));
          });
          tcpSocket.setTimeout(15000, () => {
            done(() => reject(new Error('RDP 握手超时')));
            tcpSocket?.destroy();
          });
        });

        const serverAddr = `${host}:${port}`;
        const responsePdu = buildRDCleanPathResponse(serverAddr, x224Response, certChain);
        if (ws.readyState !== 1) { tlsSocket.destroy(); return; }
        ws.send(responsePdu);
        log(`session ${sessionId}: sent RDCleanPath response (${responsePdu.length} bytes), relay started`);

        this.sessions.set(sessionId, { id: sessionId, connectionId, tlsSocket, ws, createdAt: new Date() });
        this.setupRelay(sessionId, ws, tlsSocket);
      } catch (err) {
        tcpSocket?.destroy();
        fail(err);
      }
    });

    ws.on('error', (err) => log(`session ${sessionId}: websocket error: ${err.message}`));
  }

  private setupRelay(sessionId: string, ws: WebSocket, tlsSocket: tls.TLSSocket): void {
    let wsBytes = 0;
    let tlsBytes = 0;
    let cleaned = false;

    const cleanup = (source: string) => {
      if (cleaned) return;
      cleaned = true;
      logRelay(`session ${sessionId}: ${source} closed — WS→TLS ${wsBytes}B, TLS→WS ${tlsBytes}B`);
      if (!tlsSocket.destroyed) tlsSocket.destroy();
      try { if (ws.readyState === 1) ws.close(); } catch { /* ignore */ }
      this.sessions.delete(sessionId);
    };
    const logRelay = (msg: string) => {
      console.log(`[RDP-Tunnel] ${msg}`);
    };

    tlsSocket.on('data', (data: Buffer) => {
      tlsBytes += data.length;
      try { if (ws.readyState === 1) ws.send(data); }
      catch (err: any) { logRelay(`session ${sessionId}: TLS→WS error: ${err.message}`); cleanup('TLS (write error)'); }
    });
    tlsSocket.on('end', () => cleanup('TLS'));
    tlsSocket.on('error', (err) => { logRelay(`session ${sessionId}: TLS error: ${err.message}`); cleanup('TLS (error)'); });

    ws.on('message', (data: any) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      wsBytes += buf.length;
      try { if (!tlsSocket.destroyed) tlsSocket.write(buf); }
      catch (err: any) { logRelay(`session ${sessionId}: WS→TLS error: ${err.message}`); cleanup('WS (write error)'); }
    });
    ws.on('close', () => cleanup('WebSocket'));
  }
}
