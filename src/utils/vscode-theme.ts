/**
 * VSCode WebView 主题桥接。
 *
 * 页面运行在扩展 WebView 的 iframe 中（扩展壳 public/src/vscode-*.html 由本地服务提供，
 * 跨源，无法直接读取父窗口的 --vscode-* 变量），因此主题由扩展壳通过 postMessage 下发：
 *
 *   壳 → iframe：{ type: 'aicmd-vscode-theme', kind, dark, vars }
 *   iframe → 壳：{ type: 'aicmd-vscode-theme-request' }（页面就绪后主动拉一次，避免时序竞争）
 *
 * 收到主题后：
 *   1. 把 VSCode 主题色映射到应用自身的 CSS 变量（--bg-dark / --accent / …）；
 *   2. 同步 Bootstrap 的 --bs-* 变量与 color-scheme，使表单 / 弹窗 / 滚动条跟随明暗；
 *   3. 通过 onVscodeThemeChange 通知 xterm 等需要 JS 侧主题的组件。
 *
 * 非 VSCode 环境（桌面端 Electron / 浏览器）不会收到主题，一切保持 main.css 的默认配色。
 */

export interface VscodeThemePayload {
  type: string;
  /** dark | light | hc-dark | hc-light */
  kind: string;
  dark: boolean;
  /** 键为去掉 --vscode- 前缀的主题色名，如 'editor-background' */
  vars: Record<string, string>;
}

type Listener = (payload: VscodeThemePayload) => void;

/** xterm 主题（结构同 @xterm/xterm 的 ITheme，这里不引类型避免耦合） */
export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

/** 桌面端默认暗色终端配色（Catppuccin Mocha） */
export const TERMINAL_THEME_DARK: TerminalTheme = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  cursorAccent: '#1e1e2e',
  selectionBackground: '#585b7066',
  selectionForeground: '#cdd6f4',
  black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
  blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
  brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
  brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
};

/** 连接显式选择「亮色」时的终端配色（Catppuccin Latte） */
export const TERMINAL_THEME_LIGHT: TerminalTheme = {
  background: '#eff1f5',
  foreground: '#4c4f69',
  cursor: '#dc8a78',
  cursorAccent: '#eff1f5',
  selectionBackground: '#acb0be40',
  selectionForeground: '#4c4f69',
  black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
  blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be',
  brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b', brightYellow: '#df8e1d',
  brightBlue: '#1e66f5', brightMagenta: '#ea76cb', brightCyan: '#179299', brightWhite: '#bcc0cc',
};

const listeners = new Set<Listener>();
let state: VscodeThemePayload | null = null;
let initialized = false;

/** 是否运行在扩展 WebView 的 iframe 中（扩展壳通过 ?aicmd_vscode=1 标记） */
export function isVscodeThemeHost(): boolean {
  try {
    return new URLSearchParams(location.search).get('aicmd_vscode') === '1';
  } catch {
    return false;
  }
}

/** 当前 VSCode 主题（尚未收到时为 null） */
export function getVscodeTheme(): VscodeThemePayload | null {
  return state;
}

/** 监听 VSCode 主题变化，返回取消订阅函数 */
export function onVscodeThemeChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/* ------------------------------------------------------------------ *
 * 颜色工具
 * ------------------------------------------------------------------ */

/** 把颜色值归一化为 "r g b" 三元组（供 rgb(var(--x-rgb) / 10%) 语法使用） */
function toRgbTriplet(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const rgbFn = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgbFn) {
    return `${Math.round(+rgbFn[1])} ${Math.round(+rgbFn[2])} ${Math.round(+rgbFn[3])}`;
  }
  const m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6 && hex.length !== 8) return null;
  return `${parseInt(hex.slice(0, 2), 16)} ${parseInt(hex.slice(2, 4), 16)} ${parseInt(hex.slice(4, 6), 16)}`;
}

/* ------------------------------------------------------------------ *
 * VSCode 主题色 → 应用变量
 * ------------------------------------------------------------------ */

/**
 * 应用变量映射表：[应用变量名, [VSCode 主题色名（按优先级）, ...]]
 * 顺序靠前者优先，缺失时依次回退；全部缺失则保持 main.css 的默认值。
 */
const APP_VAR_MAP: Array<[string, string[]]> = [
  ['--bg-dark', ['editor-background']],
  ['--bg-sidebar', ['sideBar-background', 'panel-background', 'editorWidget-background', 'editor-background']],
  ['--bg-toolbar', ['editorGroupHeader-tabsBackground', 'titleBar-activeBackground', 'sideBar-background', 'editor-background']],
  ['--bg-input', ['input-background', 'dropdown-background', 'editorWidget-background']],
  ['--bg-menu', ['menu-background', 'editorHoverWidget-background', 'editorWidget-background', 'editor-background']],
  ['--bg-hover', ['list-hoverBackground', 'toolbar-hoverBackground', 'button-secondaryHoverBackground', 'menu-selectionBackground']],
  ['--text-primary', ['editor-foreground', 'foreground']],
  ['--text-secondary', ['descriptionForeground', 'sideBar-foreground', 'foreground']],
  ['--text-muted', ['disabledForeground', 'descriptionForeground']],
  ['--border-color', ['editorGroup-border', 'sideBar-border', 'editorWidget-border', 'panel-border', 'contrastBorder']],
  ['--border-strong', ['input-border', 'dropdown-border', 'editorWidget-border', 'panel-border', 'contrastBorder']],
  ['--accent', ['textLink-foreground', 'button-background', 'focusBorder', 'progressBar-background']],
  ['--accent-hover', ['textLink-activeForeground', 'button-hoverBackground', 'focusBorder']],
  ['--accent-fg', ['button-foreground']],
  ['--danger', ['errorForeground', 'editorError-foreground', 'terminal-ansiRed', 'testing-iconFailed']],
  ['--success', ['testing-iconPassed', 'gitDecoration-addedResourceForeground', 'terminal-ansiGreen', 'charts-green']],
  ['--warning', ['editorWarning-foreground', 'terminal-ansiYellow', 'charts-yellow']],
  ['--warning-strong', ['charts-orange', 'terminal-ansiBrightYellow', 'terminal-ansiYellow', 'editorWarning-foreground']],
  ['--info', ['charts-blue', 'textLink-foreground', 'terminal-ansiBlue']],
  ['--scrollbar-thumb', ['scrollbarSlider-background']],
  ['--scrollbar-thumb-hover', ['scrollbarSlider-hoverBackground', 'scrollbarSlider-activeBackground']],
];

/** 需要同步 rgb 三元组的变量（供半透明色使用，如 --accent-rgb） */
const RGB_VAR_MAP: Array<[string, string]> = [
  ['--accent-rgb', '--accent'],
  ['--danger-rgb', '--danger'],
  ['--success-rgb', '--success'],
  ['--warning-rgb', '--warning'],
  ['--warning-strong-rgb', '--warning-strong'],
  ['--bg-dark-rgb', '--bg-dark'],
  ['--bg-sidebar-rgb', '--bg-sidebar'],
  ['--bg-toolbar-rgb', '--bg-toolbar'],
  ['--bg-input-rgb', '--bg-input'],
  ['--bg-menu-rgb', '--bg-menu'],
  ['--border-color-rgb', '--border-color'],
  ['--border-strong-rgb', '--border-strong'],
];

function pick(payload: VscodeThemePayload, names: string[]): string {
  for (const n of names) {
    const v = payload.vars[n];
    if (v) return v;
  }
  return '';
}

function applyTheme(payload: VscodeThemePayload): void {
  const root = document.documentElement;
  const style = root.style;

  for (const [appVar, sources] of APP_VAR_MAP) {
    const value = pick(payload, sources);
    if (value) style.setProperty(appVar, value);
  }

  // 半透明叠加层：暗色主题用白色提亮，亮色主题用黑色压暗
  style.setProperty('--overlay-rgb', payload.dark ? '255 255 255' : '0 0 0');

  for (const [rgbVar, colorVar] of RGB_VAR_MAP) {
    const triplet = toRgbTriplet(style.getPropertyValue(colorVar));
    if (triplet) style.setProperty(rgbVar, triplet);
  }

  // Bootstrap：让表单 / 弹窗 / 卡片跟随主题（含亮色）
  const read = (name: string) => style.getPropertyValue(name) || undefined;
  const bs: Record<string, string | undefined> = {
    '--bs-body-bg': read('--bg-dark'),
    '--bs-body-color': read('--text-primary'),
    '--bs-emphasis-color': read('--text-primary'),
    '--bs-secondary-color': read('--text-secondary'),
    '--bs-border-color': read('--border-strong'),
    '--bs-border-color-translucent': read('--border-strong'),
    '--bs-secondary-bg': read('--bg-input'),
    '--bs-tertiary-bg': read('--bg-sidebar'),
    '--bs-card-bg': read('--bg-sidebar'),
    '--bs-card-cap-bg': read('--bg-toolbar'),
    '--bs-modal-bg': read('--bg-sidebar'),
    '--bs-modal-border-color': read('--border-color'),
    '--bs-form-control-bg': read('--bg-input'),
    '--bs-form-control-color': read('--text-primary'),
    '--bs-form-control-border-color': read('--border-strong'),
    '--bs-primary': read('--accent'),
    '--bs-link-color': read('--accent'),
    '--bs-link-hover-color': read('--accent-hover'),
    '--bs-danger': read('--danger'),
    '--bs-success': read('--success'),
    '--bs-warning': read('--warning'),
    '--bs-info': read('--info'),
    '--bs-secondary': read('--text-secondary'),
  };
  for (const [k, v] of Object.entries(bs)) {
    if (v) style.setProperty(k, v);
  }

  // 内凹表面：亮色主题下黑色叠加需要显著减弱，否则代码块 / 日志区会过黑
  if (payload.dark) {
    style.removeProperty('--bg-recess-soft');
    style.removeProperty('--bg-recess');
    style.removeProperty('--bg-recess-strong');
  } else {
    style.setProperty('--bg-recess-soft', 'rgba(0, 0, 0, 0.04)');
    style.setProperty('--bg-recess', 'rgba(0, 0, 0, 0.05)');
    style.setProperty('--bg-recess-strong', 'rgba(0, 0, 0, 0.08)');
  }

  root.setAttribute('data-bs-theme', payload.dark ? 'dark' : 'light');
  root.setAttribute('data-vscode-theme', payload.kind);
  style.colorScheme = payload.dark ? 'dark' : 'light';
}

function handlePayload(raw: any): void {
  if (!raw || raw.type !== 'aicmd-vscode-theme') return;
  const payload = raw as VscodeThemePayload;
  if (!payload.vars) payload.vars = {};
  state = payload;
  applyTheme(payload);
  for (const cb of listeners) {
    try {
      cb(payload);
    } catch (e) {
      console.error('[vscode-theme] listener error', e);
    }
  }
}

/** 请求扩展壳重新下发一次主题（首帧壳可能先于页面监听发送） */
function requestTheme(): void {
  try {
    window.parent?.postMessage({ type: 'aicmd-vscode-theme-request' }, '*');
  } catch {
    /* 忽略 */
  }
}

/**
 * 初始化主题桥接（在 app.mount 之前调用）。
 * 非 VSCode 环境为空操作，桌面端 / 浏览器外观完全不变。
 */
export function initVscodeTheme(): void {
  if (initialized) return;
  if (!isVscodeThemeHost()) return;
  initialized = true;

  // 壳在 iframe URL 上带了首帧兜底参数，避免主题消息到达前闪一帧默认配色
  try {
    const params = new URLSearchParams(location.search);
    const kind = params.get('vkind') || '';
    const bg = params.get('vbg') || '';
    const fg = params.get('vfg') || '';
    if (kind) {
      const dark = !kind.startsWith('light') && kind !== 'hc-light';
      document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-vscode-theme', kind);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    }
    if (bg) {
      document.documentElement.style.setProperty('--bg-dark', bg);
      document.body.style.backgroundColor = bg;
    }
    if (fg) {
      document.documentElement.style.setProperty('--text-primary', fg);
      document.body.style.color = fg;
    }
  } catch {
    /* 忽略 */
  }

  window.addEventListener('message', (e: MessageEvent) => handlePayload(e.data));
  requestTheme();
  // iframe 初次加载完成后壳会主动推送，这里再拉一次兜底
  window.addEventListener('load', requestTheme);
}

/**
 * 依据当前 VSCode 主题构造 xterm 配色。
 * 未处于 VSCode（未收到主题）时返回 null，由调用方使用默认配色。
 */
export function buildVscodeTerminalTheme(): TerminalTheme | null {
  if (!state) return null;
  const base: TerminalTheme = state.dark ? TERMINAL_THEME_DARK : TERMINAL_THEME_LIGHT;
  const v = (name: string) => state?.vars[name] || '';
  const merged: TerminalTheme = { ...base };
  const setIf = (key: keyof TerminalTheme, names: string[]) => {
    for (const n of names) {
      const value = v(n);
      if (value) {
        merged[key] = value;
        return;
      }
    }
  };

  setIf('background', ['terminal-background', 'editor-background']);
  setIf('foreground', ['terminal-foreground', 'editor-foreground', 'foreground']);
  setIf('cursor', ['terminalCursor-foreground', 'editorCursor-foreground']);
  merged.cursorAccent = merged.background;
  setIf('selectionBackground', ['terminal-selectionBackground', 'editor-selectionBackground']);
  merged.selectionForeground = merged.foreground;

  setIf('black', ['terminal-ansiBlack']);
  setIf('red', ['terminal-ansiRed']);
  setIf('green', ['terminal-ansiGreen']);
  setIf('yellow', ['terminal-ansiYellow']);
  setIf('blue', ['terminal-ansiBlue']);
  setIf('magenta', ['terminal-ansiMagenta']);
  setIf('cyan', ['terminal-ansiCyan']);
  setIf('white', ['terminal-ansiWhite']);
  setIf('brightBlack', ['terminal-ansiBrightBlack']);
  setIf('brightRed', ['terminal-ansiBrightRed']);
  setIf('brightGreen', ['terminal-ansiBrightGreen']);
  setIf('brightYellow', ['terminal-ansiBrightYellow']);
  setIf('brightBlue', ['terminal-ansiBrightBlue']);
  setIf('brightMagenta', ['terminal-ansiBrightMagenta']);
  setIf('brightCyan', ['terminal-ansiBrightCyan']);
  setIf('brightWhite', ['terminal-ansiBrightWhite']);

  return merged;
}
