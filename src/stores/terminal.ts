import { defineStore } from 'pinia';
import { ConnectionService } from '@/service/connection';
import type { ConnectionEntity, TerminalTab } from '@/typings/connection';
import { toast } from '@/utils/toast';
import { modal } from '@/utils/modal';
import * as terminalService from '@/service/terminal';
import i18n from '@/utils/i18n';

const t = (key: string) => i18n.global.t(key);

export type TerminalState = {
  connections: ConnectionEntity[];
  tabs: TerminalTab[];
  activeTabId: string | null;
  loading: boolean;
  sidebarCollapsed: boolean;
};

const connectionService = new ConnectionService();

function getDefaultState(): TerminalState {
  return {
    connections: [],
    tabs: [],
    activeTabId: null,
    loading: false,
    sidebarCollapsed: false,
  };
}

export const useTerminalStore = defineStore('terminal', {
  state: (): TerminalState => getDefaultState(),

  getters: {
    activeTab: (state) => state.tabs.find(t => t.id === state.activeTabId) || null,
    tabCount: (state) => state.tabs.length,
    connectionCount: (state) => state.connections.length,
  },

  actions: {
    // 加载连接列表
    async loadConnections() {
      this.loading = true;
      try {
        const result = await connectionService.getAllConnections();
        if (result?.ret === 0) {
          this.connections = result.data || [];
        } else if (Array.isArray(result)) {
          this.connections = result;
        }
      } catch (e: any) {
        toast.error(e.message || t('sidebar.loadFailed'));
      } finally {
        this.loading = false;
      }
    },

    // 添加连接
    async addConnection(connection: ConnectionEntity) {
      return connectionService.addConnection(connection);
    },

    // 更新连接
    async updateConnection(id: string, updates: Partial<ConnectionEntity>) {
      return connectionService.updateConnection(id, updates);
    },

    // 删除连接
    async deleteConnection(id: string) {
      const confirmed = await modal.confirm(t('sidebar.deleteConfirm'));
      if (!confirmed) return false;
      try {
        await connectionService.deleteConnection(id);
        this.connections = this.connections.filter(c => c.id !== id);
        // 关闭关联的 tabs
        this.tabs = this.tabs.filter(t => t.connectionId !== id);
        toast.success(t('sidebar.deleted'));
        return true;
      } catch (e: any) {
        toast.error(e.message || t('sidebar.deleteFailed'));
        return false;
      }
    },

    // 打开新终端 Tab
    openTab(connection: ConnectionEntity, customName?: string) {
      const tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const tab: TerminalTab = {
        id: tabId,
        connectionId: connection.id || '',
        connectionName: customName || connection.name,
        status: 'connecting',
        cols: connection.terminal?.cols || 80,
        rows: connection.terminal?.rows || 24,
      };
      this.tabs.push(tab);
      this.activeTabId = tabId;
      return tab;
    },

    // 关闭 Tab（同步通知 server 端删除 metadata）
    async closeTab(tabId: string) {
      const tab = this.tabs.find(t => t.id === tabId);
      if (tab?.sessionId) {
        try {
          await terminalService.deleteSession(tab.sessionId);
        } catch (e) {
          console.warn('删除 session 失败:', e);
        }
      }
      const index = this.tabs.findIndex(t => t.id === tabId);
      if (index === -1) return;
      this.tabs.splice(index, 1);
      if (this.activeTabId === tabId) {
        this.activeTabId = this.tabs.length > 0 ? this.tabs[Math.min(index, this.tabs.length - 1)]?.id || null : null;
      }
    },

    // 更新 Tab 状态
    updateTabStatus(tabId: string, status: TerminalTab['status'], sessionId?: string) {
      const tab = this.tabs.find(t => t.id === tabId);
      if (tab) {
        tab.status = status;
        if (sessionId) tab.sessionId = sessionId;
      }
    },

    // 切换活动 Tab
    switchTab(tabId: string) {
      this.activeTabId = tabId;
      this.saveTabs();
    },

    // 切换侧边栏
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },

    // 克隆 Tab（复制连接）
    async cloneTab(tabId: string) {
      const tab = this.tabs.find(t => t.id === tabId);
      if (!tab) return;

      if (tab.connectionId === '__local__') {
        // 本地 Shell，直接创建新的
        this.openLocalShell(tab.connectionName);
      } else {
        // SSH 连接，查找对应的连接配置
        const conn = this.connections.find(c => c.id === tab.connectionId);
        if (conn) {
          this.openTab(conn, `${tab.connectionName} - ${t('common.copySuffix')}`);
        }
      }
    },

    // 关闭其他 Tab
    async closeOtherTabs(excludeTabId: string) {
      const tabsToClose = this.tabs.filter(t => t.id !== excludeTabId);
      for (const tab of tabsToClose) {
        if (tab.sessionId) {
          try {
            await terminalService.deleteSession(tab.sessionId);
          } catch (e) {
            console.warn('删除 session 失败:', e);
          }
        }
      }
      this.tabs = this.tabs.filter(t => t.id === excludeTabId);
      this.activeTabId = excludeTabId;
    },

    // 关闭所有 Tab
    async closeAllTabs() {
      for (const tab of this.tabs) {
        if (tab.sessionId) {
          try {
            await terminalService.deleteSession(tab.sessionId);
          } catch (e) {
            console.warn('删除 session 失败:', e);
          }
        }
      }
      this.tabs = [];
      this.activeTabId = null;
    },

    // 重命名 Tab（同步到 server 端）
    async renameTab(tabId: string, newName: string) {
      const tab = this.tabs.find(t => t.id === tabId);
      if (!tab) return;
      tab.connectionName = newName;
      // 同步到 server 端
      if (tab.sessionId) {
        try {
          await terminalService.renameSession(tab.sessionId, newName);
        } catch (e) {
          console.warn('重命名 session 失败:', e);
        }
      }
    },
    // 保存 TAB 状态到 server（不再使用 localStorage）
    saveTabs() {
      // Session 信息由 server 端管理，浏览器端不再持久化
    },

    // 从 server 恢复 TAB 状态（不再从 localStorage 读取）
    async restoreTabs(): Promise<void> {
      // Session 信息由 server 端管理，浏览器端不再持久化
    },

    // 创建本地 Shell TAB（不保存到连接列表，每次新建）
    openLocalShell(customName?: string) {
      const LOCAL_SHELL_ID = '__local__';
      // 计算本地 Shell Tab 序号，用于显示名称
      const localCount = this.tabs.filter(t => t.connectionId === LOCAL_SHELL_ID).length;
      const tabName = customName || (localCount === 0 ? t('app.localShell') : `${t('app.localShell')} ${localCount + 1}`);

      const tabId = `tab-local-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const tab: TerminalTab = {
        id: tabId,
        connectionId: LOCAL_SHELL_ID,
        connectionName: tabName,
        status: 'connecting',
        cols: 80,
        rows: 24,
      };
      this.tabs.push(tab);
      this.activeTabId = tabId;
      return tab;
    },

    // 获取本地 Shell 连接信息（虚拟连接，不保存）
    getLocalShellConnection(): ConnectionEntity {
      return {
        id: '__local__',
        name: t('app.localShell'),
        type: 'local',
        host: '',
        username: '',
        shell: '',
        terminal: {
          cols: 80, rows: 24, fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: 'dark',
          cursorStyle: 'block' as 'block' | 'underline' | 'bar',
        },
      };
    },
  },
});
