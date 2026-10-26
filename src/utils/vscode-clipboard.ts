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

/** 写剪贴板：扩展 WebView 走桥接，Electron 用 preload，否则 navigator.clipboard / execCommand 兜底 */
export async function writeClipboard(text: string): Promise<void> {
  // 扩展 WebView 的跨源 iframe 内：优先走桥接。
  // 不能把宿主注入的 electronAPI.clipboard 放在前面——部分 VSCode 系宿主（如 CodeBuddy）
  // 会向页面注入该对象，但它在跨源 iframe 中并不生效，命中后复制会静默失败。
  if (isVscodeThemeHost()) {
    try {
      await writeClipboardVscode(text);
      return;
    } catch (err) {
      console.warn('[aicmd] clipboard bridge write failed, fallback:', err);
    }
  }
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

/** 读剪贴板：扩展 WebView 走桥接，Electron 用 preload，否则 navigator.clipboard 兜底 */
export async function readClipboard(): Promise<string> {
  // 同 writeClipboard：扩展 WebView 跨源 iframe 内优先走桥接
  if (isVscodeThemeHost()) {
    try {
      const text = await readClipboardVscode();
      if (text) return text;
    } catch (err) {
      console.warn('[aicmd] clipboard bridge read failed, fallback:', err);
    }
  }
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

/* ===================== 全局剪贴板桥接（用于普通输入框） ===================== */

let bridgeInstalled = false;

function isEditableEl(
  el: EventTarget | null
): el is HTMLInputElement | HTMLTextAreaElement {
  const node = el as HTMLElement | null;
  if (!node) return false;
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return true;
  return !!(node as HTMLElement).isContentEditable;
}

function isInTerminal(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node || typeof node.closest !== 'function') return false;
  return !!node.closest('.xterm');
}

function getSelectionText(): string {
  const sel = window.getSelection();
  if (sel && sel.toString()) return sel.toString();
  const el = document.activeElement as
    | (HTMLInputElement & HTMLTextAreaElement)
    | null;
  if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number' && el.value) {
    return el.value.slice(el.selectionStart, el.selectionEnd);
  }
  return '';
}

function insertTextAtCursor(el: HTMLElement, text: string): void {
  try {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if ((el as HTMLElement).isContentEditable) {
      document.execCommand('insertText', false, text);
    }
  } catch {
    /* ignore */
  }
}

function deleteSelectedText(): void {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) return;
    el.value = el.value.slice(0, start) + el.value.slice(end);
    el.setSelectionRange(start, start);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * 快捷键级处理（Ctrl/Cmd + C / X / V）。
 *
 * 跨源 iframe 受权限策略限制，浏览器**根本不会派发** copy / paste 事件
 * （终端能正常工作正是因为它直接拦截 keydown，而非依赖原生事件）。
 * 因此这里同样以 keydown 为可靠入口：拦截后经桥接读写剪贴板，并
 * preventDefault 抑制浏览器默认动作，避免与原生事件重复处理。
 * 仅处理 C / X / V，其他快捷键（Ctrl+A / Z 等）一律放行。
 */
function handleKeydown(e: KeyboardEvent): void {
  if (isInTerminal(e.target)) return; // 终端内部自带处理，避免重复
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const key = (e.key || '').toLowerCase();
  if (key !== 'c' && key !== 'x' && key !== 'v') return;

  // 粘贴：需要有可编辑焦点
  if (key === 'v') {
    const el = document.activeElement;
    if (!isEditableEl(el)) return; // 焦点不在输入框，放行
    e.preventDefault();
    const target = el as HTMLElement;
    readClipboard()
      .then((text) => {
        if (text) insertTextAtCursor(target, text);
      })
      .catch(() => {});
    return;
  }

  // 复制 / 剪切：需要有选中内容（含只读文本如 AI 回复）
  const text = getSelectionText();
  if (!text) return; // 无选区则放行，避免干扰其他快捷键语义
  e.preventDefault();
  writeClipboard(text).catch(() => {});
  if (key === 'x') deleteSelectedText();
}

function handleCopyCut(e: ClipboardEvent): void {
  if (isInTerminal(e.target)) return; // 终端由自身逻辑处理，避免重复
  const text = getSelectionText();
  if (!text) return; // 无选区，交给浏览器（通常也无内容）

  // 在 copy / cut 事件内用同步的 e.clipboardData.setData 写入剪贴板。
  // 这是用户手势触发的复制，跨源 iframe 下同样可用（终端粘贴已验证 e.clipboardData
  // 可访问），不依赖受限的 navigator.clipboard，也不受异步桥接时序影响，最可靠。
  if (e.clipboardData) {
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    if (e.type === 'cut') deleteSelectedText();
    return;
  }

  // 极端兜底：clipboardData 不可用，走桥接
  e.preventDefault();
  writeClipboard(text).catch(() => {});
  // cut 在可编辑输入框内还需删除选区
  const el = document.activeElement;
  if (
    e.type === 'cut' &&
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
  ) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    el.value = el.value.slice(0, start) + el.value.slice(end);
    el.setSelectionRange(start, start);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function handlePaste(e: ClipboardEvent): void {
  if (isInTerminal(e.target)) return;
  const el = document.activeElement;
  if (!isEditableEl(el)) return; // 当前没有可编辑焦点，交给默认行为
  e.preventDefault();
  readClipboard()
    .then((text) => {
      if (text) insertTextAtCursor(el as HTMLElement, text);
    })
    .catch(() => {});
}

/**
 * 在 VSCode 扩展的跨源 iframe 内安装全局剪贴板桥接，让所有普通输入框
 * （AI 配置、AI 对话、文件管理等）的复制 / 粘贴都走 vscode.env.clipboard。
 * 仅在 VSCode WebView 运行时生效，Electron / 浏览器行为不变。
 */
export function installVscodeClipboardBridge(): void {
  if (bridgeInstalled) return;
  // 这里必须用 isVscodeThemeHost()（iframe 是否由扩展壳加载），不能沿用
  // isVscodeWebviewRuntime()——后者会把「存在宿主注入的 electronAPI」判定为非扩展环境，
  // 导致 CodeBuddy 等 VSCode 系宿手下整个桥接被跳过、快捷键处理完全不生效。
  if (!isVscodeThemeHost()) return;
  bridgeInstalled = true;

  // 1) polyfill navigator.clipboard，使任何直接调用它的代码也能工作
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      enumerable: true,
      value: {
        writeText: (t: string) => writeClipboard(t).then(() => undefined),
        readText: () => readClipboard(),
      },
    });
  } catch {
    /* 某些浏览器 navigator.clipboard 为只读 getter，忽略 */
  }

  // 2) 可靠入口：直接拦截 Ctrl/Cmd + C / X / V 快捷键（不依赖可能不触发的原生事件）
  document.addEventListener('keydown', handleKeydown as EventListener, true);

  // 3) 兜底：原生 copy / cut / paste 事件（如右键菜单触发的路径）
  document.addEventListener('copy', handleCopyCut as EventListener, true);
  document.addEventListener('cut', handleCopyCut as EventListener, true);
  document.addEventListener('paste', handlePaste as EventListener, true);

  // 便于排查宿主差异（如 CodeBuddy 注入了无效的 electronAPI.clipboard）
  console.log('[aicmd] clipboard bridge installed', {
    hasElectronClipboard: !!(window as any).electronAPI?.clipboard,
  });
}
