/**
 * 全局「选中文本 → 浮现复制按钮」工具条。
 *
 * 背景：CodeBuddy 等 VSCode 系宿主可能完全不向 WebView 页面派发右键事件
 * （既不弹原生菜单，页面也收不到 contextmenu / mousedown(button=2)），
 * 「右键复制」无从谈起。因此提供一个与右键完全无关的复制入口：
 * 在任意非终端、非输入框区域用鼠标选中文字后，自动在选区附近浮现「复制」按钮，
 * 点击即复制（navigator.clipboard 优先，隐藏 textarea + execCommand 兜底）。
 *
 * 仅在扩展壳加载的 WebView 内启用（isVscodeThemeHost），Electron / 浏览器保持原生体验。
 * 幂等：多次调用只安装一次。
 */
import { isVscodeThemeHost } from './vscode-theme';

let installed = false;
let pill: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** 复制不依赖选区的文本：clipboard API 优先，execCommand 兜底 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* clipboard API 失败（跨源限制等），走兜底 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 这些区域不弹复制按钮：终端由 xterm 自身的选择/复制负责；输入框有快捷键 + 原生路径 */
function isExcludedTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return true;
  if (el.closest('.xterm')) return true;
  if (el.closest('input, textarea, [contenteditable="true"]')) return true;
  if (pill && el.closest('[data-selection-copy-pill]')) return true;
  return false;
}

function ensurePill(): HTMLDivElement {
  if (pill) return pill;
  pill = document.createElement('div');
  pill.setAttribute('data-selection-copy-pill', '1');
  pill.setAttribute('role', 'button');
  pill.textContent = '复制';
  const s = pill.style;
  s.position = 'fixed';
  s.zIndex = '99999';
  s.display = 'none';
  s.padding = '3px 10px';
  s.borderRadius = '6px';
  s.fontSize = '12px';
  s.lineHeight = '1.5';
  s.cursor = 'pointer';
  s.userSelect = 'none';
  s.whiteSpace = 'nowrap';
  s.color = '#fff';
  s.background = 'rgba(45, 45, 45, 0.96)';
  s.border = '1px solid rgba(255, 255, 255, 0.18)';
  s.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.4)';
  // 阻断 mousedown 默认行为与冒泡：点击按钮本身不清除选区、不触发全局隐藏，
  // 保证随后的 click 能完成复制。
  pill.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  pill.addEventListener('mouseup', (e) => e.stopPropagation());
  pill.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const self = pill;
    if (!self) return;
    const text = self.dataset.text || '';
    if (!text) return;
    const ok = await copyText(text);
    self.textContent = ok ? '已复制 ✓' : '复制失败';
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hidePill, 900);
  });
  document.body.appendChild(pill);
  return pill;
}

function hidePill(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (pill) pill.style.display = 'none';
}

function onMouseUp(e: MouseEvent): void {
  if (e.button !== 0) return; // 仅处理左键选择结束
  if (pill && e.target === pill) return; // 点击按钮本身，交给 click 处理
  if (isExcludedTarget(e.target)) {
    hidePill();
    return;
  }
  // 延迟一拍，等选区状态在 mouseup 后稳定
  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : '';
    if (!sel || sel.isCollapsed || !text || !text.trim() || isExcludedTarget(e.target)) {
      hidePill();
      return;
    }
    let rect: DOMRect | null = null;
    try {
      rect = sel.getRangeAt(0).getBoundingClientRect();
    } catch {
      rect = null;
    }

    const p = ensurePill();
    p.dataset.text = text;
    p.textContent = '复制';

    const w = 64;
    const h = 25;
    let x = rect && (rect.width || rect.height)
      ? rect.left + rect.width / 2 - w / 2
      : e.clientX - w / 2;
    let y = rect && (rect.width || rect.height)
      ? rect.top - h - 8
      : e.clientY - h - 12;
    if (rect && rect.top - h - 8 < 4) y = rect.bottom + 8; // 顶部放不下时放到选区下方
    x = Math.max(4, Math.min(x, window.innerWidth - w - 4));
    y = Math.max(4, Math.min(y, window.innerHeight - h - 4));
    p.style.left = `${Math.round(x)}px`;
    p.style.top = `${Math.round(y)}px`;
    p.style.display = 'block';
  }, 0);
}

function onDismissMouseDown(e: MouseEvent): void {
  if (pill && (e.target === pill || (e.target as HTMLElement | null)?.closest?.('[data-selection-copy-pill]'))) {
    return; // 按钮自身的按下不触发隐藏（pill 内部还会 stopPropagation，这里双保险）
  }
  hidePill();
}

function onSelectionChange(): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString()) hidePill();
}

/**
 * 安装全局选中复制工具条。仅在扩展壳加载的 WebView 内生效；重复调用幂等。
 */
export function installSelectionCopy(): void {
  if (installed) return;
  if (!isVscodeThemeHost()) return;
  installed = true;
  document.addEventListener('mouseup', onMouseUp as EventListener, true);
  document.addEventListener('mousedown', onDismissMouseDown as EventListener, true);
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePill();
  });
  document.addEventListener('scroll', hidePill as EventListener, true);
  window.addEventListener('resize', hidePill);
}
