<template>
  <div class="batch-panel">
    <!-- 控制栏 -->
    <div class="batch-controls">
      <div class="batch-input-row">
        <textarea
          class="batch-command"
          :placeholder="t('batch.commandPlaceholder')"
          v-model="command"
          rows="2"
          :disabled="executing"
        ></textarea>
        <button
          class="btn-batch"
          @click="handleExecute"
          :disabled="!command.trim() || selectedSessions.length === 0 || executing"
        >
          <i :class="executing ? 'bi bi-hourglass-split' : 'bi bi-play-fill'"></i>
          {{ executing ? t('batch.executing') : t('batch.execute') }}
        </button>
      </div>
      <div class="batch-info">
        <span class="session-count">
          <i class="bi bi-hdd-rack"></i>
          {{ selectedSessions.length }} {{ t('batch.serversSelected') }}
        </span>
        <button class="btn-select-sessions" @click="showSessionSelector = !showSessionSelector">
          <i class="bi bi-check2-square"></i>
          {{ t('batch.selectServers') }}
        </button>
      </div>
    </div>

    <!-- 服务器选择器 -->
    <div v-if="showSessionSelector" class="session-selector">
      <div class="selector-header">
        <span>{{ t('batch.selectServers') }}</span>
        <div class="selector-actions">
          <button class="btn-small" @click="selectAll">{{ t('batch.selectAll') }}</button>
          <button class="btn-small" @click="selectNone">{{ t('batch.selectNone') }}</button>
          <button class="btn-small" @click="showSessionSelector = false">
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>
      <div class="session-list">
        <div
          v-for="session in availableSessions"
          :key="session.sessionId"
          class="session-item"
          :class="{ selected: selectedSessions.includes(session.sessionId) }"
          @click="toggleSession(session.sessionId)"
        >
          <i :class="selectedSessions.includes(session.sessionId) ? 'bi bi-check-square-fill' : 'bi bi-square'"></i>
          <span class="session-name">{{ session.name || session.sessionId.substring(0, 8) }}</span>
          <span class="session-type">{{ session.type }}</span>
        </div>
        <div v-if="availableSessions.length === 0" class="session-empty">
          {{ t('batch.noActiveSessions') }}
        </div>
      </div>
    </div>

    <!-- 执行结果 -->
    <div class="batch-results" v-if="task">
      <div class="results-header">
        <span class="results-title">
          <code>{{ task.command }}</code>
          <span class="results-status" :class="'status-' + task.status">{{ task.status }}</span>
        </span>
        <span class="results-summary">
          <span class="summary-success">{{ successCount }} <i class="bi bi-check-circle"></i></span>
          <span class="summary-fail" v-if="failCount > 0">{{ failCount }} <i class="bi bi-x-circle"></i></span>
          <span class="summary-time">{{ totalDuration }}</span>
        </span>
      </div>

      <div class="results-list">
        <div
          v-for="result in task.results"
          :key="result.sessionId"
          class="result-item"
          :class="{ success: result.success, failed: !result.success, expanded: expandedResults.has(result.sessionId) }"
          @click="toggleResult(result.sessionId)"
        >
          <div class="result-header">
            <i :class="result.success ? 'bi bi-check-circle-fill text-success' : 'bi bi-x-circle-fill text-danger'"></i>
            <span class="result-name">{{ result.sessionName }}</span>
            <span class="result-duration">{{ formatDuration(result.duration) }}</span>
            <i :class="expandedResults.has(result.sessionId) ? 'bi bi-chevron-up' : 'bi bi-chevron-down'" class="result-expand"></i>
          </div>
          <div v-if="expandedResults.has(result.sessionId)" class="result-output">
            <pre>{{ result.success ? result.output : (result.error || result.output) }}</pre>
            <div class="result-actions">
              <button class="btn-copy" @click.stop="copyText(result.output)">
                <i class="bi bi-clipboard"></i> {{ t('batch.copyOutput') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="batch-empty">
      <i class="bi bi-hdd-rack"></i>
      <p>{{ t('batch.hint') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { executeBatch, getBatchTasks, type BatchTask, type BatchResult } from '@/service/batch';
import * as terminalService from '@/service/terminal';

const { t } = useI18n();

const command = ref('');
const executing = ref(false);
const task = ref<BatchTask | null>(null);
const availableSessions = ref<any[]>([]);
const selectedSessions = ref<string[]>([]);
const showSessionSelector = ref(true);
const expandedResults = reactive(new Set<string>());

const successCount = computed(() => task.value?.results.filter(r => r.success).length || 0);
const failCount = computed(() => task.value?.results.filter(r => !r.success).length || 0);
const totalDuration = computed(() => {
  if (!task.value?.completedAt || !task.value?.startedAt) return '';
  const ms = task.value.completedAt - task.value.startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
});

async function loadSessions() {
  try {
    const sessions = await terminalService.getSessions();
    availableSessions.value = sessions || [];
  } catch (e) {
    console.warn('Failed to load sessions:', e);
  }
}

function toggleSession(sessionId: string) {
  const idx = selectedSessions.value.indexOf(sessionId);
  if (idx >= 0) {
    selectedSessions.value.splice(idx, 1);
  } else {
    selectedSessions.value.push(sessionId);
  }
}

function selectAll() {
  selectedSessions.value = availableSessions.value.map(s => s.sessionId);
}

function selectNone() {
  selectedSessions.value = [];
}

async function handleExecute() {
  if (!command.value.trim() || selectedSessions.value.length === 0) return;

  executing.value = true;
  task.value = null;
  expandedResults.clear();

  try {
    const result = await executeBatch(selectedSessions.value, command.value.trim(), 15000);
    task.value = result;
    // 自动展开失败的结果
    for (const r of result.results) {
      if (!r.success) expandedResults.add(r.sessionId);
    }
  } catch (e: any) {
    console.error('Batch execute failed:', e);
    task.value = {
      id: 'error',
      command: command.value,
      sessionIds: selectedSessions.value,
      results: [],
      status: 'failed',
      startedAt: Date.now(),
      completedAt: Date.now(),
    };
  } finally {
    executing.value = false;
  }
}

function toggleResult(sessionId: string) {
  if (expandedResults.has(sessionId)) {
    expandedResults.delete(sessionId);
  } else {
    expandedResults.add(sessionId);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

import { copy } from '@/utils/clipboard';

function copyText(text: string) {
  copy(text);
}

onMounted(async () => {
  await loadSessions();
  // 加载最近的任务
  try {
    const tasks = await getBatchTasks();
    if (tasks && tasks.length > 0) {
      task.value = tasks[0];
    }
  } catch { /* ignore */ }
});

defineExpose({ loadSessions });
</script>

<style scoped>
.batch-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-dark);
  font-size: 12px;
  color: var(--text-primary);
}

.batch-controls {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.batch-input-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.batch-command {
  flex: 1;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  resize: none;
  outline: none;
}
.batch-command:focus { border-color: var(--accent); }
.batch-command:disabled { opacity: 0.6; }

.btn-batch {
  background: var(--accent);
  border: none;
  color: white;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  transition: all 0.15s;
}
.btn-batch:hover:not(:disabled) { opacity: 0.9; }
.btn-batch:disabled { opacity: 0.4; cursor: not-allowed; }

.batch-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.session-count { display: flex; align-items: center; gap: 4px; }

.btn-select-sessions {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.btn-select-sessions:hover { background: rgba(255,255,255,0.05); color: var(--text-primary); }

/* 服务器选择器 */
.session-selector {
  border-bottom: 1px solid var(--border-color);
  max-height: 200px;
  overflow-y: auto;
}

.selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-secondary);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.selector-actions { display: flex; gap: 4px; }

.btn-small {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 10px;
  padding: 1px 4px;
}
.btn-small:hover { text-decoration: underline; }

.session-list { padding: 4px 0; }

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.12s;
}
.session-item:hover { background: rgba(255,255,255,0.04); }
.session-item.selected { background: rgba(137, 180, 250, 0.08); }
.session-item i { font-size: 13px; color: var(--text-secondary); }
.session-item.selected i { color: var(--accent); }
.session-name { flex: 1; font-size: 12px; }
.session-type {
  font-size: 10px;
  color: var(--text-secondary);
  background: rgba(255,255,255,0.06);
  padding: 1px 5px;
  border-radius: 3px;
}

.session-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 11px;
}

/* 执行结果 */
.batch-results {
  flex: 1;
  overflow-y: auto;
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
}

.results-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.results-title code {
  font-size: 11px;
  color: #89b4fa;
  background: rgba(0,0,0,0.2);
  padding: 1px 6px;
  border-radius: 3px;
}
.results-status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
}
.status-completed { background: rgba(166, 227, 161, 0.15); color: #a6e3a1; }
.status-running { background: rgba(250, 176, 5, 0.15); color: #fab387; }
.status-failed { background: rgba(243, 139, 168, 0.15); color: #f38ba8; }

.results-summary {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: var(--text-secondary);
}
.summary-success { color: #a6e3a1; }
.summary-fail { color: #f38ba8; }

.results-list { padding: 4px 0; }

.result-item {
  border-bottom: 1px solid rgba(255,255,255,0.04);
  cursor: pointer;
}
.result-item:hover { background: rgba(255,255,255,0.03); }

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
}
.result-name { flex: 1; font-size: 12px; }
.result-duration { font-size: 10px; color: var(--text-secondary); }
.result-expand { font-size: 10px; color: var(--text-secondary); }

.result-output {
  padding: 6px 12px 10px 32px;
  background: rgba(0,0,0,0.15);
}
.result-output pre {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

.result-actions {
  margin-top: 4px;
  display: flex;
  gap: 6px;
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
.btn-copy:hover { background: rgba(255,255,255,0.05); color: var(--text-primary); }

.text-success { color: #a6e3a1; }
.text-danger { color: #f38ba8; }

/* 空状态 */
.batch-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  gap: 8px;
}
.batch-empty i { font-size: 32px; opacity: 0.4; }
.batch-empty p { font-size: 12px; margin: 0; }
</style>
