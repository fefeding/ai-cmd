/**
 * 纯终端页（term.html 入口）：只渲染一个 xterm 终端并通过
 * /ws/terminal 连接 ?connectionId 指定的连接。
 *
 * 供 VSCode 扩展的 WebView 使用——点击左侧树上的连接，打开一个
 * 只含终端的 tab，不再展示完整的 SPA（侧边栏 / 搜索等多余 UI）。
 *
 * 能力：
 * - ZMODEM：sz 下载自动保存、rz 上传（点击浮层按钮选文件）
 * - 复制 / 粘贴：选中后 Ctrl+C 或右键复制；Ctrl+Shift+V / 右键粘贴
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import './term.css';
import {
  createSentry,
  base64ToOctets,
  stringToOctets,
  octetsToBase64
} from './utils/zmodem';

const params = new URLSearchParams(location.search);
const connectionId = params.get('connectionId') || '__local__';

const sessionId = `ssh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const term = new Terminal({
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  cursorBlink: true,
  allowProposedApi: true,
  theme: {
    background: '#1e1e1e',
    foreground: '#cccccc',
    cursor: '#cccccc'
  }
});
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.loadAddon(new WebLinksAddon());
term.open(document.getElementById('terminal') as HTMLElement);
fitAddon.fit();
term.focus();

const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProtocol}://${location.host}/ws/terminal`);

function send(msg: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/* --------------------------------- 复制 / 粘贴 --------------------------------- */

function copySelection(): boolean {
  const sel = term.getSelection();
  if (!sel) return false;
  navigator.clipboard.writeText(sel).catch(() => {
    term.write('\r\n\x1b[33m[复制失败]\x1b[0m');
  });
  return true;
}

function pasteClipboard(): void {
  navigator.clipboard
    .readText()
    .then((text) => {
      if (text) send({ type: 'terminal', sessionId, data: text });
    })
    .catch(() => {
      term.write('\r\n\x1b[33m[无法读取剪贴板]\x1b[0m');
    });
}

term.attachCustomKeyEventHandler((ev): boolean => {
  if (ev.type !== 'keydown') return true;
  // Ctrl+Shift+C 复制 / Ctrl+Shift+V 粘贴
  if (ev.ctrlKey && ev.shiftKey && (ev.key === 'C' || ev.key === 'c')) {
    copySelection();
    return false;
  }
  if (ev.ctrlKey && ev.shiftKey && (ev.key === 'V' || ev.key === 'v')) {
    pasteClipboard();
    return false;
  }
  // 有选中内容时 Ctrl+C 复制而不是发送 SIGINT（Windows Terminal 习惯）
  if (ev.ctrlKey && !ev.shiftKey && (ev.key === 'C' || ev.key === 'c')) {
    if (term.hasSelection()) {
      copySelection();
      return false;
    }
  }
  return true;
});

// 右键：有选中 → 复制；无选中 → 粘贴
(document.getElementById('terminal') as HTMLElement).addEventListener(
  'contextmenu',
  (e) => {
    e.preventDefault();
    if (!copySelection()) pasteClipboard();
  }
);

/* ------------------------------------ ZMODEM ------------------------------------ */

let sentry: any = null;
let zmodemSession: any = null;

/** sz 接收：把收到的文件交给扩展宿主保存（iframe 内直接下载不可靠）。 */
function saveFile(name: string, chunks: Uint8Array[]): void {
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  (window as any).parent.postMessage(
    { __aicmd_file: true, name, data: btoa(binary) },
    '*'
  );
  term.write(`\r\n\x1b[32m[sz] ${name} (${size}B) 已请求保存\x1b[0m\r\n`);
}

/** rz 上传：显示文件选择浮层，选中后走 zmodem 发送。 */
function promptUpload(session: any): void {
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:99;display:flex;gap:8px;';
  const btn = document.createElement('button');
  btn.textContent = '⬆ 选择文件上传 (rz)';
  btn.style.cssText =
    'padding:6px 12px;background:#0e639c;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:12px;';
  const cancel = document.createElement('button');
  cancel.textContent = '✕';
  cancel.style.cssText =
    'padding:6px 10px;background:#444;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:12px;';
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.style.display = 'none';

  const cleanup = () => {
    bar.remove();
    input.remove();
  };
  cancel.onclick = () => {
    cleanup();
    try {
      session.close();
    } catch {
      /* ignore */
    }
  };
  btn.onclick = () => input.click();
  input.onchange = async () => {
    cleanup();
    const files = Array.from(input.files || []);
    for (const file of files) {
      term.write(`\r\n\x1b[36m[rz] 上传 ${file.name} (${file.size}B)…\x1b[0m`);
      try {
        const transfer = await session.send_offer({
          name: file.name,
          size: file.size,
          mtime: Math.floor((file.lastModified || Date.now()) / 1000)
        });
        if (!transfer) {
          term.write('\r\n\x1b[33m[rz] 远端已跳过该文件\x1b[0m\r\n');
          continue;
        }
        const CHUNK = 8192;
        let sent = 0;
        while (sent < file.size) {
          const end = Math.min(sent + CHUNK, file.size);
          const buf = new Uint8Array(await file.slice(sent, end).arrayBuffer());
          transfer.send(buf);
          sent += buf.length;
        }
        await transfer.end([]);
        term.write('\x1b[32m 完成\x1b[0m\r\n');
      } catch (e: any) {
        term.write(
          `\r\n\x1b[31m[rz] ${file.name} 上传失败: ${e?.message || e}\x1b[0m\r\n`
        );
      }
    }
    try {
      await session.close();
    } catch {
      /* ignore */
    }
    term.focus();
  };

  document.body.appendChild(bar);
  bar.appendChild(btn);
  bar.appendChild(cancel);
  document.body.appendChild(input);
}

sentry = createSentry({
  toTerminal: (octets: number[]) => {
    if (octets.length > 0) term.write(new Uint8Array(octets));
  },
  sender: (octets: number[]) => {
    send({
      type: 'terminal',
      sessionId,
      data: octetsToBase64(octets),
      binary: true
    });
  },
  onDetect: (detection: any) => {
    const role = detection.get_session_role();
    // 防护：已有活跃 ZMODEM session 时忽略重复检测（ZRINIT 回显误判）
    if (zmodemSession) {
      try {
        detection.deny();
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const session = detection.confirm();
      zmodemSession = session;

      // 预注册事件，防止 "Bad event"
      for (const evt of ['offer', 'data_in', 'file_end']) {
        if (!session._on_evt || session._on_evt[evt] === undefined) {
          try {
            session._Add_event(evt);
          } catch {
            /* ignore */
          }
        }
      }

      // 缓冲 handlers 就绪前的早期事件
      const origHappen = session._Happen.bind(session);
      const buffer: Array<{ evt: string; args: any[] }> = [];
      let handlersReady = false;
      session._Happen = function (this: any, evt: string, ...args: any[]) {
        if (!handlersReady) {
          buffer.push({ evt, args });
          return;
        }
        return origHappen(evt, ...args);
      };

      // consume 异常兜底
      const origConsume = session.consume.bind(session);
      session.consume = (octets: number[]) => {
        try {
          return origConsume(octets);
        } catch {
          /* ignore */
        }
      };

      // 会话结束清理
      const origEnd = session._on_session_end?.bind(session);
      if (origEnd) {
        session._on_session_end = function () {
          zmodemSession = null;
          return origEnd();
        };
      }

      const markHandlersReady = () => {
        handlersReady = true;
        for (const item of buffer) {
          try {
            origHappen(item.evt, ...item.args);
          } catch {
            /* ignore */
          }
        }
        buffer.length = 0;
      };

      if (role === 'send') {
        // rz：浏览器向远端上传
        term.write(`\r\n\x1b[36m[rz] 检测到上传请求，请选择文件\x1b[0m\r\n`);
        markHandlersReady();
        promptUpload(session);
      } else {
        // sz：接收远端文件并保存
        term.write(`\r\n\x1b[36m[sz] 检测到下载请求，开始接收…\x1b[0m\r\n`);
        session.on('offer', (offer: any) => {
          const name = offer.get_details().name;
          const total = offer.get_details().size || 0;
          let received = 0;
          offer.on('input', (payload: any) => {
            received += payload.length;
            if (total) {
              term.write(
                `\r\x1b[K[sz] ${name} ${Math.round((received / total) * 100)}%`
              );
            }
          });
          offer
            .accept()
            .then((packets: any[]) => {
              const chunks: Uint8Array[] = (packets || []).map((p: any) =>
                typeof p === 'string'
                  ? new TextEncoder().encode(p)
                  : new Uint8Array(p)
              );
              saveFile(name, chunks);
            })
            .catch((err: any) => {
              term.write(
                `\r\n\x1b[31m[sz] ${name} 接收失败: ${err?.message || err}\x1b[0m\r\n`
              );
            });
        });
        markHandlersReady();
        session
          .start?.()
          .then((offerOrUndefined: any) => {
            if (
              offerOrUndefined &&
              typeof offerOrUndefined.accept === 'function'
            ) {
              session._Happen('offer', offerOrUndefined);
            }
          })
          .catch(() => {
            /* ZFIN 正常结束 */
          });
      }
    } catch (err: any) {
      term.write(
        `\r\n\x1b[31m[ZMODEM] 处理失败: ${err?.message || err}\x1b[0m\r\n`
      );
      zmodemSession = null;
    }
  },
  onRetract: () => {
    /* 忽略失效检测 */
  }
});

/* ---------------------------------- WebSocket ---------------------------------- */

ws.addEventListener('open', () => {
  send({
    type: 'create',
    sessionId,
    data: { connectionId, cols: term.cols, rows: term.rows }
  });
});

ws.addEventListener('message', (ev) => {
  let msg: any;
  try {
    msg = JSON.parse(ev.data as string);
  } catch {
    return;
  }
  if (msg.sessionId && msg.sessionId !== sessionId) return;

  switch (msg.type) {
    case 'terminal': {
      if (msg.data == null) break;
      // 所有入站数据经 ZMODEM sentry 过滤（普通数据透传到终端）
      if (sentry) {
        const octets = msg.binary
          ? base64ToOctets(msg.data)
          : stringToOctets(msg.data);
        sentry.consume(octets);
      } else if (msg.binary) {
        const raw = atob(msg.data);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        term.write(bytes);
      } else {
        term.write(msg.data);
      }
      break;
    }
    case 'status':
      if (msg.data === 'connected') term.focus();
      break;
    case 'error':
      term.write(`\r\n\x1b[31m[AICmd] ${msg.data || '连接失败'}\x1b[0m\r\n`);
      break;
    case 'close':
      term.write('\r\n\x1b[90m[会话已关闭]\x1b[0m\r\n');
      break;
  }
});

ws.addEventListener('close', () => {
  term.write('\r\n\x1b[90m[与服务的连接已断开]\x1b[0m\r\n');
});

ws.addEventListener('error', () => {
  term.write('\r\n\x1b[31m[AICmd] 无法连接后端服务\x1b[0m\r\n');
});

term.onData((data) => send({ type: 'terminal', sessionId, data }));
term.onBinary((data) => send({ type: 'terminal', sessionId, data }));
term.onResize(({ cols, rows }) =>
  send({ type: 'resize', sessionId, data: { cols, rows } })
);

// 容器尺寸变化时自适应并同步到远端
const ro = new ResizeObserver(() => {
  try {
    fitAddon.fit();
  } catch {
    /* 忽略极端尺寸 */
  }
});
ro.observe(document.getElementById('terminal') as HTMLElement);
