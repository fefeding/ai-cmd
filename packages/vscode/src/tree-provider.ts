import * as vscode from 'vscode';
import { ServerLauncher, AicmdConnection } from './server-launcher';
import { t } from './i18n';

/**
 * 侧边栏树：列出与桌面端 / CLI 共用的连接配置，点击任一节点在 VSCode 内打开终端。
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

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return [];

    const localShell = t('本地 Shell', 'Local Shell');
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
      const conns = await this.loadConnections();
      const items: vscode.TreeItem[] = [openAll];

      for (const c of conns as AicmdConnection[]) {
        const isLocal = c.type === 'local';
        const isRdp = c.type === 'rdp';
        const item = new vscode.TreeItem(
          c.name || (isLocal ? localShell : c.host) || c.id,
          vscode.TreeItemCollapsibleState.None
        );
        // 给 TreeItem 一个稳定身份，使右键菜单命令能正确取到 id
        // （view/item/context 触发时 VSCode 会把本对象作为首个参数传入）
        item.id = String(c.id);
        item.contextValue = 'connection';
        item.iconPath = this.treeIcon(
          isLocal ? 'terminal' : isRdp ? 'display' : 'hdd-network'
        );
        item.description = isLocal
          ? localShell
          : `${c.host || ''}${c.username ? ' · ' + c.username : ''}`;
        item.tooltip = `${c.name || ''}\n${
          isLocal
            ? localShell
            : (isRdp ? t('远程桌面 · ', 'Remote Desktop · ') : '') +
              (c.host || '') +
              ' ' +
              (c.username || '')
        }`;
        // 点击连接节点 → 打开 WebView tab（SSH 终端或 RDP 远程桌面）
        item.command = {
          command: 'aicmd.openTerminal',
          title: t('打开', 'Open'),
          arguments: [c.id, c.name || (isLocal ? localShell : c.host), c.type]
        };
        items.push(item);
      }

      if (conns.length === 0) {
        const hint = new vscode.TreeItem(
          t('暂无连接，点击上方按钮添加', 'No connections yet. Click + to add one.'),
          vscode.TreeItemCollapsibleState.None
        );
        hint.contextValue = 'hint';
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

  refresh(): void {
    // 主动刷新时丢弃缓存，强制重新拉取
    this.connsCache = undefined;
    this.connsPromise = undefined;
    this._onDidChange.fire();
  }
}
