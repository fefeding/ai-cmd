import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ServerLauncher } from './server-launcher';
import { AICmdTreeProvider } from './tree-provider';

let launcher: ServerLauncher;
let treeProvider: AICmdTreeProvider;
let output: vscode.OutputChannel;
let extContext: vscode.ExtensionContext | undefined;
const panels = new Set<vscode.WebviewPanel>();
let editPanel: vscode.WebviewPanel | undefined;
// 记录每个面板的基础名与实际 tab 标题，用于同名连接打开多次时追加编号区分
const panelMeta = new Map<vscode.WebviewPanel, { base: string; title: string }>();
// 记录每个面板加载的 src（含连接 id），用于窗口重载后恢复
const panelSrc = new Map<vscode.WebviewPanel, string>();

/** 把树菜单命令的参数归一化为连接 id。
 *  view/item/context 触发时 VSCode 会把 TreeItem 对象作为第一个参数传入，
 *  节点点击则传字符串；两者都要能正确取到连接 id。 */
function toId(arg?: unknown): string | undefined {
  if (typeof arg === 'string') return arg || undefined;
  const t = arg as vscode.TreeItem | undefined;
  const id = t && (t as any).id;
  return typeof id === 'string' && id ? id : undefined;
}

/** 为基础名分配一个未被占用的 tab 标题：首个用原名，之后依次「名称 2」「名称 3」… */
function allocateTitle(base: string): string {
  const used = new Set<string>();
  for (const [p, meta] of panelMeta) {
    if (panels.has(p) && meta.base === base) used.add(meta.title);
  }
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('[aicmd] extension is now active!');
  extContext = context;

  // 解析项目根目录：本扩展位于 <root>/packages/vscode
  const projectRoot = resolveProjectRoot(context.extensionPath);
  const cfg = vscode.workspace.getConfiguration('aicmd');
  const dataDir = cfg.get<string>('dataDir') || '';
  const startPort = cfg.get<number>('startPort') || 9802;

  // 日志输出到「输出」面板（选择 AICmd 频道），便于排查启动问题
  output = vscode.window.createOutputChannel('AICmd');
  context.subscriptions.push(output);
  output.appendLine(
    `[aicmd] active: projectRoot=${projectRoot}, dataDir=${
      dataDir || '~/.aicmd'
    }`
  );

  launcher = new ServerLauncher(projectRoot, dataDir, (line) =>
    output.appendLine(line)
  );
  treeProvider = new AICmdTreeProvider(launcher);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('aicmd.explorer', treeProvider)
  );

  const register = (id: string, handler: (...args: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));

  register(
    'aicmd.openTerminal',
    (connectionId?: unknown, name?: string) =>
      openTerminal(context, startPort, toId(connectionId), name)
  );
  register('aicmd.refresh', () => treeProvider.refresh());

  // 连接管理：新增 / 编辑打开专用编辑 WebView（复用桌面端 ConnectionEditor 弹窗），
  // 删除直接调 API
  register('aicmd.addConnection', () => openEdit(context, startPort));
  register('aicmd.editConnection', (id?: unknown) =>
    openEdit(context, startPort, toId(id))
  );
  register(
    'aicmd.deleteConnection',
    async (id?: unknown) => {
      const cid = toId(id);
      if (!cid) return;
      const answer = await vscode.window.showWarningMessage(
        '确定删除该连接吗？',
        { modal: true },
        '删除'
      );
      if (answer !== '删除') return;
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: '正在删除…' },
          async () => {
            await launcher.ensureStarted(startPort);
            await launcher.deleteConnection(cid);
          }
        );
        treeProvider.refresh();
        // 没有打开任何面板时，删除完成即关闭服务，避免后台常驻
        if (panels.size === 0) launcher.stop();
      } catch (e: any) {
        vscode.window.showErrorMessage(
          '删除失败：' + (e?.message || String(e))
        );
      }
    }
  );

  // 后端进程意外退出：通知用户并关闭所有面板（面板已无法正常工作）
  launcher.onUnexpectedExit = () => {
    output.appendLine('[aicmd] 后端进程意外退出');
    vscode.window.showErrorMessage(
      'AICmd 后端进程意外退出，请重新打开终端。'
    );
    for (const p of [...panels]) {
      try {
        p.dispose();
      } catch {
        /* ignore */
      }
    }
  };

  // 配置变更提示（dataDir / startPort 在 activate 时读取，需重启生效）
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('aicmd.dataDir') ||
        e.affectsConfiguration('aicmd.startPort')
      ) {
        output.appendLine('[aicmd] 配置已变更，重启扩展后生效');
        vscode.window.showInformationMessage(
          'AICmd 配置已变更，请重新加载窗口以生效。'
        );
      }
    })
  );

  treeProvider.refresh();

  // 注册 WebView 面板序列化器：窗口重载后自动恢复已打开的终端 / 编辑面板
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('aicmd.terminal', {
      async deserializeWebviewPanel(panel, state: any) {
        const s = state as
          | { src?: string; base?: string; title?: string }
          | undefined;
        if (!s || !s.src) {
          panel.dispose();
          return;
        }
        try {
          await launcher.ensureStarted(startPort);
        } catch {
          /* 启动失败留给面板自身展示错误 */
        }
        wirePanel(panel, s.src, s.base || 'AICmd', s.title || panel.title);
      }
    })
  );

  // 扩展停用时关闭后端服务，避免残留进程
  context.subscriptions.push({
    dispose: () => {
      launcher?.stop();
    }
  });
}

export function deactivate(): void {
  launcher?.stop();
}

async function openTerminal(
  context: vscode.ExtensionContext,
  startPort: number,
  connectionId?: string,
  name?: string
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: connectionId
          ? `正在连接 ${name || connectionId}…`
          : '正在启动 AICmd 服务…'
      },
      async () => {
        await launcher.ensureStarted(startPort);
      }
    );
    showTerminalPanel(context, launcher.url, connectionId, name);
  } catch (e: any) {
    vscode.window.showErrorMessage(
      '启动 AICmd 失败：' + (e?.message || String(e))
    );
  }
}

/** 打开「新增 / 编辑连接」专用 WebView（复用桌面端 ConnectionEditor 弹窗）。 */
async function openEdit(
  context: vscode.ExtensionContext,
  startPort: number,
  connectionId?: string
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在启动 AICmd 服务…'
      },
      async () => {
        await launcher.ensureStarted(startPort);
      }
    );
    const url = connectionId
      ? `${launcher.url}/public/src/vscode-edit.html?id=${encodeURIComponent(
          connectionId
        )}`
      : `${launcher.url}/public/src/vscode-edit.html`;
    editPanel?.dispose();
    editPanel = showPanel(context, url, 'AICmd 连接编辑');
  } catch (e: any) {
    vscode.window.showErrorMessage(
      '启动 AICmd 失败：' + (e?.message || String(e))
    );
  }
}

function showTerminalPanel(
  context: vscode.ExtensionContext,
  url: string,
  connectionId?: string,
  name?: string
): void {
  // 复用完整 TerminalTab 的 WebView 页（自带 AI 对话 + 文件浏览，
  // 但不带侧边栏 / Tab 栏）。指定连接时带 connectionId + name，
  // 不指定时（顶部「打开本地 Shell」）默认打开本地 Shell
  const src = connectionId
    ? `${url}/public/src/vscode-term.html?connectionId=${encodeURIComponent(
        connectionId
      )}&name=${encodeURIComponent(name || connectionId)}`
    : `${url}/public/src/vscode-term.html?connectionId=__local__&name=${encodeURIComponent(
        name || '本地 Shell'
      )}`;
  showPanel(context, src, name || '本地 Shell');
}

/** 创建 WebView 面板并加载指定地址。 */
function showPanel(
  context: vscode.ExtensionContext,
  src: string,
  title: string,
  forcedTitle?: string
): vscode.WebviewPanel {
  // 同名连接重复打开时自动追加编号（server-1 → 「server 2」「server 3」…）；
  // 窗口恢复时使用 forcedTitle 保留原编号
  const actualTitle = forcedTitle || allocateTitle(title);
  const panel = vscode.window.createWebviewPanel(
    'aicmd.terminal',
    actualTitle,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  wirePanel(panel, src, title, actualTitle);
  return panel;
}

/** 为一个已存在的 WebView 面板绑定 html、消息桥与生命周期（创建 / 恢复复用）。 */
function wirePanel(
  panel: vscode.WebviewPanel,
  src: string,
  base: string,
  actualTitle: string
): void {
  panel.webview.html = buildHtml(src, actualTitle);
  panelMeta.set(panel, { base, title: actualTitle });
  panelSrc.set(panel, src);

  // iframe 通过 postMessage 与扩展宿主通信：编辑 / 新增连接保存成功后，
  // 刷新树并关闭编辑面板
  panel.webview.onDidReceiveMessage(async (msg: any) => {
    if (!msg) return;
    if (msg.type === 'aicmd-edit-saved') {
      treeProvider.refresh();
      editPanel?.dispose();
    }
    if (msg.type === 'aicmd-edit-close') {
      editPanel?.dispose();
    }
  });

  panel.onDidDispose(
    () => {
      panels.delete(panel);
      panelMeta.delete(panel); // 释放编号，后续同名 tab 可复用
      panelSrc.delete(panel);
      if (panel === editPanel) editPanel = undefined;
      // 仅当所有面板都关闭时才关闭后端服务
      if (panels.size === 0) launcher.stop();
    },
    undefined,
    extContext?.subscriptions
  );

  panels.add(panel);
}

function buildHtml(url: string, title: string): string {
  const csp = [
    `default-src 'none';`,
    `img-src data: https: blob:;`,
    `media-src https: data: blob:;`,
    `style-src 'unsafe-inline';`,
    // 宿主页内的消息转发脚本是内联的，必须放行（否则编辑保存后不刷新、面板不关闭）
    `script-src 'unsafe-inline';`,
    `frame-src http://127.0.0.1:* http://localhost:*;`
  ].join(' ');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
  html, body {
    margin: 0;
    height: 100%;
    overflow: hidden;
    /* 跟随 VSCode 主题，避免 iframe 加载前闪一帧默认底色 */
    background: var(--vscode-editor-background, #1e1e1e);
  }
  iframe { position: absolute; inset: 0; border: 0; width: 100%; height: 100%; }
</style>
</head>
<body>
<iframe id="frame"></iframe>
<script>
(function () {
  var BASE = ${JSON.stringify(url)};
  var TITLE = ${JSON.stringify(title)};
  // 把面板身份写入持久化状态，窗口重载后由 WebviewPanelSerializer 取回并恢复
  try { vscode.setState({ src: BASE, base: TITLE, title: TITLE }); } catch (e) {}

  // 需要下发给应用页面的主题色（应用页面在跨源 iframe 中，读不到这里的 --vscode-* 变量）
  var THEME_VARS = [
    'editor-background', 'editor-foreground', 'foreground', 'descriptionForeground', 'disabledForeground',
    'sideBar-background', 'sideBar-foreground', 'sideBar-border',
    'activityBar-background', 'activityBar-foreground',
    'titleBar-activeBackground', 'titleBar-activeForeground',
    'editorGroupHeader-tabsBackground', 'editorGroup-border', 'tab-activeBackground', 'tab-inactiveBackground',
    'panel-background', 'panel-border', 'panelTitle-activeBorder',
    'editorWidget-background', 'editorWidget-border', 'editorWidget-foreground', 'editorHoverWidget-background',
    'focusBorder', 'contrastBorder', 'contrastActiveBorder',
    'button-background', 'button-foreground', 'button-hoverBackground', 'button-secondaryBackground', 'button-secondaryHoverBackground',
    'input-background', 'input-foreground', 'input-border', 'input-placeholderForeground',
    'dropdown-background', 'dropdown-foreground', 'dropdown-border',
    'list-hoverBackground', 'list-activeSelectionBackground', 'list-activeSelectionForeground', 'list-inactiveSelectionBackground',
    'badge-background', 'badge-foreground',
    'scrollbarSlider-background', 'scrollbarSlider-hoverBackground', 'scrollbarSlider-activeBackground',
    'errorForeground', 'editorError-foreground', 'editorWarning-foreground',
    'textLink-foreground', 'textLink-activeForeground', 'textCodeBlock-background',
    'menu-background', 'menu-foreground', 'menu-border', 'menu-selectionBackground', 'menu-selectionForeground',
    'notifications-background', 'notifications-border',
    'toolbar-hoverBackground',
    'editor-selectionBackground', 'editorCursor-foreground',
    'terminal-background', 'terminal-foreground', 'terminal-selectionBackground', 'terminalCursor-foreground',
    'terminal-ansiBlack', 'terminal-ansiRed', 'terminal-ansiGreen', 'terminal-ansiYellow',
    'terminal-ansiBlue', 'terminal-ansiMagenta', 'terminal-ansiCyan', 'terminal-ansiWhite',
    'terminal-ansiBrightBlack', 'terminal-ansiBrightRed', 'terminal-ansiBrightGreen', 'terminal-ansiBrightYellow',
    'terminal-ansiBrightBlue', 'terminal-ansiBrightMagenta', 'terminal-ansiBrightCyan', 'terminal-ansiBrightWhite',
    'charts-orange', 'charts-blue', 'charts-green', 'charts-yellow',
    'gitDecoration-addedResourceForeground', 'testing-iconPassed',
    'progressBar-background'
  ];

  var vscode = acquireVsCodeApi();
  var frame = document.getElementById('frame');
  var probe = null;
  var lastKey = '';
  var timer = null;

  /** 借助样式归一化把任意颜色写法转成 rgb 分量（用于判断明暗） */
  function toRgb(value) {
    if (!probe) {
      probe = document.createElement('span');
      probe.style.display = 'none';
      document.body.appendChild(probe);
    }
    probe.style.color = '';
    probe.style.color = value;
    var computed = getComputedStyle(probe).color || '';
    var m = computed.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    var parts = m[1].split(',').map(function (s) { return parseFloat(s); });
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }

  function isDarkColor(value) {
    var c = value ? toRgb(value) : null;
    if (!c || c.a < 0.5) return null;
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 < 0.5;
  }

  function payload() {
    var cs = getComputedStyle(document.documentElement);
    var vars = {};
    for (var i = 0; i < THEME_VARS.length; i++) {
      var v = cs.getPropertyValue('--vscode-' + THEME_VARS[i]).trim();
      if (v) vars[THEME_VARS[i]] = v;
    }

    var dark = isDarkColor(vars['editor-background']);
    if (dark === null && window.matchMedia) {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    var cls = (document.body && document.body.className) || '';
    var kind = dark ? 'dark' : 'light';
    if (cls.indexOf('vscode-high-contrast-light') >= 0) kind = 'hc-light';
    else if (cls.indexOf('vscode-high-contrast') >= 0) kind = 'hc-dark';

    return {
      type: 'aicmd-vscode-theme',
      kind: kind,
      dark: !!dark,
      bg: vars['editor-background'] || '',
      fg: vars['editor-foreground'] || vars['foreground'] || '',
      vars: vars
    };
  }

  /** 主题色变化时把最新配色推给 iframe（内容去重，避免无谓通信） */
  function push(force) {
    var p = payload();
    var key = JSON.stringify(p);
    if (!force && key === lastKey) return;
    lastKey = key;
    document.documentElement.style.colorScheme = p.dark ? 'dark' : 'light';
    try {
      if (frame && frame.contentWindow) frame.contentWindow.postMessage(p, '*');
    } catch (e) {}
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { push(false); }, 60);
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d) return;
    // 应用页面就绪后主动拉取一次主题（首帧推送可能早于页面注册监听）
    if (d.type === 'aicmd-vscode-theme-request') {
      push(true);
      return;
    }
    // 把 iframe（编辑页）的消息转发给扩展宿主
    if (d.type === 'aicmd-edit-saved') {
      vscode.postMessage({ type: 'aicmd-edit-saved' });
    }
    if (d.type === 'aicmd-edit-close') {
      vscode.postMessage({ type: 'aicmd-edit-close' });
    }
  });

  // VSCode 切换主题时会重写 WebView 内注入的 --vscode-* 样式，监听这些变化即可实时跟随
  try {
    var observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
  } catch (e) {}

  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
    } catch (e) {}
  }
  setInterval(function () { push(false); }, 2000);

  var first = payload();
  document.documentElement.style.colorScheme = first.dark ? 'dark' : 'light';
  frame.addEventListener('load', function () { push(true); });
  frame.src = BASE + (BASE.indexOf('?') >= 0 ? '&' : '?') +
    'aicmd_vscode=1' +
    '&vkind=' + encodeURIComponent(first.kind) +
    '&vbg=' + encodeURIComponent(first.bg) +
    '&vfg=' + encodeURIComponent(first.fg);
})();
</script>
</body>
</html>`;
}

/**
 * 解析 AICmd 项目根目录。
 * - 打包模式：可将运行时（server.js / dist / data）放在扩展目录的 runtime/ 下。
 * - 开发模式：扩展位于 <root>/packages/vscode，从扩展目录逐级向上查找
 *   包含 server.js 的目录作为项目根。
 */
function resolveProjectRoot(extensionPath: string): string {
  const asPackage = path.join(extensionPath, 'runtime');
  if (fs.existsSync(path.join(asPackage, 'server.js'))) return asPackage;

  let dir = path.resolve(extensionPath);
  const root = path.parse(dir).root;
  for (let i = 0; i < 4 && dir !== root; i++) {
    if (fs.existsSync(path.join(dir, 'server.js'))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(extensionPath, '..', '..');
}
