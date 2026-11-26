import * as vscode from 'vscode';
import { ServerLauncher, AicmdConnection } from './server-launcher';
import { t } from './i18n';

type GroupItem = vscode.TreeItem & { groupName: string };

/**
 * 侧边栏树：列出与桌面端 / CLI 共用的连接配置，按分组折叠，点击连接节点打开终端。
 * 连接列表来自 AICmd 后端（读取 ~/.aicmd/connections.json），即与独立运行的
 * fshell 完全相同的存储位置。
 */
export class AICmdTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChange = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChange.event;

  // 连接列表缓存：启动期 VSCode 会多次调用 getChildren，去重为一次请求，
  // 避免树反复重绘 / 出现「服务未启动」的错误闪现。
  private connsCache?: any[];
  private connsPromise?: Promise<any[]>;
  private groupMode: 'group' | 'tag' = 'group';
  // 分组折叠状态：原生 TreeView 的折叠箭头会多占一列缩进，这里改为
  // 自管理折叠，所有节点平铺在同一层级，图标/文字整体靠左对齐。
  private collapsedGroups = new Set<string>();

  constructor(
    private readonly launcher: ServerLauncher,
    private readonly extensionUri: vscode.Uri
  ) {}

  private groupKey(name: string): string {
    return `${this.groupMode}:${name}`;
  }

  /**
   * 连接图标：Bootstrap Icons 形状与 Web 端一致，颜色改用主题灰以匹配分组的
   * codicon；SVG 内部右侧留 4px，让图标与分组文件夹图标视觉对齐。
   */
  private treeIcon(
    name: 'terminal' | 'display' | 'hdd-network'
  ): { light: vscode.Uri; dark: vscode.Uri } {
    return {
      light: vscode.Uri.joinPath(
        this.extensionUri,
        'resources',
        'icons',
        `${name}-light.svg`
      ),
      dark: vscode.Uri.joinPath(
        this.extensionUri,
        'resources',
        'icons',
        `${name}-dark.svg`
      )
    };
  }

  private ungroupedName(): string {
    return this.groupMode === 'tag'
      ? t('无标签', 'No tags')
      : t('未分组', 'Ungrouped');
  }

  private groupOf(conn: AicmdConnection): string {
    return conn.group?.trim() || this.ungroupedName();
  }

  private groupNames(conn: AicmdConnection): string[] {
    if (this.groupMode === 'tag') {
      const tags = (conn.tags || []).map((tag) => tag.trim()).filter(Boolean);
      return tags.length ? tags : [this.ungroupedName()];
    }
    return [this.groupOf(conn)];
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const localShell = t('本地 Shell', 'Local Shell');

    // 所有节点都是顶层节点，不再用原生父子层级，避免折叠箭头多占一列缩进；
    // 分组折叠由 toggleGroup 自管理。
    if (element) return [];

    const openLocalShell = t('打开本地 Shell', 'Open Local Shell');
    const openAll = new vscode.TreeItem(
      openLocalShell,
      vscode.TreeItemCollapsibleState.None
    );
    openAll.iconPath = this.treeIcon('terminal');
    // 与连接节点一致走双击判定；__local__ 只是双击时间窗的键，不是连接 id
    openAll.command = {
      command: 'aicmd.connectionClicked',
      title: openLocalShell,
      arguments: ['__local__', localShell]
    };
    openAll.tooltip = t(
      '双击打开本地 Shell 终端',
      'Double-click to open a local shell terminal'
    );

    try {
      const conns = await this.loadConnections() as AicmdConnection[];
      const items: vscode.TreeItem[] = [openAll];

      if (conns.length > 0) {
        const byGroup = new Map<string, AicmdConnection[]>();
        for (const conn of conns) {
          for (const name of this.groupNames(conn)) {
            if (!byGroup.has(name)) byGroup.set(name, []);
            byGroup.get(name)!.push(conn);
          }
        }
        const ungrouped = this.ungroupedName();
        const groups = Array.from(byGroup, ([name, list]) => ({ name, list }))
          .sort((a, b) => {
            if (a.name === ungrouped) return 1;
            if (b.name === ungrouped) return -1;
            return a.name.localeCompare(b.name);
          });

        for (const { name, list } of groups) {
          const collapsed = this.collapsedGroups.has(this.groupKey(name));
          const groupItem = new vscode.TreeItem(
            name,
            vscode.TreeItemCollapsibleState.None
          ) as GroupItem;
          groupItem.groupName = name;
          groupItem.id = `aicmd-group:${this.groupKey(name)}`;
          groupItem.contextValue = 'connection-group';
          groupItem.iconPath = new vscode.ThemeIcon(
            name === ungrouped
              ? 'list-unordered'
              : this.groupMode === 'tag'
              ? 'tag'
              : collapsed
              ? 'folder'
              : 'folder-opened'
          );
          groupItem.description = String(list.length);
          groupItem.tooltip = `${name} · ${list.length} ${t('个连接', 'connections')}`;
          groupItem.command = {
            command: 'aicmd.toggleGroup',
            title: t('展开 / 折叠分组', 'Expand / collapse group'),
            arguments: [name]
          };
          items.push(groupItem);
          if (!collapsed) {
            for (const c of list) {
              items.push(this.connectionItem(c as AicmdConnection, localShell));
            }
          }
        }
      } else {
        const hint = new vscode.TreeItem(
          t('暂无连接，点击添加', 'No connections yet. Click to add one.'),
          vscode.TreeItemCollapsibleState.None
        );
        hint.iconPath = new vscode.ThemeIcon('add');
        hint.contextValue = 'hint';
        hint.command = {
          command: 'aicmd.addConnection',
          title: t('添加连接', 'Add Connection')
        };
        items.push(hint);
      }
      return items;
    } catch (e: any) {
      const msg = e?.message || String(e);
      const err = new vscode.TreeItem(
        t('服务未启动，点击刷新', 'Service not started. Click refresh.'),
        vscode.TreeItemCollapsibleState.None
      );
      err.iconPath = new vscode.ThemeIcon('error');
      err.contextValue = 'error';
      err.command = { command: 'aicmd.refresh', title: t('刷新', 'Refresh') };
      // 直接把原因显示出来，避免必须悬停才能看到
      err.description = msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
      err.tooltip =
        t('启动 AICmd 服务失败：', 'Failed to start AICmd service: ') +
        msg +
        t(
          '\n详情请查看「输出」面板中的 [aicmd-server] 日志。',
          '\nSee [aicmd-server] logs in the Output panel for details.'
        );
      return [openAll, err];
    }
  }

  private connectionItem(
    c: AicmdConnection,
    localShell: string
  ): vscode.TreeItem {
    const isLocal = c.type === 'local';
    const isRdp = c.type === 'rdp';
    const name = c.name || (isLocal ? localShell : c.host) || c.id;
    // 树是扁平的（去掉了原生箭头占位），这里用不换行空格把连接文字缩进
    // 一格，与分组标题形成明确的层级感；菜单/双击参数仍使用原始 name。
    const item = new vscode.TreeItem(
      `\u00a0\u00a0${name}`,
      vscode.TreeItemCollapsibleState.None
    );
    // 给 TreeItem 一个稳定身份，使内联图标 / 右键菜单命令都能正确取到 id
    // （view/item/context 触发时 VSCode 会把本对象作为首个参数传入）
    item.id = String(c.id);
    item.contextValue = 'connection';
    item.iconPath = this.treeIcon(
      isLocal ? 'terminal' : isRdp ? 'display' : 'hdd-network'
    );
    // 与 Web 端连接列表一致：副标题显示 username@host:port，标签以 #tag 追加
    const remoteDetail = `${[c.username, c.host].filter(Boolean).join('@')}${
      c.port ? `:${c.port}` : ''
    }`;
    const tags = (c.tags || []).map((tag) => `#${tag}`).join(' ');
    item.description = [isLocal ? localShell : remoteDetail, tags]
      .filter(Boolean)
      .join(' ');
    item.tooltip = [
      c.name || '',
      isLocal
        ? localShell
        : (isRdp ? t('远程桌面 · ', 'Remote Desktop · ') : '') + remoteDetail,
      this.groupMode === 'group' && this.groupOf(c) !== this.ungroupedName()
        ? t('分组：', 'Group: ') + this.groupOf(c)
        : '',
      tags,
    ]
      .filter(Boolean)
      .join('\n');
    // 单击只选中；双击由 aicmd.connectionClicked 做时间窗判定，
    // 或直接点右侧的 ▶ 按钮打开（避免误触）
    item.command = {
      command: 'aicmd.connectionClicked',
      title: t('双击打开（或点击右侧播放按钮）', 'Double-click to open (or click the play button)'),
      arguments: [c.id, c.name || (isLocal ? localShell : c.host), c.type]
    };
    return item;
  }

  /** 带去重缓存地加载连接列表（多路并发共享同一次请求）。 */
  private loadConnections(): Promise<any[]> {
    if (this.connsCache) return Promise.resolve(this.connsCache);
    if (this.connsPromise) return this.connsPromise;
    this.connsPromise = this.launcher
      .getConnections()
      .then(
        (c) => {
          this.connsCache = c;
          this.connsPromise = undefined;
          return c;
        },
        (e) => {
          this.connsPromise = undefined;
          throw e;
        }
      );
    return this.connsPromise;
  }

  toggleGroup(name: string): void {
    const key = this.groupKey(name);
    if (this.collapsedGroups.has(key)) this.collapsedGroups.delete(key);
    else this.collapsedGroups.add(key);
    this._onDidChange.fire();
  }

  setGroupMode(mode: 'group' | 'tag'): void {
    if (this.groupMode === mode) return;
    this.groupMode = mode;
    this.refresh();
  }

  refresh(): void {
    // 主动刷新时丢弃缓存，强制重新拉取
    this.connsCache = undefined;
    this.connsPromise = undefined;
    this._onDidChange.fire();
  }
}
