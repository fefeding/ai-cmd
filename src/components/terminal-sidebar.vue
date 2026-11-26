<template>
  <div class="sidebar d-flex flex-column" :style="{ width: collapsed ? '0px' : 'var(--sidebar-width)' }">
    <!-- 顶部工具栏 -->
    <div class="d-flex align-items-center justify-content-between p-2 border-bottom" style="border-color: var(--border-color) !important;">
      <span class="fw-bold" style="color: var(--accent);">
        <i class="bi bi-terminal me-1"></i>aicmd
      </span>
      <div class="d-flex gap-1">
        <button class="btn-toolbar" @click="$emit('export-connections')" :title="t('sidebar.export')">
          <i class="bi bi-download"></i>
        </button>
        <button class="btn-toolbar" @click="$emit('import-connections')" :title="t('sidebar.import')">
          <i class="bi bi-upload"></i>
        </button>
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

    <!-- 搜索框 + 分组方式切换 -->
    <div class="p-2 d-flex gap-1 align-items-center">
      <input
        type="text"
        class="form-control form-control-sm"
        :placeholder="t('sidebar.searchPlaceholder')"
        v-model="searchQuery"
        style="background: var(--bg-input); border-color: var(--border-strong); color: var(--text-primary);"
      >
      <button class="btn-toolbar flex-shrink-0" @click="toggleGroupMode" :title="groupMode === 'group' ? t('sidebar.groupByTag') : t('sidebar.groupByGroup')">
        <i :class="groupMode === 'group' ? 'bi bi-collection' : 'bi bi-tags'"></i>
      </button>
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
        <div v-for="group in groupedConnections" :key="group.name" class="connection-group">
          <button class="group-header" @click="toggleGroup(group.name)">
            <i :class="isGroupCollapsed(group.name) ? 'bi bi-chevron-right' : 'bi bi-chevron-down'"></i>
            <i :class="group.name === ungroupedName ? 'bi bi-list' : (groupMode === 'tag' ? 'bi bi-tag' : 'bi bi-folder2-open')" class="ms-1 me-1"></i>
            <span class="text-truncate flex-grow-1">{{ group.name }}</span>
            <span class="group-count">{{ group.connections.length }}</span>
          </button>
          <template v-if="!isGroupCollapsed(group.name)">
            <div
              v-for="conn in group.connections"
              :key="conn.id"
              class="connection-item"
              @dblclick="$emit('connect', conn)"
              @contextmenu.prevent="showContextMenu($event, conn)"
            >
              <i :class="conn.type === 'local' ? 'bi bi-terminal' : conn.type === 'rdp' ? 'bi bi-display' : 'bi bi-hdd-network'" style="color: var(--accent);"></i>
              <div class="flex-grow-1 overflow-hidden">
                <div class="text-truncate" style="font-size: 13px;">{{ conn.name }}</div>
                <div class="text-truncate" style="font-size: 11px; color: var(--text-secondary);">
                  {{ conn.type === 'local' ? t('app.localShell') : `${conn.username || ''}${conn.username ? '@' : ''}${conn.host}${conn.port ? ':' + conn.port : ''}` }}
                </div>
                <div v-if="conn.tags?.length" class="tag-row">
                  <span v-for="tag in conn.tags" :key="tag" class="tag-chip">#{{ tag }}</span>
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
          </template>
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
        <button class="btn-ai-settings" @click="$emit('open-batch')" :title="t('batch.title')">
          <i class="bi bi-hdd-rack"></i>
        </button>
        <button class="btn-ai-settings" @click="$emit('open-tunnels')" :title="t('tunnel.title')">
          <i class="bi bi-arrow-left-right"></i>
        </button>
        <button class="btn-ai-settings" @click="$emit('open-keys')" :title="t('sshKey.title')">
          <i class="bi bi-key"></i>
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
  (e: 'open-batch'): void;
  (e: 'open-tunnels'): void;
  (e: 'open-keys'): void;
  (e: 'export-connections'): void;
  (e: 'import-connections'): void;
}>();

const searchQuery = ref('');
const collapsedGroups = ref<Record<string, boolean>>({});
const groupMode = ref<'group' | 'tag'>('group');
const ungroupedName = computed(() => groupMode.value === 'tag'
  ? t('sidebar.untagged')
  : t('sidebar.ungrouped'));

function toggleGroupMode() {
  groupMode.value = groupMode.value === 'group' ? 'tag' : 'group';
}

const filteredConnections = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.connections;
  return props.connections.filter(c =>
    [c.name, c.host, c.username, c.group, ...(c.tags || [])]
      .some(value => !!value && String(value).toLowerCase().includes(q))
  );
});

const groupedConnections = computed(() => {
  const map = new Map<string, ConnectionEntity[]>();
  for (const conn of filteredConnections.value) {
    const names = groupMode.value === 'tag'
      ? (conn.tags?.length ? conn.tags : [ungroupedName.value])
      : [conn.group?.trim() || ungroupedName.value];
    for (const name of names) {
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(conn);
    }
  }
  return Array.from(map, ([name, connections]) => ({ name, connections }))
    .sort((a, b) => {
      if (a.name === ungroupedName.value) return 1;
      if (b.name === ungroupedName.value) return -1;
      return a.name.localeCompare(b.name);
    });
});

function collapseKey(name: string) {
  return `${groupMode.value}:${name}`;
}

function toggleGroup(name: string) {
  const key = collapseKey(name);
  collapsedGroups.value = { ...collapsedGroups.value, [key]: !collapsedGroups.value[key] };
}

// 搜索时始终展开命中的分组，避免结果被折叠状态隐藏
function isGroupCollapsed(name: string) {
  return !searchQuery.value.trim() && !!collapsedGroups.value[collapseKey(name)];
}

function showContextMenu(_event: MouseEvent, _conn: ConnectionEntity) {
  // 可扩展右键菜单
}
</script>

<style scoped>
.group-header {
  display: flex;
  align-items: center;
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.group-header:hover {
  color: var(--accent);
  background-color: rgb(var(--overlay-rgb) / 8%);
}
.group-count {
  font-size: 11px;
  opacity: 0.7;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 2px;
}
.tag-chip {
  font-size: 10px;
  line-height: 1.2;
  padding: 0 4px;
  border-radius: 8px;
  color: var(--accent);
  background-color: rgb(var(--accent-rgb) / 12%);
}

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
  background-color: rgb(var(--overlay-rgb) / 8%);
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
  background-color: rgb(var(--accent-rgb) / 10%);
}
</style>
