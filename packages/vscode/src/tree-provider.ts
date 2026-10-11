import * as vscode from 'vscode';
import { ServerLauncher, AicmdConnection } from './server-launcher';

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

  constructor(private readonly launcher: ServerLauncher) {}

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return [];

    const openAll = new vscode.TreeItem(
      '打开本地 Shell',
      vscode.TreeItemCollapsibleState.None
    );
    openAll.iconPath = new vscode.ThemeIcon('terminal');
    openAll.command = {
      command: 'aicmd.openTerminal',
      title: '打开本地 Shell',
      arguments: [undefined, '本地 Shell']
    };
    openAll.tooltip = '在 VSCode 内打开一个本地 Shell 终端';

    try {
      const conns = await this.loadConnections();
      const items: vscode.TreeItem[] = [openAll];

      for (const c of conns as AicmdConnection[]) {
        const isLocal = c.type === 'local';
        const item = new vscode.TreeItem(
          c.name || (isLocal ? '本地 Shell' : c.host) || c.id,
          vscode.TreeItemCollapsibleState.None
        );
        // 给 TreeItem 一个稳定身份，使右键菜单命令能正确取到 id
        // （view/item/context 触发时 VSCode 会把本对象作为首个参数传入）
        item.id = String(c.id);
        item.contextValue = 'connection';
        item.iconPath = new vscode.ThemeIcon(isLocal ? 'terminal' : 'globe');
        item.description = isLocal
          ? '本地 Shell'
          : `${c.host || ''}${c.username ? ' · ' + c.username : ''}`;
        item.tooltip = `${c.name || ''}\n${
          isLocal ? '本地 Shell' : (c.host || '') + ' ' + (c.username || '')
        }`;
        // 点击连接节点 → 打开只含 xterm 的纯终端 WebView tab
        item.command = {
          command: 'aicmd.openTerminal',
          title: '打开',
          arguments: [c.id, c.name || (isLocal ? '本地 Shell' : c.host)]
        };
        items.push(item);
      }

      if (conns.length === 0) {
        const hint = new vscode.TreeItem(
          '暂无连接，点击上方按钮添加',
          vscode.TreeItemCollapsibleState.None
        );
        hint.contextValue = 'hint';
        items.push(hint);
      }
      return items;
    } catch (e: any) {
      const msg = e?.message || String(e);
      const err = new vscode.TreeItem(
        '服务未启动，点击刷新',
        vscode.TreeItemCollapsibleState.None
      );
      err.iconPath = new vscode.ThemeIcon('error');
      err.contextValue = 'error';
      err.command = { command: 'aicmd.refresh', title: '刷新' };
      // 直接把原因显示出来，避免必须悬停才能看到
      err.description = msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
      err.tooltip =
        '启动 AICmd 服务失败：' +
        msg +
        '\n详情请查看「输出」面板中的 [aicmd-server] 日志。';
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
