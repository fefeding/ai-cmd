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

  constructor(
    private readonly launcher: ServerLauncher,
    private readonly extensionUri: vscode.Uri
  ) {}

  /** 与 web 端侧边栏一致的 Bootstrap Icons（区分浅色 / 深色主题）。 */
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

    // 展开分组节点：只返回该组的连接
    if (element) {
      const groupName = (element as GroupItem).groupName;
      if (groupName === undefined) return [];
      try {
        const conns = await this.loadConnections();
        return conns
          .filter((c) => this.groupNames(c as AicmdConnection).includes(groupName))
          .map((c) => this.connectionItem(c as AicmdConnection, localShell));
      } catch {
        return [];
      }
    }

    const openLocalShell = t('打开本地 Shell', 'Open Local Shell');
    const openAll = new vscode.TreeItem(
      openLocalShell,
      vscode.TreeItemCollapsibleState.None
    );
    openAll.iconPath = this.treeIcon('terminal');
    openAll.command = {
      command: 'aicmd.openTerminal',
      title: openLocalShell,
      arguments: [undefined, localShell]
    };
    openAll.tooltip = t(
      '在 VSCode 内打开一个本地 Shell 终端',
      'Open a local shell terminal inside VS Code'
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
          const groupItem = new vscode.TreeItem(
            name,
            vscode.TreeItemCollapsibleState.Collapsed
          ) as GroupItem;
          groupItem.groupName = name;
          // 稳定 id：VSCode 会据此记住分组的展开 / 折叠状态
          groupItem.id = `aicmd-group:${this.groupMode}:${name}`;
          groupItem.contextValue = 'connection-group';
          groupItem.iconPath = new vscode.ThemeIcon(
            name === ungrouped
              ? 'list-unordered'
              : this.groupMode === 'tag'
              ? 'tag'
              : 'folder'
          );
          groupItem.description = String(list.length);
          groupItem.tooltip = `${name} · ${list.length} ${t('个连接', 'connections')}`;
          items.push(groupItem);
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
    const item = new vscode.TreeItem(
      c.name || (isLocal ? localShell : c.host) || c.id,
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
