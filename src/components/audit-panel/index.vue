<template>
  <div class="audit-panel">
    <div class="audit-header">
      <div class="audit-header-left">
        <i class="bi bi-shield-check me-1"></i>
        <span>{{ t('audit.title') }}</span>
        <span v-if="stats" class="audit-badge">{{ stats.today }} {{ t('audit.today') }}</span>
      </div>
      <div class="audit-header-right">
        <button class="btn-audit" @click="refresh" :title="t('common.refresh')">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
        <button class="btn-audit" @click="handleExport" :title="t('audit.export')">
          <i class="bi bi-download"></i>
        </button>
      </div>
    </div>

    <!-- 过滤器 -->
    <div class="audit-filters">
      <input
        type="date"
        class="filter-input"
        v-model="selectedDate"
        @change="loadLogs"
      >
      <input
        type="text"
        class="filter-input flex-grow-1"
        :placeholder="t('audit.searchPlaceholder')"
        v-model="keyword"
        @input="debouncedLoad"
      >
      <select class="filter-input" v-model="statusFilter" @change="loadLogs">
        <option value="">{{ t('audit.allStatus') }}</option>
        <option value="success">{{ t('audit.success') }}</option>
        <option value="error">{{ t('audit.error') }}</option>
        <option value="blocked">{{ t('audit.blocked') }}</option>
      </select>
    </div>

    <!-- 统计概览 -->
    <div v-if="stats" class="audit-stats">
      <span class="stat-item stat-total">{{ stats.total }} {{ t('audit.total') }}</span>
      <span class="stat-item stat-success">{{ stats.success }} <i class="bi bi-check-circle"></i></span>
      <span class="stat-item stat-error">{{ stats.error }} <i class="bi bi-x-circle"></i></span>
      <span v-if="stats.blocked" class="stat-item stat-blocked">{{ stats.blocked }} <i class="bi bi-shield-x"></i></span>
    </div>

    <!-- 审计日志列表 -->
    <div class="audit-list" ref="listRef">
      <div v-if="loading" class="audit-empty">
        <i class="bi bi-hourglass-split"></i> {{ t('common.loading') }}
      </div>
      <div v-else-if="entries.length === 0" class="audit-empty">
        <i class="bi bi-inbox"></i> {{ t('audit.noLogs') }}
      </div>
      <div
        v-else
        v-for="entry in entries"
        :key="entry.id"
        class="audit-entry"
        :class="'status-' + entry.status"
        @click="toggleExpand(entry.id)"
      >
        <div class="entry-header">
          <span class="entry-status">
            <i :class="statusIcon(entry.status)"></i>
          </span>
          <code class="entry-command">{{ entry.command || entry.tool }}</code>
          <span class="entry-meta">
            <span class="entry-duration">{{ formatDuration(entry.duration) }}</span>
            <span class="entry-time">{{ formatTime(entry.timestamp) }}</span>
          </span>
        </div>
        <div v-if="expandedIds.has(entry.id)" class="entry-detail">
          <div class="detail-row">
            <span class="detail-label">{{ t('audit.session') }}:</span>
            <span>{{ entry.sessionName || entry.sessionId }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ t('audit.userRequest') }}:</span>
            <span>{{ entry.userMessage }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ t('audit.command') }}:</span>
            <pre class="detail-code">{{ entry.command }}</pre>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ t('audit.result') }}:</span>
            <pre class="detail-code">{{ entry.result }}</pre>
          </div>
          <div class="detail-actions">
            <button class="btn-copy" @click.stop="copyText(entry.command)">
              <i class="bi bi-clipboard"></i> {{ t('audit.copyCommand') }}
            </button>
            <button class="btn-copy" @click.stop="copyText(entry.result)">
              <i class="bi bi-clipboard"></i> {{ t('audit.copyResult') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { getAuditLogs, getAuditStats, exportAuditLogs, type AuditEntry } from '@/service/audit';

const { t } = useI18n();

const entries = ref<AuditEntry[]>([]);
const stats = ref<any>(null);
const loading = ref(false);
const selectedDate = ref(formatDateStr(new Date()));
const keyword = ref('');
const statusFilter = ref('');
const expandedIds = reactive(new Set<string>());
const listRef = ref<HTMLElement>();

let debounceTimer: any = null;

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'success': return 'bi bi-check-circle-fill text-success';
    case 'error': return 'bi bi-x-circle-fill text-danger';
    case 'blocked': return 'bi bi-shield-x-fill text-warning';
    case 'rewritten': return 'bi bi-pencil-square text-info';
    default: return 'bi bi-question-circle';
  }
}

function toggleExpand(id: string) {
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
}

async function loadLogs() {
  loading.value = true;
  try {
    const res = await getAuditLogs({
      date: selectedDate.value,
      keyword: keyword.value || undefined,
      status: statusFilter.value || undefined,
      limit: 200,
    });
    entries.value = res.entries;
    stats.value = await getAuditStats(selectedDate.value);
  } catch (e: any) {
    console.error('Failed to load audit logs:', e);
  } finally {
    loading.value = false;
  }
}

function debouncedLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadLogs, 300);
}

function refresh() {
  loadLogs();
}

async function handleExport() {
  try {
    const date = selectedDate.value;
    const data = await exportAuditLogs(date, date, 'json');
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    console.error('Export failed:', e);
  }
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

/** 添加实时审计条目（从 WebSocket 调用） */
function addRealtimeEntry(entry: AuditEntry) {
  if (selectedDate.value === formatDateStr(new Date())) {
    entries.value.unshift(entry);
    if (stats.value) {
      stats.value.total++;
      stats.value.today++;
      if (entry.status === 'success') stats.value.success++;
      else if (entry.status === 'error') stats.value.error++;
      else if (entry.status === 'blocked') stats.value.blocked++;
    }
  }
}

onMounted(loadLogs);

defineExpose({ addRealtimeEntry, refresh });
</script>

<style scoped>
.audit-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-dark);
  font-size: 12px;
  color: var(--text-primary);
}

.audit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 500;
}
.audit-header-left { display: flex; align-items: center; gap: 6px; }
.audit-header-right { display: flex; gap: 4px; }

.audit-badge {
  background: var(--accent);
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 400;
}

.btn-audit {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.btn-audit:hover { background: var(--bg-hover); color: var(--text-primary); }

.audit-filters {
  display: flex;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
}
.filter-input {
  background: var(--bg-input, var(--bg-dark));
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  outline: none;
}
.filter-input:focus { border-color: var(--accent); }

.audit-stats {
  display: flex;
  gap: 10px;
  padding: 4px 12px;
  font-size: 11px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
}
.stat-success { color: #4caf50; }
.stat-error { color: #f44336; }
.stat-blocked { color: #ff9800; }

.audit-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.audit-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}
.audit-empty i { font-size: 24px; display: block; margin-bottom: 8px; }

.audit-entry {
  padding: 6px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  cursor: pointer;
}
.audit-entry:hover { background: var(--bg-hover); }

.entry-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.entry-status { font-size: 12px; flex-shrink: 0; }
.entry-command {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-primary);
}
.entry-meta {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-secondary);
}

.entry-detail {
  margin-top: 6px;
  padding: 8px;
  background: rgba(0,0,0,0.2);
  border-radius: 4px;
  font-size: 11px;
}
.detail-row {
  margin-bottom: 4px;
  display: flex;
  gap: 6px;
}
.detail-label {
  color: var(--text-secondary);
  flex-shrink: 0;
  min-width: 60px;
}
.detail-code {
  background: rgba(0,0,0,0.3);
  padding: 4px 8px;
  border-radius: 3px;
  margin: 2px 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 11px;
  max-height: 200px;
  overflow-y: auto;
}
.detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.btn-copy {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
}
.btn-copy:hover { background: var(--bg-hover); color: var(--text-primary); }

.text-success { color: #4caf50; }
.text-danger { color: #f44336; }
.text-warning { color: #ff9800; }
.text-info { color: #2196f3; }
</style>
