<template>
  <div class="sidebar d-flex flex-column" :style="{ width: collapsed ? '0px' : 'var(--sidebar-width)' }">
    <!-- 顶部工具栏 -->
    <div class="d-flex align-items-center justify-content-between p-2 border-bottom" style="border-color: var(--border-color) !important;">
      <span class="fw-bold" style="color: var(--accent);">
        <i class="bi bi-terminal me-1"></i>fterm
      </span>
      <div class="d-flex gap-1">
        <button class="btn-toolbar" @click="$emit('add-connection')" :title="t('app.addConnection')">
          <i class="bi bi-plus-lg"></i>
        </button>
        <button class="btn-toolbar" @click="$emit('refresh')" :title="t('common.refresh')">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
        <button class="btn-toolbar" @click="$emit('toggle-sidebar')" :title="t('sidebar.collapse')">
          <i class="bi bi-chevron-left"></i>
        </button>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="p-2">
      <input
        type="text"
        class="form-control form-control-sm"
        :placeholder="t('sidebar.searchPlaceholder')"
        v-model="searchQuery"
        style="background: #313244; border-color: #45475a; color: var(--text-primary);"
      >
    </div>

    <!-- 连接列表 -->
    <div class="flex-grow-1 overflow-auto">
      <div v-if="loading" class="text-center p-4" style="color: var(--text-secondary);">
        <div class="spinner-border spinner-border-sm me-2"></div>{{ t('common.loading') }}
      </div>
      <div v-else-if="filteredConnections.length === 0" class="text-center p-4" style="color: var(--text-secondary);">
        <i class="bi bi-inbox" style="font-size: 24px;"></i>
        <div class="mt-2">{{ t('sidebar.noConnections') }}</div>
        <button class="btn btn-sm btn-outline-primary mt-2" @click="$emit('add-connection')">
          <i class="bi bi-plus me-1"></i>{{ t('sidebar.addConnection') }}
        </button>
      </div>
      <div v-else>
        <div
          v-for="conn in filteredConnections"
          :key="conn.id"
          class="connection-item"
          @dblclick="$emit('connect', conn)"
          @contextmenu.prevent="showContextMenu($event, conn)"
        >
          <i :class="conn.type === 'local' ? 'bi bi-terminal' : 'bi bi-hdd-network'" style="color: var(--accent);"></i>
          <div class="flex-grow-1 overflow-hidden">
            <div class="text-truncate" style="font-size: 13px;">{{ conn.name }}</div>
            <div class="text-truncate" style="font-size: 11px; color: var(--text-secondary);">
              {{ conn.type === 'local' ? t('app.localShell') : `${conn.username}@${conn.host}:${conn.port}` }}
            </div>
          </div>
          <div class="d-flex gap-1" @click.stop>
            <button class="btn-conn" @click="$emit('connect', conn)" :title="t('sidebar.connect')">
              <i class="bi bi-play-fill"></i>
            </button>
            <button class="btn-conn" @click="$emit('edit-connection', conn)" :title="t('common.edit')">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn-conn btn-conn-danger" @click="$emit('delete-connection', conn)" :title="t('common.delete')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部信息 -->
    <div class="p-2 text-center d-flex align-items-center justify-content-between" style="font-size: 11px; color: var(--text-secondary); border-top: 1px solid var(--border-color);">
      <span>{{ connections.length }} {{ t('sidebar.connectionCount') }}</span>
      <div class="d-flex gap-1 align-items-center">
        <button class="btn-ai-settings" @click="$emit('open-ai-settings')" :title="t('ai.settings')">
          <i class="bi bi-robot"></i>
        </button>
        <button class="btn-lang-switch" @click="toggleLocale" :title="currentLocale === 'zh-CN' ? 'Switch to English' : '切换到中文'">
          {{ currentLocale === 'zh-CN' ? 'EN' : '中' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ConnectionEntity } from '@/typings/connection';
import { setLocale, getLocale } from '@/utils/i18n';

const { t } = useI18n();

const currentLocale = ref(getLocale());

function toggleLocale() {
  const next = currentLocale.value === 'zh-CN' ? 'en-US' : 'zh-CN';
  currentLocale.value = next;
  setLocale(next);
}

const props = defineProps<{
  connections: ConnectionEntity[];
  loading: boolean;
  collapsed: boolean;
}>();

defineEmits<{
  (e: 'connect', conn: ConnectionEntity): void;
  (e: 'add-connection'): void;
  (e: 'edit-connection', conn: ConnectionEntity): void;
  (e: 'delete-connection', conn: ConnectionEntity): void;
  (e: 'refresh'): void;
  (e: 'toggle-sidebar'): void;
  (e: 'open-ai-settings'): void;
}>();

const searchQuery = ref('');

const filteredConnections = computed(() => {
  if (!searchQuery.value) return props.connections;
  const q = searchQuery.value.toLowerCase();
  return props.connections.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.host.toLowerCase().includes(q) ||
    c.username.toLowerCase().includes(q)
  );
});

function showContextMenu(_event: MouseEvent, _conn: ConnectionEntity) {
  // 可扩展右键菜单
}
</script>

<style scoped>
.btn-toolbar {
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}
.btn-toolbar:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.btn-conn {
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}
.connection-item:hover .btn-conn {
  opacity: 1;
}
.btn-conn:hover {
  color: var(--accent);
}
.btn-conn-danger:hover {
  color: var(--danger);
}

.btn-lang-switch {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 1px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  transition: all 0.15s;
}

.btn-lang-switch:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-ai-settings {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  transition: all 0.15s;
  display: flex;
  align-items: center;
}

.btn-ai-settings:hover {
  border-color: var(--accent);
  color: var(--accent);
  background-color: rgba(137, 180, 250, 0.1);
}
</style>
