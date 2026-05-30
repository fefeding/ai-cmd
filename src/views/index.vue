<template>
  <div class="fterm-layout">
    <!-- 侧边栏 -->
    <TerminalSidebar
      :connections="store.connections"
      :loading="store.loading"
      :collapsed="store.sidebarCollapsed"
      @connect="handleConnect"
      @add-connection="openEditor()"
      @edit-connection="openEditor"
      @delete-connection="handleDelete"
      @refresh="handleRefresh"
      @toggle-sidebar="store.toggleSidebar()"
      @open-ai-settings="openAISettings"
    />

    <!-- 主区域 -->
    <div class="main-area">
      <!-- 侧边栏展开按钮（收起时显示） -->
      <button v-if="store.sidebarCollapsed" class="sidebar-toggle-btn" @click="store.toggleSidebar()" :title="t('sidebar.expand')">
        <i class="bi bi-chevron-right"></i>
      </button>
      <!-- Tab 栏 -->
      <div v-if="store.tabs.length > 0" class="tab-bar" style="height: var(--tab-bar-height);" @contextmenu.prevent>
        <div
          v-for="tab in store.tabs"
          :key="tab.id"
          class="tab-item"
          :class="{ active: tab.id === store.activeTabId }"
          @click="store.switchTab(tab.id)"
          @contextmenu.prevent="showContextMenu($event, tab)"
        >
          <span class="status-dot" :class="tab.status"></span>
          <template v-if="editingTabId === tab.id">
            <input
              ref="tabNameInput"
              v-model="editingTabName"
              class="tab-name-input"
              @blur="finishRename(tab.id)"
              @keydown.enter="finishRename(tab.id)"
              @click.stop
            />
          </template>
          <template v-else>
            <span class="text-truncate flex-grow-1" @dblclick.stop="startRename(tab)">
              {{ tab.connectionName }}
            </span>
          </template>
          <span class="tab-close" @click.stop="handleCloseTab(tab.id)">
            <i class="bi bi-x"></i>
          </span>
        </div>
        <button class="tab-add-btn" @click="handleOpenLocalShell" :title="t('app.newLocalShell')">
          <i class="bi bi-plus"></i>
        </button>
      </div>

      <!-- 终端内容区 -->
      <div class="terminal-area">
        <template v-if="store.tabs.length > 0">
          <div
            v-for="tab in store.tabs"
            :key="tab.id"
            class="terminal-pane"
            :class="{ active: tab.id === store.activeTabId }"
          >
            <TerminalTabComp
              v-if="tab.id === store.activeTabId || renderedTabs.has(tab.id)"
              :ref="el => setTermRef(tab.id, el)"
              :tabId="tab.id"
              :connection="getConnection(tab.connectionId)"
              :active="tab.id === store.activeTabId"
              @status-change="(s, sid) => handleStatusChange(tab.id, s, sid)"
              @zmodem-detected="(info: any) => handleZmodemDetected(tab.id, info)"
            />
          </div>
        </template>

        <!-- 空状态 -->
        <div v-else class="empty-state">
          <i class="bi bi-terminal"></i>
          <div style="font-size: 18px;">{{ t('app.emptyTitle') }}</div>
          <div style="font-size: 13px;">{{ t('app.emptyDesc') }}</div>
          <div class="d-flex gap-2 mt-3 justify-content-center">
            <button class="btn-empty-action" @click="openEditor()">
              <i class="bi bi-plus"></i>{{ t('app.addConnection') }}
            </button>
            <button class="btn-empty-action btn-empty-success" @click="handleOpenLocalShell()">
              <i class="bi bi-terminal"></i>{{ t('app.openLocalShell') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 连接编辑器 -->
    <ConnectionEditor ref="connectionEditorRef" @saved="handleEditorSaved" />

    <!-- AI 设置 -->
    <AISettings ref="aiSettingsRef" />

    <!-- 文件传输对话框 -->
    <FileTransfer ref="fileTransferRef" />

    <!-- Tab 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="tab-context-menu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
      @click.stop
    >
      <div class="tab-context-menu-item" @click="handleCloneTab">
        <i class="bi bi-copy"></i>{{ t('tab.clone') }}
      </div>
      <div class="tab-context-menu-item" @click="handleRenameFromContext">
        <i class="bi bi-pencil"></i>{{ t('tab.rename') }}
      </div>
      <div class="tab-context-menu-divider"></div>
      <div class="tab-context-menu-item" @click="handleCloseFromContext">
        <i class="bi bi-x"></i>{{ t('tab.close') }}
      </div>
      <div class="tab-context-menu-item" @click="handleCloseOtherFromContext">
        <i class="bi bi-x-circle"></i>{{ t('tab.closeOther') }}
      </div>
      <div class="tab-context-menu-item" @click="handleCloseAllFromContext">
        <i class="bi bi-x-square"></i>{{ t('tab.closeAll') }}
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTerminalStore } from '@/stores/terminal';
import * as terminalService from '@/service/terminal';
import TerminalSidebar from '@/components/terminal-sidebar.vue';
import TerminalTabComp from '@/components/terminal-tab.vue';
import ConnectionEditor from '@/components/connection-editor/index.vue';
import FileTransfer from '@/components/file-transfer.vue';
import AISettings from '@/components/ai-settings/index.vue';
import type { ConnectionEntity, TerminalTab as TerminalTabType } from '@/typings/connection';

const { t } = useI18n();

const store = useTerminalStore();
const connectionEditorRef = ref<InstanceType<typeof ConnectionEditor>>();
const fileTransferRef = ref<InstanceType<typeof FileTransfer>>();
const aiSettingsRef = ref<InstanceType<typeof AISettings>>();
const showZmodemBtn = ref(false);
const activeZmodemTabId = ref<string | null>(null);

// Tab 重命名状态
const editingTabId = ref<string | null>(null);
const editingTabName = ref('');
const tabNameInput = ref<HTMLInputElement | null>(null);

// 右键菜单状态
const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuTabId = ref<string | null>(null);

// 已渲染的 tab 集合（保持非活跃 tab 的终端实例不被销毁）
const renderedTabs = new Set<string>();

// 终端组件引用映射
const termRefs = new Map<string, InstanceType<typeof TerminalTabComp>>();

function setTermRef(tabId: string, el: any) {
  if (el) {
    termRefs.set(tabId, el);
    renderedTabs.add(tabId);
  } else {
    termRefs.delete(tabId);
    renderedTabs.delete(tabId);
  }
}

// 获取连接信息
function getConnection(connectionId: string): ConnectionEntity {
  if (connectionId === '__local__') {
    return store.getLocalShellConnection();
  }
  return store.connections.find(c => c.id === connectionId) || { name: '', host: '', username: '' };
}

// 连接操作
function handleConnect(conn: ConnectionEntity) {
  store.openTab(conn);
}

// 打开本地 Shell
function handleOpenLocalShell() {
  store.openLocalShell();
}

// 开始重命名 Tab
function startRename(tab: typeof store.tabs[0]) {
  editingTabId.value = tab.id;
  editingTabName.value = tab.connectionName;
  nextTick(() => {
    tabNameInput.value?.focus();
    tabNameInput.value?.select();
  });
}

// 完成重命名
function finishRename(tabId: string) {
  const newName = editingTabName.value.trim();
  if (newName) {
    store.renameTab(tabId, newName);
  }
  editingTabId.value = null;
}

// 打开编辑器
function openEditor(conn?: ConnectionEntity) {
  connectionEditorRef.value?.open(conn);
}

// 编辑器保存回调
function handleEditorSaved() {
  store.loadConnections();
}

// 删除连接
async function handleDelete(conn: ConnectionEntity) {
  if (conn.id) {
    await store.deleteConnection(conn.id);
  }
}

// 刷新连接列表
function handleRefresh() {
  store.loadConnections();
}

// 关闭 Tab（异步）
async function handleCloseTab(tabId: string) {
  await store.closeTab(tabId);
  termRefs.delete(tabId);
  renderedTabs.delete(tabId);
}

// 显示右键菜单
function showContextMenu(event: MouseEvent, tab: typeof store.tabs[0]) {
  event.preventDefault();
  contextMenuTabId.value = tab.id;
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  contextMenuVisible.value = true;
}

// 隐藏右键菜单
function hideContextMenu() {
  contextMenuVisible.value = false;
  contextMenuTabId.value = null;
}

// 复制连接（克隆 Tab）
async function handleCloneTab() {
  const tabId = contextMenuTabId.value;
  if (tabId) {
    await store.cloneTab(tabId);
  }
  hideContextMenu();
}

// 从右键菜单重命名
function handleRenameFromContext() {
  const tabId = contextMenuTabId.value;
  if (tabId) {
    const tab = store.tabs.find(t => t.id === tabId);
    if (tab) {
      startRename(tab);
    }
  }
  hideContextMenu();
}

// 从右键菜单关闭当前标签
async function handleCloseFromContext() {
  const tabId = contextMenuTabId.value;
  if (tabId) {
    await handleCloseTab(tabId);
  }
  hideContextMenu();
}

// 从右键菜单关闭其他标签
async function handleCloseOtherFromContext() {
  const tabId = contextMenuTabId.value;
  if (tabId) {
    // 先关闭当前选中的 tab 之外的所有 tab
    await store.closeOtherTabs(tabId);
    // 清理已删除的 termRefs
    const keepIds = new Set([tabId]);
    for (const [id] of termRefs) {
      if (!keepIds.has(id)) {
        termRefs.delete(id);
        renderedTabs.delete(id);
      }
    }
  }
  hideContextMenu();
}

// 从右键菜单关闭所有标签
async function handleCloseAllFromContext() {
  await store.closeAllTabs();
  termRefs.clear();
  renderedTabs.clear();
  hideContextMenu();
}

// Tab 状态变化
function handleStatusChange(tabId: string, status: TerminalTabType['status'], sessionId?: string) {
  store.updateTabStatus(tabId, status, sessionId);
}

// ZMODEM 检测 - 自动弹出文件传输对话框
function handleZmodemDetected(tabId: string, info: any) {
  console.log('[ZMODEM] Auto-detected in tab:', tabId, 'role:', info?.role);
  activeZmodemTabId.value = tabId;
  const termRef = termRefs.get(tabId);
  if (termRef && fileTransferRef.value) {
    // 自动弹出文件传输对话框，传入 session 信息
    fileTransferRef.value.show(tabId, termRef, info);
  }
}

// 文件传输
function handleFileTransfer() {
  const tabId = activeZmodemTabId.value || store.activeTabId;
  if (!tabId) return;
  const termRef = termRefs.get(tabId);
  if (termRef) {
    fileTransferRef.value?.show(tabId, termRef);
  }
}

// 打开 AI 设置
function openAISettings() {
  aiSettingsRef.value?.open();
}

// 快捷键
function handleKeydown(e: KeyboardEvent) {
  // Ctrl/Cmd + T: 新建连接（如果无连接可选）
  if ((e.ctrlKey || e.metaKey) && e.key === 't') {
    // 不拦截浏览器默认行为
  }
  // Ctrl/Cmd + W: 关闭当前 tab
  if ((e.ctrlKey || e.metaKey) && e.key === 'w' && store.activeTabId) {
    e.preventDefault();
    handleCloseTab(store.activeTabId);
  }
  // Ctrl/Cmd + 数字: 切换 tab
  if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    const idx = parseInt(e.key) - 1;
    if (store.tabs[idx]) {
      store.switchTab(store.tabs[idx].id);
    }
  }
  // Ctrl/Cmd + B: 切换侧边栏
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault();
    store.toggleSidebar();
  }
}

onMounted(async () => {
  await store.loadConnections();
  await restoreOrCreateTabs();
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('click', hideContextMenu);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('click', hideContextMenu);
});

/**
 * 从 server 端恢复 TAB 信息
 */
async function restoreOrCreateTabs() {
  try {
    const sessionList = await terminalService.getSessions() || [];

    if (sessionList.length > 0) {
      // 删除 server 端旧的 metadata，然后重建新的 tab
      for (const session of sessionList) {
        try {
          await terminalService.deleteSession(session.sessionId);
        } catch (e) {
          console.warn('删除旧 session 失败:', e);
        }
      }

      // 重建 tab
      for (const session of sessionList) {
        if (session.connectionId === '__local__') {
          store.openLocalShell(session.name);
        } else {
          const conn = store.connections.find(c => c.id === session.connectionId);
          if (conn) {
            store.openTab(conn, session.name);
          }
        }
      }

      // 如果有恢复的 TAB，切换到第一个
      if (store.tabs.length > 0) {
        store.switchTab(store.tabs[0].id);
        return;
      }
    }
  } catch (e) {
    console.warn('从 server 恢复 session 失败:', e);
  }

  // 没有可恢复的 TAB，自动创建本地 Shell
  store.openLocalShell();
}
</script>

<style scoped>
.fterm-layout {
  display: flex;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-dark);
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
}

.sidebar-toggle-btn {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  z-index: 100;
  width: 20px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(49, 50, 68, 0.9);
  border: 1px solid var(--border-color);
  border-left: none;
  border-radius: 0 6px 6px 0;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s ease;
  padding: 0;
}

.sidebar-toggle-btn:hover {
  background-color: rgba(69, 71, 90, 0.95);
  color: var(--accent);
  width: 24px;
}

.terminal-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.terminal-pane {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: none;
}

.terminal-pane.active {
  display: block;
}

.tab-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: auto 4px auto 2px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  flex-shrink: 0;
}

.tab-add-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.tab-name-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--accent);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  padding: 0;
  margin: 0;
  width: 100%;
  min-width: 0;
}

/* Tab 右键菜单 */
.tab-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  background-color: #2b2b3d;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  font-size: 13px;
  user-select: none;
}

.tab-context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s;
  white-space: nowrap;
}

.tab-context-menu-item:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.tab-context-menu-item i {
  font-size: 14px;
  width: 16px;
  text-align: center;
}

.tab-context-menu-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 4px 12px;
}

/* 空状态按钮 */
.btn-empty-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-empty-action:hover {
  background-color: rgba(137, 180, 250, 0.1);
  border-color: var(--accent);
  color: var(--accent);
}

.btn-empty-action i {
  font-size: 11px;
  opacity: 0.8;
}

.btn-empty-success:hover {
  background-color: rgba(166, 227, 161, 0.1);
  border-color: #a6e3a1;
  color: #a6e3a1;
}
</style>
