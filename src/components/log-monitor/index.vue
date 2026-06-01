<template>
  <div class="monitor-panel">
    <!-- 监控控制栏 -->
    <div class="monitor-controls">
      <input
        type="text"
        class="monitor-input"
        :placeholder="t('monitor.logPathPlaceholder')"
        v-model="logPath"
        :disabled="isMonitoring"
      >
      <button
        class="btn-monitor"
        :class="{ active: isMonitoring }"
        @click="toggleMonitor"
        :disabled="!logPath.trim() && !isMonitoring"
      >
        <i :class="isMonitoring ? 'bi bi-stop-fill' : 'bi bi-play-fill'"></i>
        {{ isMonitoring ? t('monitor.stop') : t('monitor.start') }}
      </button>
      <button
        v-if="isMonitoring"
        class="btn-monitor btn-analyze"
        @click="triggerAIAnalysis"
        :disabled="analyzing"
        :title="t('monitor.aiAnalyze')"
      >
        <i class="bi bi-robot"></i>
        {{ analyzing ? t('monitor.analyzing') : t('monitor.aiAnalyze') }}
      </button>
    </div>

    <!-- 监控状态 -->
    <div v-if="isMonitoring" class="monitor-status">
      <span class="status-indicator active"></span>
      <span>{{ t('monitor.monitoring') }}: {{ logPath }}</span>
      <span class="status-stats">{{ lineCount }} {{ t('monitor.lines') }} · {{ alerts.length }} {{ t('monitor.alerts') }}</span>
    </div>

    <!-- 告警面板 -->
    <div v-if="alerts.length > 0" class="monitor-alerts">
      <div class="alerts-header" @click="showAlerts = !showAlerts">
        <i :class="showAlerts ? 'bi bi-chevron-down' : 'bi bi-chevron-right'"></i>
        <i class="bi bi-exclamation-triangle-fill alert-icon"></i>
        <span>{{ alerts.length }} {{ t('monitor.detectedAnomalies') }}</span>
        <button class="btn-clear-alerts" @click.stop="alerts = []" :title="t('monitor.clearAlerts')">
          <i class="bi bi-x"></i>
        </button>
      </div>
      <div v-if="showAlerts" class="alerts-list">
        <div
          v-for="alert in alerts.slice(-20).reverse()"
          :key="alert.id"
          class="alert-item"
          :class="'level-' + alert.level"
        >
          <div class="alert-header">
            <span class="alert-level">{{ alert.level.toUpperCase() }}</span>
            <span class="alert-time">{{ formatTime(alert.timestamp) }}</span>
          </div>
          <div class="alert-message">{{ alert.message }}</div>
          <div v-if="alert.aiAnalysis" class="alert-analysis">
            <i class="bi bi-robot"></i>
            <span v-html="renderSimpleMarkdown(alert.aiAnalysis)"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- AI 分析结果 -->
    <div v-if="aiAnalysisResult" class="monitor-analysis">
      <div class="analysis-header">
        <i class="bi bi-robot"></i>
        <span>{{ t('monitor.aiAnalysisResult') }}</span>
        <button class="btn-clear-alerts" @click="aiAnalysisResult = ''">
          <i class="bi bi-x"></i>
        </button>
      </div>
      <div class="analysis-content" v-html="renderSimpleMarkdown(aiAnalysisResult)"></div>
    </div>

    <!-- 实时日志输出 -->
    <div class="monitor-output" ref="outputRef">
      <div v-if="lines.length === 0" class="monitor-empty">
        <i class="bi bi-terminal"></i>
        <span>{{ isMonitoring ? t('monitor.waitingForLogs') : t('monitor.notStarted') }}</span>
      </div>
      <div
        v-for="(line, idx) in displayLines"
        :key="idx"
        class="log-line"
        :class="getLineClass(line)"
      >{{ line }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { startMonitor, stopMonitor, getMonitorBatch, type MonitorAlert } from '@/service/monitor';
import * as aiService from '@/service/ai';

const { t, locale } = useI18n();

const props = defineProps<{
  sessionId: string;
  connectionId?: string;
}>();

const emit = defineEmits<{
  (e: 'ws-send', msg: any): void;
}>();

const logPath = ref('/var/log/syslog');
const isMonitoring = ref(false);
const monitorId = ref<string | null>(null);
const lines = ref<string[]>([]);
const alerts = ref<MonitorAlert[]>([]);
const showAlerts = ref(true);
const analyzing = ref(false);
const aiAnalysisResult = ref('');
const lineCount = ref(0);
const outputRef = ref<HTMLElement>();

const maxDisplayLines = 500;

const displayLines = computed(() => {
  return lines.value.slice(-maxDisplayLines);
});

function getLineClass(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('fatal') || lower.includes('critical') || lower.includes('exception')) {
    return 'line-error';
  }
  if (lower.includes('warn')) {
    return 'line-warning';
  }
  if (lower.includes('debug') || lower.includes('trace')) {
    return 'line-debug';
  }
  return '';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

async function toggleMonitor() {
  if (isMonitoring.value) {
    await stopMonitoring();
  } else {
    await startMonitoring();
  }
}

async function startMonitoring() {
  if (!logPath.value.trim()) return;

  try {
    const res = await startMonitor(
      props.sessionId,
      props.connectionId || '',
      logPath.value.trim(),
    );
    monitorId.value = res.monitorId;
    isMonitoring.value = true;
    lines.value = [];
    alerts.value = [];
    lineCount.value = 0;
  } catch (e: any) {
    console.error('Failed to start monitor:', e);
    lines.value.push(`[ERROR] ${e.message || 'Failed to start monitor'}`);
  }
}

async function stopMonitoring() {
  if (monitorId.value) {
    try {
      await stopMonitor(monitorId.value);
    } catch { /* ignore */ }
  }
  isMonitoring.value = false;
  monitorId.value = null;
}

/**
 * 处理 WebSocket 推送的监控事件
 */
function handleMonitorEvent(event: any) {
  switch (event.type) {
    case 'monitor-line':
      if (event.lines) {
        lines.value.push(...event.lines);
        lineCount.value += event.lines.length;
        // 限制内存中的行数
        if (lines.value.length > 2000) {
          lines.value = lines.value.slice(-2000);
        }
        nextTick(scrollToBottom);
      }
      break;

    case 'monitor-alert':
      if (event.alert) {
        alerts.value.push(event.alert);
        if (alerts.value.length > 200) {
          alerts.value = alerts.value.slice(-200);
        }
      }
      break;

    case 'monitor-error':
      lines.value.push(`[ERROR] ${event.error || 'Monitor error'}`);
      break;

    case 'monitor-stopped':
      isMonitoring.value = false;
      monitorId.value = null;
      lines.value.push('[INFO] Monitor stopped');
      break;
  }
}

/**
 * 触发 AI 分析
 */
async function triggerAIAnalysis() {
  if (!monitorId.value || analyzing.value) return;

  analyzing.value = true;
  aiAnalysisResult.value = '';

  try {
    // 获取最近一批日志行
    const batchLines = await getMonitorBatch(monitorId.value);
    if (batchLines.length === 0) {
      aiAnalysisResult.value = t('monitor.noLogsToAnalyze');
      return;
    }

    // 通过 AI Agent 分析日志
    const analysisPrompt = `Please analyze the following log snippet, identify any anomalies, errors, or potential issues, and provide recommendations:\n\n\`\`\`\n${batchLines.join('\n')}\n\`\`\``;

    // 使用 ws-send 启动 AI Agent 分析
    emit('ws-send', {
      type: 'ai-agent-run',
      data: {
        aiSessionId: props.sessionId,
        message: analysisPrompt,
        context: '',
        locale: locale.value,
      },
    });

    aiAnalysisResult.value = t('monitor.analysisInProgress');
  } catch (e: any) {
    aiAnalysisResult.value = `分析失败: ${e.message}`;
  } finally {
    analyzing.value = false;
  }
}

function scrollToBottom() {
  if (outputRef.value) {
    outputRef.value.scrollTop = outputRef.value.scrollHeight;
  }
}

function renderSimpleMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\n/g, '<br>');
}

defineExpose({ handleMonitorEvent, stopMonitoring });
</script>

<style scoped>
.monitor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-dark);
  font-size: 12px;
  color: var(--text-primary);
}

.monitor-controls {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.monitor-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
}
.monitor-input:focus { border-color: var(--accent); }
.monitor-input:disabled { opacity: 0.6; }

.btn-monitor {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  transition: all 0.15s;
}
.btn-monitor:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); }
.btn-monitor.active { background: rgba(243, 139, 168, 0.15); border-color: #f38ba8; color: #f38ba8; }
.btn-monitor:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-analyze { border-color: #89b4fa; color: #89b4fa; }
.btn-analyze:hover:not(:disabled) { background: rgba(137, 180, 250, 0.1); }

.monitor-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 11px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.1);
}
.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #666;
}
.status-indicator.active {
  background: #a6e3a1;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.status-stats { margin-left: auto; }

/* 告警面板 */
.monitor-alerts {
  border-bottom: 1px solid var(--border-color);
  background: rgba(243, 139, 168, 0.04);
}
.alerts-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  color: #f38ba8;
  transition: background 0.15s;
}
.alerts-header:hover { background: rgba(255, 255, 255, 0.03); }
.alert-icon { font-size: 12px; }
.btn-clear-alerts {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  margin-left: auto;
  padding: 0 4px;
  font-size: 14px;
}
.btn-clear-alerts:hover { color: var(--text-primary); }

.alerts-list {
  max-height: 200px;
  overflow-y: auto;
}
.alert-item {
  padding: 6px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
.alert-item.level-critical { border-left: 3px solid #f38ba8; }
.alert-item.level-error { border-left: 3px solid #fab387; }
.alert-item.level-warning { border-left: 3px solid #f9e2af; }

.alert-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}
.alert-level {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
}
.level-critical .alert-level { background: rgba(243, 139, 168, 0.2); color: #f38ba8; }
.level-error .alert-level { background: rgba(250, 179, 135, 0.2); color: #fab387; }
.level-warning .alert-level { background: rgba(249, 226, 175, 0.2); color: #f9e2af; }
.alert-time { font-size: 10px; color: var(--text-secondary); }
.alert-message {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.alert-analysis {
  margin-top: 4px;
  padding: 4px 8px;
  background: rgba(137, 180, 250, 0.06);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}
.alert-analysis i { color: #89b4fa; margin-right: 4px; }

/* AI 分析结果 */
.monitor-analysis {
  border-bottom: 1px solid var(--border-color);
  background: rgba(137, 180, 250, 0.04);
  max-height: 200px;
  overflow-y: auto;
}
.analysis-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  color: #89b4fa;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.analysis-content {
  padding: 8px 12px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.analysis-content :deep(.code-block) {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  padding: 8px;
  margin: 4px 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}
.analysis-content :deep(.inline-code) {
  background: rgba(0, 0, 0, 0.3);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
}

/* 日志输出 */
.monitor-output {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.5;
}
.monitor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  gap: 8px;
}
.monitor-empty i { font-size: 24px; opacity: 0.5; }

.log-line {
  padding: 1px 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-secondary);
}
.log-line:hover { background: rgba(255, 255, 255, 0.03); }
.log-line.line-error { color: #f38ba8; background: rgba(243, 139, 168, 0.05); }
.log-line.line-warning { color: #f9e2af; background: rgba(249, 226, 175, 0.03); }
.log-line.line-debug { color: var(--text-secondary); opacity: 0.6; }
</style>
