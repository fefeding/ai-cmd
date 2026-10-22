/**
 * VSCode WebView（跨源 iframe）剪贴板桥接。
 *
 * 终端运行在 WebView 的 iframe 中（源为本地 http://127.0.0.1:port，
 * 与 WebView 宿主 vscode-webview:// 跨源），其中 navigator.clipboard 被
 * 同源策略 / 权限策略限制无法使用，Electron 的 preload clipboard 也不存在。
 *
 * 因此：VSCode 环境下统一通过 postMessage 把读写请求经
 * 「宿主 WebView → 扩展 (vscode.env.clipboard) → 宿主 WebView → iframe」
 * 桥接完成。
 *
 * 非 VSCode（桌面 Electron / 浏览器）环境回落原有实现，行为不变。
 */
import { isVscodeThemeHost } from './vscode-theme';

/** 运行在 VSCode WebView 的跨源 iframe 中（且无 Electron preload） */
export function isVscodeWebviewRuntime(): boolean {
  const hasElectronClipboard = !!(window as any).electronAPI?.clipboard;
  return isVscodeThemeHost() && !hasElectronClipboard;
}

interface ClipboardMsg {
  __aicmd_clipboard?: boolean;
  type:
    | 'aicmd-clipboard-read-request'
    | 'aicmd-clipboard-write-request'
    | 'aicmd-clipboard-read-response'
    | 'aicmd-clipboard-write-response';
  reqId: number;
  ok?: boolean;
  text?: string;
  error?: string;
}

let bridgeReady = false;
const pending = new Map<number, (resp: ClipboardMsg) => void>();
let reqCounter = 0;

function ensureBridge(): void {
  if (bridgeReady) return;
  bridgeReady = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as ClipboardMsg | null;
    if (!d || !d.__aicmd_clipboard) return;
    const cb = pending.get(d.reqId);
    if (cb) {
      pending.delete(d.reqId);
      cb(d);
    }
  });
}

function postToHost(msg: any): void {
  try {
    window.parent?.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
}

function request(msg: {
  type: ClipboardMsg['type'];
  text?: string;
}): Promise<ClipboardMsg> {
  ensureBridge();
  const reqId = ++reqCounter;
  return new Promise((resolve, reject) => {
    pending.set(reqId, resolve);
    postToHost({ ...msg, __aicmd_clipboard: true, reqId });
    setTimeout(() => {
      if (pending.has(reqId)) {
        pending.delete(reqId);
        reject(new Error('clipboard request timeout'));
      }
    }, 5000);
  });
}

async function writeClipboardVscode(text: string): Promise<void> {
  const resp = await request({ type: 'aicmd-clipboard-write-request', text });
  if (!resp.ok) throw new Error(resp.error || 'write failed');
}

async function readClipboardVscode(): Promise<string> {
  const resp = await request({ type: 'aicmd-clipboard-read-request' });
  if (!resp.ok) throw new Error(resp.error || 'read failed');
  return resp.text || '';
}

/** 写剪贴板：VSCode 走桥接，Electron 用 preload，否则 navigator.clipboard / execCommand 兜底 */
export async function writeClipboard(text: string): Promise<void> {
  const clip = (window as any).electronAPI?.clipboard;
  if (clip) {
    try {
      clip.writeText(text);
      return;
    } catch {
      /* fallthrough */
    }
  }
  if (isVscodeWebviewRuntime()) {
    await writeClipboardVscode(text);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* ignore */
    } finally {
      document.body.removeChild(ta);
    }
  }
}

/** 读剪贴板：VSCode 走桥接，Electron 用 preload，否则 navigator.clipboard 兜底 */
export async function readClipboard(): Promise<string> {
  const clip = (window as any).electronAPI?.clipboard;
  if (clip) {
    try {
      let text = clip.readText();
      if (!text && clip.readTextAsync) {
        text = await clip.readTextAsync();
      }
      return text || '';
    } catch {
      /* fallthrough */
    }
  }
  if (isVscodeWebviewRuntime()) {
    return await readClipboardVscode();
  }
  try {
    return (await navigator.clipboard.readText()) || '';
  } catch {
    return '';
  }
}
