import * as vscode from 'vscode';
import { ServerLauncher } from './server-launcher';
import { t } from './i18n';

interface SessionInfo {
  sessionId: string;
  connectionId: string;
  type: 'ssh' | 'local';
  name: string;
  createdAt: string | number | Date;
}

interface ConnectionInfo {
  id: string;
  name?: string;
  host?: string;
  username?: string;
  type?: string;
}

export interface ActivePanelInfo {
  panel: vscode.WebviewPanel;
  title: string;
}

/** 状态栏连接指示器：显示当前终端 / 会话数，点击管理会话。 */
export class AicmdStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    'aicmd.connection',
    vscode.StatusBarAlignment.Left,
    50
  );
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly launcher: ServerLauncher,
    private readonly startPort: number,
    private readonly findPanel: (connectionId: string) => vscode.WebviewPanel | undefined,
    private readonly getActive: () => ActivePanelInfo | undefined
  ) {
    this.item.command = 'aicmd.showSessions';
    this.item.text = '$(remote) AICmd';
    this.item.tooltip = t('点击管理 AICmd 会话', 'Click to manage AICmd sessions');
    this.item.show();
    this.timer = setInterval(() => this.refresh(), 5000);
  }

  refresh(): void {
    if (!this.launcher.isStarted) {
      this.item.text = '$(remote) AICmd';
      this.item.tooltip = t('点击管理 AICmd 会话', 'Click to manage AICmd sessions');
      return;
    }
    this.launcher
      .getSessions()
      .then((sessions) => {
        const list: SessionInfo[] = Array.isArray(sessions) ? sessions : [];
        const active = this.getActive();
        if (active) {
          this.item.text = `$(terminal) ${active.title}`;
          this.item.tooltip = t('当前终端：', 'Active terminal: ') + active.title + '\n' +
            t('点击切换 / 关闭会话', 'Click to switch or close sessions');
        } else {
          const ssh = list.filter((s) => s.type === 'ssh' || s.type === 'local').length;
          this.item.text = `$(remote) AICmd${ssh ? ` ${ssh}` : ''}`;
          this.item.tooltip = `${t('活动会话', 'Active sessions')}: ${ssh}\n` +
            t('点击管理', 'Click to manage');
        }
      })
      .catch(() => {
        this.item.text = '$(remote) AICmd';
      });
  }

  private async loadData(): Promise<{ sessions: SessionInfo[]; connections: ConnectionInfo[] }> {
    const [sessions, connections] = await Promise.all([
      this.launcher.getSessions(),
      this.launcher.api('/api/connection/getConnections', {}) as Promise<any>
    ]);
    const arr = (v: any) => (Array.isArray(v) ? v : v?.data ?? []);
    return { sessions: arr(sessions), connections: arr(connections) };
  }

  async showSessions(): Promise<void> {
    try {
      await this.launcher.ensureStarted(this.startPort);
      const { sessions, connections } = await this.loadData();
      const byId = new Map(connections.map((c) => [String(c.id), c]));
      const sshSessions = sessions.filter((s) => s.type === 'ssh' || s.type === 'local');

      if (!sshSessions.length) {
        const open = t('打开连接', 'Open Connection');
        const answer = await vscode.window.showInformationMessage(
          t('当前没有活动的 SSH 会话。', 'No active SSH sessions.'),
          open
        );
        if (answer === open) await vscode.commands.executeCommand('aicmd.openTerminal');
        return;
      }

      type SessionPick = vscode.QuickPickItem & {
        session?: SessionInfo;
        closeAll?: boolean;
      };
      const items: SessionPick[] = sshSessions
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((s) => {
          const c = byId.get(String(s.connectionId));
          const detail = s.type === 'local'
            ? t('本地 Shell', 'Local Shell')
            : [c?.username, c?.host].filter(Boolean).join('@') || String(s.connectionId);
          return {
            label: s.name || c?.name || String(s.connectionId),
            description: detail,
            session: s
          };
        });
      items.push({
        label: `$(trash) ${t('关闭所有会话', 'Close All Sessions')}`,
        description: t(`共 ${sshSessions.length} 个会话`, `${sshSessions.length} session(s)`),
        closeAll: true
      });
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: t('选择 AICmd 会话', 'Select an AICmd session'),
        matchOnDescription: true
      });
      if (!picked) return;
      if (picked.closeAll) {
        await this.closeAllSessions(sshSessions);
        return;
      }
      const session = picked.session;
      if (!session) return;

      const actions: Array<{ label: string; action: string }> = [
        { label: `$(target) ${t('聚焦终端', 'Focus terminal')}`, action: 'focus' },
        { label: `$(file-symlink-file) ${t('浏览远程文件', 'Browse remote files')}`, action: 'browse' },
        { label: `$(edit) ${t('重命名会话', 'Rename session')}`, action: 'rename' },
        { label: `$(trash) ${t('关闭会话', 'Close session')}`, action: 'close' }
      ];
      const action = await vscode.window.showQuickPick(actions, {
        placeHolder: t('对会话执行操作', 'Action for this session')
      });
      if (!action) return;

      const panel = this.findPanel(String(session.connectionId));
      if (action.action === 'focus') {
        if (panel) panel.reveal();
        else await vscode.commands.executeCommand('aicmd.openTerminal', session.connectionId);
      } else if (action.action === 'browse') {
        await vscode.commands.executeCommand('aicmd.browseRemote', session.connectionId);
      } else if (action.action === 'rename') {
        await this.renameSession(session);
      } else {
        const yes = t('关闭', 'Close');
        const answer = await vscode.window.showWarningMessage(
          t('确定关闭该会话吗？未保存的终端状态将丢失。', 'Close this session? Unsaved terminal state will be lost.'),
          { modal: true },
          yes
        );
        if (answer !== yes) return;
        await this.launcher.api('/api/terminal/closeSession', {
          sessionId: session.sessionId
        });
        panel?.dispose();
        this.refresh();
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(
        t('会话操作失败：', 'Session operation failed: ') + (e?.message || String(e))
      );
    }
  }

  private async renameSession(session: SessionInfo): Promise<void> {
    const name = await vscode.window.showInputBox({
      title: t('重命名会话', 'Rename Session'),
      prompt: t('输入新的会话名称', 'Enter a new session name'),
      value: session.name || '',
      validateInput: (value) =>
        value.trim() ? undefined : t('名称不能为空', 'Name cannot be empty')
    });
    if (name === undefined) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === session.name) return;
    await this.launcher.renameSession(session.sessionId, trimmed);
    this.refresh();
  }

  private async closeAllSessions(sessions: SessionInfo[]): Promise<void> {
    const yes = t('全部关闭', 'Close All');
    const answer = await vscode.window.showWarningMessage(
      t(
        `确定关闭全部 ${sessions.length} 个会话吗？未保存的终端状态将丢失。`,
        `Close all ${sessions.length} sessions? Unsaved terminal state will be lost.`
      ),
      { modal: true },
      yes
    );
    if (answer !== yes) return;
    await this.launcher.closeAllSessions(sessions.map((s) => s.sessionId));
    // 终端页断开后会自动重连并重建会话，先关掉对应面板
    for (const session of sessions) {
      this.findPanel(String(session.connectionId))?.dispose();
    }
    this.refresh();
    vscode.window.showInformationMessage(
      t(`已关闭 ${sessions.length} 个会话`, `Closed ${sessions.length} session(s)`)
    );
  }

  dispose(): void {
    clearInterval(this.timer);
    this.item.dispose();
  }
}
