/**
 * 捕获 IronRDP-WASM 内部创建的 RDP 隧道 WebSocket。
 *
 * WASM 的 SessionBuilder.connect() 自己 new WebSocket，外部拿不到引用；而
 * Session.run() 在远程会话被接管时不一定 settle，导致前端无法感知断开。
 * 这里只在 connect() 期间临时包装构造器，捕获本连接的 socket 后立即还原。
 *
 * 用模块级引用计数保证多个 RDP tab 并发连接时不会互相覆盖/污染全局 WebSocket。
 */
let refCount = 0;
let nativeWebSocket: typeof WebSocket | null = null;
const capturers = new Map<symbol, (ws: WebSocket, url: string) => void>();

export async function connectWithTunnelCapture<T>(
  connect: () => Promise<T>
): Promise<{ result: T; tunnelWs: WebSocket | null }> {
  const key = Symbol('rdp-tunnel-capture');
  let captured: WebSocket | null = null;
  capturers.set(key, (ws, url) => {
    if (!captured && url.indexOf('/ws/rdp') >= 0) captured = ws;
  });

  if (refCount === 0) {
    nativeWebSocket = window.WebSocket;
    const Native = nativeWebSocket;
    (window as any).WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url as any, protocols as any);
        const u = String(url);
        for (const fn of Array.from(capturers.values())) fn(this, u);
      }
    };
  }
  refCount++;

  try {
    const result = await connect();
    return { result, tunnelWs: captured };
  } finally {
    capturers.delete(key);
    refCount--;
    if (refCount === 0 && nativeWebSocket) {
      (window as any).WebSocket = nativeWebSocket;
      nativeWebSocket = null;
    }
  }
}
