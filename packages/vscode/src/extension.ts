import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ServerLauncher } from './server-launcher';
import { AICmdTreeProvider } from './tree-provider';
import { isChinese, t } from './i18n';
import { TerminalBridge } from './ws-bridge';
import { AicmdFileSystemProvider } from './remote-fs';
import { AicmdStatusBar } from './status-bar';

let launcher: ServerLauncher;
let treeProvider: AICmdTreeProvider;
let output: vscode.OutputChannel;
let extContext: vscode.ExtensionContext | undefined;
let activePanel: vscode.WebviewPanel | undefined;
let bridge: TerminalBridge | undefined;
let remoteFs: AicmdFileSystemProvider | undefined;
let statusBar: AicmdStatusBar | undefined;
const panels = new Set<vscode.WebviewPanel>();
let editPanel: vscode.WebviewPanel | undefined;
// 记录每个面板的基础名与实际 tab 标题，用于同名连接打开多次时追加编号区分
const panelMeta = new Map<vscode.WebviewPanel, { base: string; title: string }>();
// 记录每个面板加载的 src（含连接 id），用于窗口重载后恢复
const panelSrc = new Map<vscode.WebviewPanel, string>();
// 连接节点单击时间窗，用于把「双击节点」与「单击选中」区分开
const lastConnectionClick = new Map<string, number>();
// 窗口全屏是全局状态，扩展侧记住当前值以幂等响应 iframe 的重复请求
let vscodeFullscreenActive = false;

/** 把树菜单命令的参数归一化为连接 id。
 *  view/item/context 触发时 VSCode 会把 TreeItem 对象作为第一个参数传入，
 *  节点点击则传字符串；两者都要能正确取到连接 id。 */
function toId(arg?: unknown): string | undefined {
  if (typeof arg === 'string') return arg || undefined;
  const t = arg as vscode.TreeItem | undefined;
  const id = t && (t as any).id;
  return typeof id === 'string' && id ? id : undefined;
}

/** 从面板 URL 中取出连接 id（编辑面板没有该参数）。 */
function connectionIdOfPanel(panel: vscode.WebviewPanel): string | undefined {
  const src = panelSrc.get(panel);
  if (!src) return undefined;
  try {
    return new URL(src).searchParams.get('connectionId') || undefined;
  } catch {
    return undefined;
  }
}

/** 找到某连接对应的终端面板（优先当前聚焦的面板）。 */
function findPanelByConnection(connectionId: string): vscode.WebviewPanel | undefined {
  if (
    activePanel &&
    panels.has(activePanel) &&
    connectionIdOfPanel(activePanel) === connectionId
  ) {
    return activePanel;
  }
  for (const p of panels) {
    if (connectionIdOfPanel(p) === connectionId) return p;
  }
  return undefined;
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
  treeProvider = new AICmdTreeProvider(launcher, context.extensionUri);
  const savedGroupMode = context.globalState.get<string>('aicmd.groupMode');
  if (savedGroupMode === 'group' || savedGroupMode === 'tag') {
    treeProvider.setGroupMode(savedGroupMode);
  }

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('aicmd.explorer', treeProvider)
  );

  // 远程文件系统：aicmd://<连接 id>/<远程绝对路径>
  bridge = new TerminalBridge(() => launcher.url);
  remoteFs = new AicmdFileSystemProvider(launcher, bridge);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('aicmd', remoteFs, {
      isCaseSensitive: true
    })
  );
  statusBar = new AicmdStatusBar(
    launcher,
    startPort,
    findPanelByConnection,
    () =>
      activePanel
        ? {
            panel: activePanel,
            title: panelMeta.get(activePanel)?.title || 'AICmd'
          }
        : undefined
  );
  context.subscriptions.push(statusBar);

  const register = (id: string, handler: (...args: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));

  register(
    'aicmd.openTerminal',
    (connectionId?: unknown, name?: string, connectionType?: string) =>
      openTerminal(context, startPort, toId(connectionId), name, connectionType)
  );
  register('aicmd.refresh', () => treeProvider.refresh());
  register('aicmd.toggleGroup', (name?: unknown) => {
    if (typeof name === 'string') treeProvider.toggleGroup(name);
  });
  // TreeView 没有独立的双击事件：单击只记录时间，时间窗内第二次点击才打开。
  // 对应节点 command 由 tree-provider 设置；右侧 ▶ 按钮仍直接调 openTerminal。
  register(
    'aicmd.connectionClicked',
    (connectionId?: unknown, name?: string, connectionType?: string) => {
      const cid = toId(connectionId);
      if (!cid) return;
      const now = Date.now();
      const previous = lastConnectionClick.get(cid) ?? 0;
      lastConnectionClick.set(cid, now);
      if (now - previous > 500) return;
      lastConnectionClick.delete(cid);
      // __local__ 是本地 Shell 节点的双击键，打开时仍走「无连接 id」的本地 Shell 逻辑
      return openTerminal(
        context,
        startPort,
        cid === '__local__' ? undefined : cid,
        name,
        connectionType
      );
    }
  );
  register('aicmd.setGroupMode', async () => {
    const groupLabel = t('按分组折叠', 'Group by connection group');
    const tagLabel = t('按标签折叠', 'Group by tag');
    const picked = await vscode.window.showQuickPick([groupLabel, tagLabel], {
      placeHolder: t('选择连接树的分组方式', 'Choose how to group connections'),
    });
    if (!picked) return;
    const mode = picked === tagLabel ? 'tag' : 'group';
    treeProvider.setGroupMode(mode);
    await context.globalState.update('aicmd.groupMode', mode);
  });
  register('aicmd.runSelection', () => runSelection(startPort));
  register('aicmd.showSessions', () => statusBar?.showSessions());
  register('aicmd.browseRemote', (id?: unknown) => browseRemote(startPort, toId(id)));

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
      const deleteLabel = t('删除', 'Delete');
      const answer = await vscode.window.showWarningMessage(
        t('确定删除该连接吗？', 'Delete this connection?'),
        { modal: true },
        deleteLabel
      );
      if (answer !== deleteLabel) return;
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: t('正在删除…', 'Deleting…')
          },
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
          t('删除失败：', 'Failed to delete: ') + (e?.message || String(e))
        );
      }
    }
  );

  // 连接搜索 / JSON 备份共享
  register('aicmd.searchConnection', () => searchConnection(context, startPort));
  register('aicmd.exportConnections', () => exportConnections(startPort));
  register('aicmd.importConnections', () => importConnections(startPort));

  // 后端进程意外退出：通知用户并关闭所有面板（面板已无法正常工作）
  launcher.onUnexpectedExit = () => {
    try {
      output.appendLine(t('[aicmd] 后端进程意外退出', '[aicmd] backend exited unexpectedly'));
      vscode.window.showErrorMessage(
        t(
          'AICmd 后端进程意外退出，请重新打开终端。',
          'The AICmd backend exited unexpectedly. Please reopen the terminal.'
        )
      );
      for (const p of [...panels]) {
        try {
          p.dispose();
        } catch {
          /* ignore */
        }
      }
    } catch (e: any) {
      // 子进程 exit 事件里的异常不能冒泡到扩展宿主
      console.error('[aicmd] onUnexpectedExit error:', e);
    }
  };

  // 配置变更提示（dataDir / startPort 在 activate 时读取，需重启生效）
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('aicmd.dataDir') ||
        e.affectsConfiguration('aicmd.startPort')
      ) {
        output.appendLine(
          t('[aicmd] 配置已变更，重启扩展后生效', '[aicmd] configuration changed; reload to apply')
        );
        vscode.window.showInformationMessage(
          t(
            'AICmd 配置已变更，请重新加载窗口以生效。',
            'AICmd configuration changed. Reload the window to apply.'
          )
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
          try { panel.dispose(); } catch { /* ignore */ }
          return;
        }
        try {
          const baseUrl = await launcher.ensureStarted(startPort);
          // 持久化的 src 含上次会话的后端端口；窗口重载后服务会重新选端口，
          // 必须把 origin 换成这次实际启动的地址，否则 iframe 加载旧地址后一直空白。
          const src = rebasePersistedSrc(s.src, baseUrl);
          wirePanel(panel, src, s.base || 'AICmd', s.title || panel.title);
        } catch (e: any) {
          const msg = e?.message || String(e);
          output.appendLine(`[aicmd] restore panel failed: ${msg}`);
          try {
            panel.webview.html = buildRestoreErrorHtml(s.title || panel.title, msg);
          } catch {
            /* ignore */
          }
        }
      }
    })
  );

  // 扩展停用时关闭后端服务，避免残留进程
  context.subscriptions.push({
    dispose: () => {
      bridge?.close();
      remoteFs?.dispose();
      launcher?.stop();
    }
  });
}

export function deactivate(): void {
  bridge?.close();
  remoteFs?.dispose();
  launcher?.stop();
}

async function openTerminal(
  context: vscode.ExtensionContext,
  startPort: number,
  connectionId?: string,
  name?: string,
  connectionType?: string
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: connectionId
          ? t(`正在连接 ${name || connectionId}…`, `Connecting to ${name || connectionId}…`)
          : t('正在启动 AICmd 服务…', 'Starting AICmd service…')
      },
      async () => {
        await launcher.ensureStarted(startPort);
        // 侧栏 ▶ 按钮只会传 TreeItem（取得到 id，取不到 name/type），
        // 双击节点和命令面板则会完整传入；这里统一按 id 补齐，避免
        // 标题退化成「本地 Shell」、RDP 连接被当成 SSH 打开。
        if (
          connectionId &&
          connectionId !== '__local__' &&
          (!name || !connectionType)
        ) {
          try {
            const conn = (await launcher.getConnections()).find(
              (c) => String(c.id) === connectionId
            );
            if (conn) {
              name = name || conn.name || conn.host || connectionId;
              connectionType = connectionType || conn.type;
            }
          } catch {
            /* 连接列表读取失败时仍按已有参数打开 */
          }
        }
      }
    );
    showTerminalPanel(context, launcher.url, connectionId, name, connectionType);
  } catch (e: any) {
    vscode.window.showErrorMessage(
      t('启动 AICmd 失败：', 'Failed to start AICmd: ') + (e?.message || String(e))
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
        title: t('正在启动 AICmd 服务…', 'Starting AICmd service…')
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
    editPanel = showPanel(context, url, t('AICmd 连接编辑', 'AICmd Connection Editor'));
  } catch (e: any) {
    vscode.window.showErrorMessage(
      t('启动 AICmd 失败：', 'Failed to start AICmd: ') + (e?.message || String(e))
    );
  }
}

/** 把当前选区（无选区时为当前行）发到活动 SSH 会话执行。 */
async function runSelection(startPort: number): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(t('请先打开一个编辑器。', 'Open an editor first.'));
    return;
  }
  const selection = editor.selection;
  let text = editor.document.getText(selection).trimEnd();
  if (!text.trim()) {
    text = editor.document.lineAt(selection.active.line).text.trim();
  }
  if (!text.trim()) {
    vscode.window.showWarningMessage(t('没有可执行的选中内容。', 'Nothing selected to run.'));
    return;
  }

  const panel =
    activePanel && panels.has(activePanel)
      ? activePanel
      : panels.size === 1
      ? [...panels][0]
      : undefined;
  if (!panel) {
    vscode.window.showWarningMessage(
      t('请先聚焦一个 AICmd SSH 终端面板。', 'Focus an AICmd SSH terminal panel first.')
    );
    return;
  }
  const connectionId = connectionIdOfPanel(panel);
  if (!connectionId) {
    vscode.window.showWarningMessage(
      t('当前面板不是 SSH 终端（RDP / 连接编辑不支持执行命令）。',
        'The active panel is not an SSH terminal (RDP / connection editor cannot run commands).')
    );
    return;
  }

  try {
    await launcher.ensureStarted(startPort);
    const result = await launcher.api('/api/terminal/getSessions', {});
    const list: any[] = Array.isArray(result) ? result : [];
    const candidates = list
      .filter((s) => s.connectionId === connectionId && (s.type === 'ssh' || s.type === 'local'))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!candidates.length) {
      vscode.window.showWarningMessage(
        t('该连接没有活动的 SSH 会话，请先打开终端。',
          'No active SSH session for this connection. Open a terminal first.')
      );
      return;
    }
    await bridge!.writeToSession(
      candidates[0].sessionId,
      text.endsWith('\n') ? text : text + '\n'
    );
    panel.reveal();
  } catch (e: any) {
    vscode.window.showErrorMessage(
      t('发送命令失败：', 'Failed to send command: ') + (e?.message || String(e))
    );
  }
}

async function pickRemoteConnection(startPort: number): Promise<string | undefined> {
  await launcher.ensureStarted(startPort);
  const connections = await launcher.getConnections();
  const candidates = connections.filter((c) => c.type !== 'rdp');
  if (!candidates.length) {
    vscode.window.showInformationMessage(
      t('没有可用的 SSH / 本地连接。', 'No SSH / local connections available.')
    );
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    candidates.map((c) => ({
      label: c.name || c.host || String(c.id),
      description: [c.username, c.host].filter(Boolean).join('@') || String(c.id),
      id: String(c.id)
    })),
    { placeHolder: t('选择远程连接', 'Select a remote connection') }
  );
  return picked?.id;
}

async function assertNotRdp(connectionId: string): Promise<boolean> {
  const connections = await launcher.getConnections();
  const conn = connections.find((c) => String(c.id) === connectionId);
  if (conn?.type === 'rdp') {
    vscode.window.showWarningMessage(
      t('RDP 连接不支持远程文件系统，请改用 SSH / 本地连接。',
        'RDP connections do not support the remote file system. Use SSH / local connections.')
    );
    return false;
  }
  return true;
}

type RemotePickItem = vscode.QuickPickItem & {
  action: 'up' | 'dir' | 'file' | 'cancel';
  name?: string;
};

/**
 * 用 QuickPick 逐级浏览远程目录。相比 showOpenDialog，这里可以明确放一个
 * 「取消」项，Esc 也能直接退出；选中的文件在编辑器打开，Ctrl+S 保存回远程。
 */
async function browseRemoteFiles(connectionId: string): Promise<void> {
  let dir = await remoteFs!.rootUri(connectionId);
  while (true) {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch (e: any) {
      vscode.window.showErrorMessage(
        t('读取远程目录失败：', 'Failed to read remote directory: ') + (e?.message || String(e))
      );
      return;
    }
    entries.sort((a, b) => {
      const aDir = (a[1] & vscode.FileType.Directory) !== 0 ? 0 : 1;
      const bDir = (b[1] & vscode.FileType.Directory) !== 0 ? 0 : 1;
      return aDir - bDir || a[0].localeCompare(b[0]);
    });

    const parent = path.posix.dirname(dir.path);
    const items: RemotePickItem[] = [];
    if (parent !== dir.path) {
      items.push({
        label: '$(arrow-up) ..',
        description: t('返回上级目录', 'Go to parent directory'),
        action: 'up'
      });
    }
    for (const [name, fileType] of entries) {
      const isDir = (fileType & vscode.FileType.Directory) !== 0;
      items.push({
        label: isDir ? `$(folder) ${name}` : `$(file) ${name}`,
        description: t('远程目录', 'Remote directory') + ': ' + dir.path,
        action: isDir ? 'dir' : 'file',
        name
      });
    }
    items.push({
      label: `$(close) ${t('取消', 'Cancel')}`,
      action: 'cancel'
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: t('浏览远程目录：', 'Browse remote directory: ') + dir.path,
      matchOnDescription: false,
      ignoreFocusOut: false
    });
    if (!picked || picked.action === 'cancel') return;
    if (picked.action === 'up') {
      dir = dir.with({ path: parent });
      continue;
    }

    const child = vscode.Uri.from({
      scheme: 'aicmd',
      authority: dir.authority,
      path: path.posix.join(dir.path, picked.name || '')
    });
    if (picked.action === 'dir') {
      dir = child;
      continue;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(child);
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (e: any) {
      vscode.window.showErrorMessage(
        t('打开远程文件失败：', 'Failed to open remote file: ') + (e?.message || String(e))
      );
    }
    return;
  }
}

/** 浏览远程文件（唯一入口）。 */
async function browseRemote(startPort: number, connectionId?: string): Promise<void> {
  try {
    const cid = connectionId || (await pickRemoteConnection(startPort));
    if (!cid || !(await assertNotRdp(cid))) return;
    await browseRemoteFiles(cid);
  } catch (e: any) {
    vscode.window.showErrorMessage(
      t('浏览远程文件失败：', 'Failed to browse remote files: ') + (e?.message || String(e))
    );
  }
}

/** 快速搜索连接（名称 / 分组 / 标签），选中即打开终端。 */
async function searchConnection(
  context: vscode.ExtensionContext,
  startPort: number
): Promise<void> {
  try {
    await launcher.ensureStarted(startPort);
    const conns = await launcher.getConnections();
    const localShell = t('本地 Shell', 'Local Shell');
    const ungrouped = t('未分组', 'Ungrouped');
    type PickItem = vscode.QuickPickItem & {
      connectionId?: string;
      name: string;
      type?: string;
    };
    const items: PickItem[] = [
      {
        label: localShell,
        description: t('打开本地 Shell', 'Open Local Shell'),
        name: localShell,
      },
      ...conns.map((c) => ({
        label: c.name || c.host || String(c.id),
        description: [
          c.group?.trim() || ungrouped,
          ...(c.tags || []).map((tag) => `#${tag}`),
          [c.username, c.host].filter(Boolean).join('@'),
        ]
          .filter(Boolean)
          .join(' · '),
        name: c.name || c.host || String(c.id),
        connectionId: String(c.id),
        type: c.type,
      })),
    ];
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: t('搜索连接（名称 / 分组 / 标签）', 'Search connections (name / group / tags)'),
      matchOnDescription: true,
    });
    if (!picked) return;
    await openTerminal(context, startPort, picked.connectionId, picked.name, picked.type);
  } catch (e: any) {
    vscode.window.showErrorMessage(
      t('搜索连接失败：', 'Failed to search connections: ') + (e?.message || String(e))
    );
  }
}

/** 导出连接 JSON；凭据默认剔除，仅个人备份时包含。 */
async function exportConnections(startPort: number): Promise<void> {
  const omitLabel = t('不包含凭据（团队共享）', 'Omit secrets (team sharing)');
  const includeLabel = t('包含密码 / 私钥（个人备份）', 'Include secrets (personal backup)');
  const choice = await vscode.window.showQuickPick([omitLabel, includeLabel], {
    placeHolder: t('选择导出方式', 'Choose export mode'),
  });
  if (!choice) return;

  try {
    const data = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('正在导出连接…', 'Exporting connections…'),
      },
      async () => {
        await launcher.ensureStarted(startPort);
        return launcher.api('/api/connection/exportConnections', {
          includeSecrets: choice === includeLabel,
        });
      }
    );
    const workspaceDir =
      vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file(os.homedir());
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(
        workspaceDir,
        `aicmd-connections-${new Date().toISOString().slice(0, 10)}.json`
      ),
      filters: { JSON: ['json'] },
      saveLabel: t('导出', 'Export'),
    });
    if (!target) return;
    await vscode.workspace.fs.writeFile(
      target,
      Buffer.from(JSON.stringify(data, null, 2), 'utf8')
    );
    vscode.window.showInformationMessage(
      t('连接已导出：', 'Connections exported: ') + target.fsPath
    );
  } catch (e: any) {
    vscode.window.showErrorMessage(
      t('导出连接失败：', 'Failed to export connections: ') + (e?.message || String(e))
    );
  }
}

/** 导入连接 JSON；按名称覆盖同名配置，保留其余连接。 */
async function importConnections(startPort: number): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { JSON: ['json'] },
    openLabel: t('选择 JSON 文件', 'Select JSON file'),
  });
  if (!picked?.length) return;
  const importLabel = t('导入', 'Import');
  const answer = await vscode.window.showWarningMessage(
    t('导入连接 JSON？同名连接将被覆盖，其余连接保持不变。',
      'Import connections? Same-name connections will be overwritten; others stay unchanged.'),
    { modal: true },
    importLabel
  );
  if (answer !== importLabel) return;

  try {
    const text = Buffer.from(await vscode.workspace.fs.readFile(picked[0])).toString('utf8');
    const payload = JSON.parse(text);
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('正在导入连接…', 'Importing connections…'),
      },
      async () => {
        await launcher.ensureStarted(startPort);
        return launcher.api('/api/connection/importConnections', {
          payload,
          mode: 'update',
        });
      }
    );
    treeProvider.refresh();
    const r = result || {};
    vscode.window.showInformationMessage(
      t('导入完成：新增 ', 'Imported: ') +
        (r.added || 0) +
        t('，覆盖 ', ', ') +
        (r.updated || 0) +
        t('，跳过 ', ', ') +
        (r.skipped || 0)
    );
  } catch (e: any) {
    vscode.window.showErrorMessage(
      t('导入连接失败：', 'Failed to import connections: ') + (e?.message || String(e))
    );
  }
}

function showTerminalPanel(
  context: vscode.ExtensionContext,
  url: string,
  connectionId?: string,
  name?: string,
  connectionType?: string
): void {
  // 复用完整 TerminalTab 的 WebView 页（自带 AI 对话 + 文件浏览，
  // 但不带侧边栏 / Tab 栏）。指定连接时带 connectionId + name + type，
  // 不指定时（顶部「打开本地 Shell」）默认打开本地 Shell。
  // RDP 连接由 WebView 内的 IronRDP-WASM 组件渲染远程桌面。
  const localShell = t('本地 Shell', 'Local Shell');
  const typeParam = connectionType ? `&type=${encodeURIComponent(connectionType)}` : '';
  const src = connectionId
    ? `${url}/public/src/vscode-term.html?connectionId=${encodeURIComponent(
        connectionId
      )}&name=${encodeURIComponent(name || connectionId)}${typeParam}`
    : `${url}/public/src/vscode-term.html?connectionId=__local__&name=${encodeURIComponent(
        name || localShell
      )}`;
  showPanel(context, src, name || localShell);
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
  // 让编辑器 Tab 使用本插件图标（resources/activity-icon.png），而非默认文件图标
  panel.iconPath = vscode.Uri.joinPath(
    extContext!.extensionUri,
    'resources',
    'activity-icon.png'
  );
  panel.webview.html = buildHtml(src, actualTitle);
  panelMeta.set(panel, { base, title: actualTitle });
  panelSrc.set(panel, src);

  panel.onDidChangeViewState(() => {
    if (panel.active && panels.has(panel)) {
      activePanel = panel;
      statusBar?.refresh();
    }
  });

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
    // 剪贴板桥接：跨源 iframe 内的 navigator.clipboard 不可用，
    // 由扩展宿主用 vscode.env.clipboard 代为读写后回传结果。
    if (msg.type === 'aicmd-clipboard-read-request') {
      try {
        const text = await vscode.env.clipboard.readText();
        panel.webview.postMessage({
          __aicmd_clipboard: true,
          type: 'aicmd-clipboard-read-response',
          reqId: msg.reqId,
          ok: true,
          text
        } as any);
      } catch (err: any) {
        panel.webview.postMessage({
          __aicmd_clipboard: true,
          type: 'aicmd-clipboard-read-response',
          reqId: msg.reqId,
          ok: false,
          error: String(err?.message || err)
        } as any);
      }
      return;
    }
    if (msg.type === 'aicmd-clipboard-write-request') {
      try {
        await vscode.env.clipboard.writeText(msg.text || '');
        panel.webview.postMessage({
          __aicmd_clipboard: true,
          type: 'aicmd-clipboard-write-response',
          reqId: msg.reqId,
          ok: true
        } as any);
      } catch (err: any) {
        panel.webview.postMessage({
          __aicmd_clipboard: true,
          type: 'aicmd-clipboard-write-response',
          reqId: msg.reqId,
          ok: false,
          error: String(err?.message || err)
        } as any);
      }
      return;
    }
    // 远程桌面全屏：webview 内的 iframe 受权限策略限制无法真正进入系统全屏，
    // 由扩展宿主切换 VSCode 窗口全屏，使远程桌面画面最大化。
    if (msg.type === 'aicmd-fullscreen-request') {
      const active = !!msg.active;
      if (active !== vscodeFullscreenActive) {
        vscodeFullscreenActive = active;
        try {
          await vscode.commands.executeCommand('workbench.action.toggleFullScreen');
        } catch { /* ignore */ }
      }
      return;
    }
  });

  panel.onDidDispose(
    () => {
      panels.delete(panel);
      panelMeta.delete(panel); // 释放编号，后续同名 tab 可复用
      panelSrc.delete(panel);
      if (panel === editPanel) editPanel = undefined;
      if (activePanel === panel) activePanel = undefined;
      statusBar?.refresh();
      // 仅当所有面板都关闭时才关闭后端服务
      if (panels.size === 0) launcher.stop();
    },
    undefined,
    extContext?.subscriptions
  );

  panels.add(panel);
}

/** 把持久化 URL 的 origin 换成当前后端地址，保留页面路径和全部查询参数。 */
function rebasePersistedSrc(src: string, baseUrl: string): string {
  try {
    const oldUrl = new URL(src);
    const newUrl = new URL(baseUrl);
    oldUrl.protocol = newUrl.protocol;
    oldUrl.host = newUrl.host;
    return oldUrl.toString();
  } catch {
    return src;
  }
}

/** 服务启动失败时在面板内直接显示原因，避免恢复的 Tab 空白且无任何提示。 */
function buildRestoreErrorHtml(title: string, message: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="${isChinese ? 'zh-CN' : 'en'}">
<head><meta charset="utf-8" /><style>
  body { color: var(--vscode-editor-foreground); background: var(--vscode-editor-background);
         font-family: var(--vscode-font-family); padding: 24px; line-height: 1.6; }
  code { color: var(--vscode-errorForeground); }
</style></head>
<body>
  <h3>${escape(title)}</h3>
  <p>${escape(t('AICmd 服务启动失败，恢复的窗口无法连接：', 'Failed to start AICmd service; the restored panel cannot connect:'))}</p>
  <p><code>${escape(message)}</code></p>
  <p>${escape(t('请查看「输出」面板中的 AICmd 频道，或关闭此 Tab 后重新打开连接。', 'See the AICmd output channel, or close this tab and reopen the connection.'))}</p>
</body>
</html>`;
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
  const locale = encodeURIComponent(vscode.env.language || 'en');

  return `<!DOCTYPE html>
<html lang="${isChinese ? 'zh-CN' : 'en'}">
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
<iframe id="frame" allow="fullscreen"></iframe>
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
    // 远程桌面全屏：iframe 无法直接调用扩展 API，转发请求给宿主执行窗口全屏
    if (d.type === 'aicmd-fullscreen-request') {
      vscode.postMessage(d);
      return;
    }
    // 剪贴板桥接：iframe 内的 navigator.clipboard 跨源不可用，
    // 请求转发给扩展宿主（其用 vscode.env.clipboard 处理）
    if (d.__aicmd_clipboard && (d.type === 'aicmd-clipboard-read-request' || d.type === 'aicmd-clipboard-write-request')) {
      vscode.postMessage(d);
      return;
    }
    // 剪贴板结果：扩展宿主回传后转发回 iframe
    if (d.__aicmd_clipboard && (d.type === 'aicmd-clipboard-read-response' || d.type === 'aicmd-clipboard-write-response')) {
      try {
        if (frame && frame.contentWindow) frame.contentWindow.postMessage(d, '*');
      } catch (err) {}
      return;
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
    '&locale=${locale}' +
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
  // 开发态（扩展位于 monorepo 的 packages/vscode 下）必须优先用源码根目录：
  // runtime/ 是发布时预打包的快照，可能落后于刚修改的后端（典型症状：
  // RDP TLS 修复改了却完全不生效，连接失败只显示 [object Object]）。
  // 发布态扩展目录的父级没有 server.js，才回退到随包携带的 runtime/。
  let dir = path.resolve(extensionPath);
  const root = path.parse(dir).root;
  for (let i = 0; i < 4 && dir !== root; i++) {
    const parent = path.dirname(dir);
    if (fs.existsSync(path.join(parent, 'server.js'))) return parent;
    dir = parent;
  }
  const asPackage = path.join(extensionPath, 'runtime');
  if (fs.existsSync(path.join(asPackage, 'server.js'))) return asPackage;
  return path.resolve(extensionPath, '..', '..');
}
