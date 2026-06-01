<template>
  <div class="ai-chat-panel" :class="{ collapsed: !isOpen }">
    <!-- 头部 -->
    <div class="ai-chat-header">
      <div class="d-flex align-items-center gap-2">
        <!-- Tab 切换 -->
        <div class="ai-tab-bar">
          <button class="ai-tab" :class="{ active: activeTab === 'chat' }" @click="activeTab = 'chat'">
            <i class="bi bi-robot"></i> {{ t('ai.chat') }}
          </button>
          <button class="ai-tab" :class="{ active: activeTab === 'audit' }" @click="activeTab = 'audit'">
            <i class="bi bi-shield-check"></i> {{ t('audit.title') }}
          </button>
          <button class="ai-tab" :class="{ active: activeTab === 'monitor' }" @click="activeTab = 'monitor'">
            <i class="bi bi-activity"></i> {{ t('monitor.title') }}
          </button>
        </div>
      </div>
      <div class="d-flex gap-1">
        <template v-if="activeTab === 'chat'">
          <button class="btn-ai-action" @click="handleOpenSettings" :title="t('ai.settings')">
            <i class="bi bi-gear"></i>
          </button>
          <button class="btn-ai-action" @click="toggleHistoryPanel" :title="t('ai.history')" :class="{ active: showHistoryPanel }">
            <i class="bi bi-clock-history"></i>
          </button>
          <button v-if="isAgentRunning" class="btn-ai-action btn-stop" @click="handleStop" :title="t('ai.stopAgent')">
            <i class="bi bi-stop-circle"></i>
          </button>
          <button class="btn-ai-action" @click="handleClear" :title="t('ai.clearHistory')">
            <i class="bi bi-trash"></i>
          </button>
        </template>
        <button class="btn-ai-action" @click="handleClose" :title="t('common.close')">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </div>

    <!-- 消息列表 (Chat 模式) -->
    <div v-show="activeTab === 'chat'" class="ai-chat-messages" ref="messagesContainer">
      <div v-if="messages.length === 0" class="ai-chat-empty">
        <i class="bi bi-robot" style="font-size: 32px; opacity: 0.5;"></i>
        <p>{{ t('ai.agentHint') }}</p>
      </div>
      <div 
        v-for="(msg, index) in messages" 
        :key="index" 
        class="ai-message"
        :class="[msg.role, { 'system-info': msg.isSystemInfo }]"
      >
        <div class="ai-message-avatar">
          <i :class="msg.isSystemInfo ? 'bi bi-info-circle' : (msg.role === 'user' ? 'bi bi-person' : 'bi bi-robot')"></i>
        </div>
        <div class="ai-message-content">
          <!-- 用户消息中显示 Skill 标签 -->
          <div v-if="msg.skillName" class="skill-badge">
            <i class="bi bi-lightning-charge-fill"></i>
            <span>{{ msg.skillName }}</span>
          </div>

          <!-- Agent 步骤（在文本上方，先执行后结论） -->
          <div v-if="msg.agentSteps && msg.agentSteps.length > 0" class="agent-steps">
            <template v-for="(step, stepIdx) in msg.agentSteps" :key="stepIdx">
              <!-- 思考中 -->
              <div v-if="step.type === 'thinking'" class="agent-step thinking-step">
                <div class="ai-loading">
                  <span></span><span></span><span></span>
                </div>
                <span class="step-label">{{ t('ai.agentThinking') }}</span>
              </div>
              
              <!-- 工具调用（默认折叠，紧凑显示） -->
              <div v-if="step.type === 'tool_call'" class="agent-step tool-call-step">
                <div class="step-header" @click="toggleStep(step)">
                  <i :class="step.collapsed ? 'bi bi-chevron-right' : 'bi bi-chevron-down'" class="step-chevron"></i>
                  <i class="bi bi-terminal step-icon"></i>
                  <code class="step-cmd">{{ getToolDisplayCmd(step) }}</code>
                  <i v-if="step.result" :class="step.collapsed ? 'bi bi-check-circle' : 'bi bi-check-circle-fill'" class="step-status"></i>
                </div>
                <div v-if="!step.collapsed && step.result" class="step-result">
                  <pre>{{ step.result }}</pre>
                </div>
              </div>
            </template>
          </div>

          <!-- AI 回复文本 -->
          <div class="ai-message-text" v-if="msg.content" v-html="renderMarkdown(msg.content)"></div>
        </div>
      </div>
    </div>

    <!-- Skills 面板 -->
    <div v-if="showSkillsPanel" class="skills-panel">
      <div class="skills-panel-header">
        <span>{{ t('ai.selectSkill') }}</span>
        <button class="btn-ai-action" @click="showSkillsPanel = false">
          <i class="bi bi-x"></i>
        </button>
      </div>
      <div class="skills-grid">
        <div
          v-for="skill in skills"
          :key="skill.id"
          class="skill-item"
          :class="{ active: selectedSkill?.id === skill.id }"
          @click="toggleSkill(skill)"
        >
          <div class="skill-item-header">
            <i class="bi bi-lightning-charge-fill"></i>
            <span class="skill-name">{{ skill.name }}</span>
            <span v-if="skill.source === 'user'" class="skill-source">{{ t('ai.userSkill') }}</span>
          </div>
          <div v-if="skill.description" class="skill-desc">{{ skill.description }}</div>
        </div>
        <div v-if="skills.length === 0" class="skills-empty">
          {{ t('ai.noSkills') }}
        </div>
      </div>
    </div>

    <!-- 历史对话面板 -->
    <div v-if="showHistoryPanel" class="history-panel">
      <div class="history-panel-header">
        <span>{{ t('ai.history') }}</span>
        <button class="btn-ai-action" @click="showHistoryPanel = false">
          <i class="bi bi-x"></i>
        </button>
      </div>
      <div class="history-list">
        <div
          v-for="h in historyList"
          :key="h.sessionId"
          class="history-item"
          @click="loadPastHistory(h.sessionId)"
        >
          <div class="history-item-top">
            <span class="history-name">{{ h.sessionName || h.sessionId.substring(0, 8) }}</span>
            <span class="history-time">{{ formatTime(h.savedAt) }}</span>
          </div>
          <div class="history-preview">{{ h.preview || t('ai.noHistory') }}</div>
          <div class="history-meta">{{ h.messageCount }} {{ t('ai.messages') }}</div>
        </div>
        <div v-if="historyList.length === 0" class="history-empty">
          {{ t('ai.noHistory') }}
        </div>
      </div>
    </div>

    <!-- 审计面板 (Audit 模式) -->
    <div v-show="activeTab === 'audit'" class="ai-audit-wrapper">
      <AuditPanel ref="auditPanelRef" />
    </div>

    <!-- 日志监控面板 (Monitor 模式) -->
    <div v-show="activeTab === 'monitor'" class="ai-audit-wrapper">
      <LogMonitor ref="logMonitorRef" :sessionId="props.sessionId" :connectionId="props.connectionId" @ws-send="(msg: any) => emit('ws-send', msg)" />
    </div>

    <!-- 已选 Skill 标签 -->
    <div v-if="selectedSkill && activeTab === 'chat'" class="selected-skill-bar">
      <div class="selected-skill-tag">
        <i class="bi bi-lightning-charge-fill"></i>
        <span>{{ selectedSkill.name }}</span>
        <button @click="clearSelectedSkill" class="skill-remove">
          <i class="bi bi-x"></i>
        </button>
      </div>
    </div>

    <!-- 输入区域 -->
    <div v-show="activeTab === 'chat'" class="ai-chat-input">
      <button class="btn-skill-toggle" @click="toggleSkillsPanel" :title="t('ai.skills')" :class="{ active: showSkillsPanel }">
        <i class="bi bi-lightning-charge"></i>
      </button>
      <textarea
        ref="inputRef"
        v-model="inputText"
        :placeholder="t('ai.inputPlaceholder')"
        @keydown.enter.exact.prevent="handleSend"
        @keydown.shift.enter="handleNewLine"
        @input="handleInput"
        rows="1"
        :disabled="isAgentRunning"
      ></textarea>
      <button 
        class="btn-send" 
        @click="handleSend"
        :disabled="!inputText.trim() || isAgentRunning"
      >
        <i class="bi bi-send-fill"></i>
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import * as aiService from '@/service/ai';
import AuditPanel from '@/components/audit-panel/index.vue';
import LogMonitor from '@/components/log-monitor/index.vue';

const { t, locale } = useI18n();

const props = defineProps<{
  sessionId: string;
  sessionName?: string;
  connectionId?: string;
  isOpen: boolean;
  getTerminalContext?: () => string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'ws-send', msg: any): void;
  (e: 'open-settings'): void;
}>();

// Skill 接口
interface SkillItem {
  id: string;
  name: string;
  description: string;
  tags: string[];
  source: 'system' | 'user';
}

// Agent 步骤接口
interface AgentStep {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'message';
  tool?: string;
  args?: any;
  result?: string;
  content?: string;
  collapsed?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  agentSteps?: AgentStep[];
  isRunning?: boolean;
  skillName?: string;
  isSystemInfo?: boolean;
}

const activeTab = ref<'chat' | 'audit' | 'monitor'>('chat');
const messagesContainer = ref<HTMLElement>();
const inputRef = ref<HTMLTextAreaElement>();
const auditPanelRef = ref<InstanceType<typeof AuditPanel>>();
const logMonitorRef = ref<InstanceType<typeof LogMonitor>>();
const inputText = ref('');
const isAgentRunning = ref(false);
const messages = ref<ChatMessage[]>([]);

// Skills 相关
const skills = ref<SkillItem[]>([]);
const selectedSkill = ref<SkillItem | null>(null);
const showSkillsPanel = ref(false);

// 历史对话相关
interface HistoryItem {
  sessionId: string;
  sessionName?: string;
  savedAt: number;
  messageCount: number;
  preview: string;
}
const showHistoryPanel = ref(false);
const historyList = ref<HistoryItem[]>([]);

// 当前正在构建的 assistant 消息
let currentAssistantIdx = -1;

function ensureAssistantMessage(): number {
  if (currentAssistantIdx >= 0 && currentAssistantIdx < messages.value.length) {
    return currentAssistantIdx;
  }
  const msg: ChatMessage = {
    role: 'assistant',
    content: '',
    agentSteps: [],
    isRunning: true,
  };
  messages.value.push(msg);
  currentAssistantIdx = messages.value.length - 1;
  return currentAssistantIdx;
}

// 处理 Agent 事件（由父组件调用）
function handleAgentEvent(event: any) {
  // system_info 作为独立消息展示，不进入 assistant 消息流
  if (event.type === 'system_info') {
    messages.value.push({
      role: 'assistant',
      content: event.content || '',
      isSystemInfo: true,
      isRunning: false,
    });
    nextTick(() => scrollToBottom());
    return;
  }

  const idx = ensureAssistantMessage();
  const msg = messages.value[idx];
  if (!msg.agentSteps) msg.agentSteps = [];

  switch (event.type) {
    case 'thinking':
      // 移除旧的 thinking 步骤（如果有）
      msg.agentSteps = msg.agentSteps.filter(s => s.type !== 'thinking');
      msg.agentSteps.push({ type: 'thinking' });
      break;

    case 'message':
      // 移除 thinking
      msg.agentSteps = msg.agentSteps.filter(s => s.type !== 'thinking');
      // 追加文本内容
      msg.content += event.content || '';
      break;

    case 'tool_call':
      // 移除 thinking
      msg.agentSteps = msg.agentSteps.filter(s => s.type !== 'thinking');
      msg.agentSteps.push({
        type: 'tool_call',
        tool: event.tool,
        args: event.args,
        collapsed: true, // 默认折叠，节省空间
      });
      break;

    case 'tool_result':
      // 找到最近的对应工具的 tool_call 步骤
      for (let i = msg.agentSteps.length - 1; i >= 0; i--) {
        if (msg.agentSteps[i].type === 'tool_call' && msg.agentSteps[i].tool === event.tool && !msg.agentSteps[i].result) {
          msg.agentSteps[i].result = event.result;
          // 保持折叠状态，用户可手动展开
          break;
        }
      }
      break;

    case 'done':
      msg.isRunning = false;
      msg.agentSteps = msg.agentSteps.filter(s => s.type !== 'thinking');
      if (event.content) {
        msg.content += event.content;
      }
      isAgentRunning.value = false;
      currentAssistantIdx = -1;
      saveDisplayHistory();
      break;

    case 'audit_entry':
      // 转发审计条目到审计面板
      if (event.auditEntry && auditPanelRef.value) {
        auditPanelRef.value.addRealtimeEntry(event.auditEntry);
      }
      return; // 不影响聊天消息流

    case 'error':
      msg.isRunning = false;
      msg.agentSteps = msg.agentSteps.filter(s => s.type !== 'thinking');
      msg.content += `\n\n**错误**: ${event.error || '未知错误'}`;
      isAgentRunning.value = false;
      currentAssistantIdx = -1;
      saveDisplayHistory();
      break;
  }

  scrollToBottom();
}

// 加载 Skills 列表
async function loadSkills() {
  try {
    const data = await aiService.getSkills();
    if (Array.isArray(data)) {
      skills.value = data;
    }
  } catch (e) {
    console.warn('Failed to load skills:', e);
  }
}

function toggleSkillsPanel() {
  showSkillsPanel.value = !showSkillsPanel.value;
}

function toggleSkill(skill: SkillItem) {
  if (selectedSkill.value?.id === skill.id) {
    selectedSkill.value = null;
  } else {
    selectedSkill.value = skill;
  }
  showSkillsPanel.value = false;
}

function clearSelectedSkill() {
  selectedSkill.value = null;
}

// 斜杠命令检测
function handleInput() {
  const text = inputText.value;
  if (text.startsWith('/') && !text.includes(' ')) {
    // 正在输入斜杠命令，尝试匹配
    const cmd = text.substring(1).toLowerCase();
    const match = skills.value.find(s => s.id.toLowerCase() === cmd);
    if (match) {
      selectedSkill.value = match;
      inputText.value = '';
    }
  }
}

// 发送消息
function handleSend() {
  const text = inputText.value.trim();
  if (!text || isAgentRunning.value) return;

  // 检查斜杠命令（带后续文本的情况：/skill-id 补充说明）
  let actualMessage = text;
  let activeSkill = selectedSkill.value;
  
  if (text.startsWith('/')) {
    const spaceIdx = text.indexOf(' ');
    const cmd = (spaceIdx > 0 ? text.substring(1, spaceIdx) : text.substring(1)).toLowerCase();
    const match = skills.value.find(s => s.id.toLowerCase() === cmd);
    if (match) {
      activeSkill = match;
      actualMessage = spaceIdx > 0 ? text.substring(spaceIdx + 1).trim() : match.description || match.name;
      if (!actualMessage) actualMessage = match.name;
    }
  }

  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: actualMessage,
    skillName: activeSkill?.name,
  });
  inputText.value = '';
  scrollToBottom();

  // 获取终端上下文
  const context = props.getTerminalContext?.() || '';

  // 通过 WebSocket 启动 Agent
  isAgentRunning.value = true;
  currentAssistantIdx = -1;

  emit('ws-send', {
    type: 'ai-agent-run',
    data: {
      aiSessionId: props.sessionId,
      message: actualMessage,
      context: context.substring(-3000),
      skillId: activeSkill?.id,
      locale: locale.value,
    },
  });

  // 发送后清除选中的 Skill
  selectedSkill.value = null;
}

function handleStop() {
  emit('ws-send', {
    type: 'ai-agent-stop',
    data: { aiSessionId: props.sessionId },
  });
}

function handleNewLine() {
  // Shift+Enter 换行
}

function handleClear() {
  if (messages.value.length === 0) return;
  messages.value = [];
  currentAssistantIdx = -1;
  // 通知服务端清空历史
  aiService.clearHistory(props.sessionId).catch(() => {});
}

// 保存对话显示历史到服务端
function saveDisplayHistory() {
  const toSave = messages.value.map(m => ({
    role: m.role,
    content: m.content,
    skillName: m.skillName,
    isSystemInfo: m.isSystemInfo,
    agentSteps: m.agentSteps?.filter(s => s.type === 'tool_call').map(s => ({
      type: 'tool_call' as const,
      tool: s.tool,
      args: s.args,
      result: s.result,
      collapsed: true,
    })),
  }));
  aiService.saveDisplayHistory(props.sessionId, toSave, props.sessionName).catch(() => {});
}

// 加载对话历史
async function loadDisplayHistory() {
  try {
    const data = await aiService.getDisplayHistory(props.sessionId);
    if (Array.isArray(data) && data.length > 0) {
      messages.value = data.map((m: any) => ({
        role: m.role,
        content: m.content,
        skillName: m.skillName,
        isSystemInfo: m.isSystemInfo,
        agentSteps: m.agentSteps?.map((s: any) => ({ ...s, collapsed: true })),
        isRunning: false,
      }));
      nextTick(() => scrollToBottom());
    } else {
      // 无历史消息时，主动获取系统环境信息并展示
      await fetchAndShowSystemInfo();
    }
  } catch (e) {
    console.warn('Failed to load display history:', e);
  }
}

/** 主动获取系统环境信息并展示为第一条消息 */
async function fetchAndShowSystemInfo() {
  try {
    const sysContext = await aiService.getSystemContext(props.sessionId);
    if (sysContext && typeof sysContext === 'string' && sysContext.trim()) {
      messages.value.push({
        role: 'assistant',
        content: sysContext,
        isSystemInfo: true,
        isRunning: false,
      });
      nextTick(() => scrollToBottom());
    }
  } catch (e) {
    console.warn('Failed to fetch system context:', e);
  }
}

// 历史对话面板
function toggleHistoryPanel() {
  showHistoryPanel.value = !showHistoryPanel.value;
  if (showHistoryPanel.value) {
    fetchHistoryList();
  }
}

async function fetchHistoryList() {
  try {
    const data = await aiService.listHistories();
    if (Array.isArray(data)) {
      historyList.value = data;
    }
  } catch (e) {
    console.warn('Failed to fetch history list:', e);
  }
}

async function loadPastHistory(targetSessionId: string) {
  try {
    const data = await aiService.loadHistory(targetSessionId);
    if (Array.isArray(data) && data.length > 0) {
      messages.value = data.map((m: any) => ({
        role: m.role,
        content: m.content,
        skillName: m.skillName,
        isSystemInfo: m.isSystemInfo,
        agentSteps: m.agentSteps?.map((s: any) => ({ ...s, collapsed: true })),
        isRunning: false,
      }));
      showHistoryPanel.value = false;
      nextTick(() => scrollToBottom());
    }
  } catch (e) {
    console.warn('Failed to load past history:', e);
  }
}

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('ai.justNow');
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function handleClose() {
  emit('close');
}

function handleOpenSettings() {
  emit('open-settings');
}

function toggleStep(step: AgentStep) {
  step.collapsed = !step.collapsed;
}

function getToolDisplayCmd(step: AgentStep): string {
  if (step.tool === 'execute_command' && step.args?.command) {
    const cmd = step.args.command;
    return cmd.length > 40 ? cmd.substring(0, 40) + '...' : cmd;
  }
  if (step.tool === 'read_terminal') {
    return 'read terminal output';
  }
  return step.tool || 'unknown';
}

// Markdown 渲染
function renderMarkdown(text: string): string {
  if (typeof text !== 'string') return String(text ?? '');
  if (!text) return '';

  // 先提取代码块，防止内部内容被误处理
  const codeBlocks: string[] = [];
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre class="code-block"><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`);
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // 处理表格
  html = html.replace(/((?:^|\n)\|.+\|(?:\n\|.+\|)+)/g, (tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return tableBlock;
    let table = '<table class="md-table">';
    rows.forEach((row, ri) => {
      // 跳过分隔行 (|---|---|)
      if (/^\|[\s\-:|]+\|$/.test(row.trim())) return;
      const cells = row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
      const tag = ri === 0 ? 'th' : 'td';
      table += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
    });
    table += '</table>';
    return '\n' + table + '\n';
  });

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // 粗体 / 斜体
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 无序列表
  html = html.replace(/(^|\n)((?:[-*] .+(?:\n|$))+)/g, (_, pre, block) => {
    const items = block.trim().split('\n')
      .map((l: string) => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
    return pre + `<ul>${items}</ul>`;
  });

  // 有序列表
  html = html.replace(/(^|\n)((?:\d+\. .+(?:\n|$))+)/g, (_, pre, block) => {
    const items = block.trim().split('\n')
      .map((l: string) => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return pre + `<ol>${items}</ol>`;
  });

  // 换行
  html = html.replace(/\n/g, '<br>');

  // 恢复代码块
  html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx)]);

  return html;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

/** 处理监控事件（由父组件调用） */
function handleMonitorEvent(event: any) {
  if (logMonitorRef.value) {
    logMonitorRef.value.handleMonitorEvent(event);
  }
}

watch(() => props.isOpen, (val) => {
  if (val) {
    nextTick(() => {
      inputRef.value?.focus();
      scrollToBottom();
    });
  }
});

// sessionId 变化时重新加载历史
watch(() => props.sessionId, () => {
  messages.value = [];
  currentAssistantIdx = -1;
  loadDisplayHistory();
});

onMounted(() => {
  if (props.isOpen) inputRef.value?.focus();
  loadSkills();
  loadDisplayHistory();
});

defineExpose({ handleAgentEvent, scrollToBottom, handleMonitorEvent });
</script>

<style scoped>
.ai-chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-dark);
  border-left: 1px solid var(--border-color);
}
.ai-chat-panel.collapsed { display: none; }

.ai-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(49, 50, 68, 0.5);
}

.btn-ai-action {
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}
.btn-ai-action:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}
.btn-ai-action.btn-stop { color: #f38ba8; }
.btn-ai-action.btn-stop:hover { color: #f38ba8; background: rgba(243, 139, 168, 0.1); }

.ai-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  text-align: center;
}
.ai-chat-empty p { margin-top: 12px; font-size: 13px; }

.ai-message {
  display: flex;
  gap: 12px;
  max-width: 100%;
}
.ai-message.user { flex-direction: row-reverse; }

.ai-message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
}
.ai-message.user .ai-message-avatar { background: var(--accent); color: white; }
.ai-message.assistant .ai-message-avatar { background: rgba(166, 227, 161, 0.2); color: #a6e3a1; }

.ai-message-content {
  max-width: calc(100% - 48px);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
}
.ai-message.user .ai-message-content {
  background: var(--accent);
  color: white;
  border-top-right-radius: 4px;
}
.ai-message.assistant .ai-message-content {
  background: rgba(69, 71, 90, 0.5);
  color: var(--text-primary);
  border-top-left-radius: 4px;
}

.ai-message-text :deep(.code-block) {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0;
  overflow-x: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}
.ai-message-text :deep(.inline-code) {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

/* Markdown 表格 */
.ai-message-text :deep(.md-table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 12px;
}
.ai-message-text :deep(.md-table th),
.ai-message-text :deep(.md-table td) {
  border: 1px solid rgba(255,255,255,0.1);
  padding: 5px 8px;
  text-align: left;
}
.ai-message-text :deep(.md-table th) {
  background: rgba(0,0,0,0.2);
  font-weight: 600;
  color: #89b4fa;
}
.ai-message-text :deep(.md-table tr:nth-child(even)) {
  background: rgba(255,255,255,0.02);
}

/* Markdown 标题 */
.ai-message-text :deep(h2) { font-size: 16px; font-weight: 600; margin: 12px 0 6px; }
.ai-message-text :deep(h3) { font-size: 14px; font-weight: 600; margin: 10px 0 4px; }
.ai-message-text :deep(h4) { font-size: 13px; font-weight: 600; margin: 8px 0 4px; }

/* Markdown 列表 */
.ai-message-text :deep(ul),
.ai-message-text :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}
.ai-message-text :deep(li) {
  margin: 2px 0;
}

/* 链接 */
.ai-message-text :deep(a) {
  color: #89b4fa;
  text-decoration: none;
}
.ai-message-text :deep(a:hover) {
  text-decoration: underline;
}

/* Agent 步骤样式 */
.agent-steps {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
}

.agent-step {
  border-radius: 4px;
  font-size: 12px;
}

.thinking-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(250, 176, 5, 0.08);
  border-radius: 4px;
  color: #fab387;
}
.thinking-step .step-label { font-size: 11px; }

.tool-call-step {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  overflow: hidden;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.step-header:hover { background: rgba(255, 255, 255, 0.04); }

.step-chevron { color: var(--text-secondary); font-size: 10px; width: 10px; }
.step-icon { color: #a6e3a1; font-size: 11px; }
.step-label { color: var(--text-secondary); font-size: 11px; white-space: nowrap; }
.step-cmd {
  color: #89b4fa;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.step-status {
  font-size: 11px;
  color: #a6e3a1;
  flex-shrink: 0;
  margin-left: auto;
}

.step-result {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 6px 8px;
  max-height: 150px;
  overflow-y: auto;
}
.step-result pre {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}

.ai-loading {
  display: flex;
  gap: 3px;
}
.ai-loading span {
  width: 6px;
  height: 6px;
  background: #fab387;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}
.ai-loading span:nth-child(1) { animation-delay: -0.32s; }
.ai-loading span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.ai-chat-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  background: rgba(49, 50, 68, 0.3);
}
.ai-chat-input textarea {
  flex: 1;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--text-primary);
  font-size: 13px;
  resize: none;
  min-height: 40px;
  max-height: 120px;
  outline: none;
  font-family: inherit;
}
.ai-chat-input textarea:focus { border-color: var(--accent); }
.ai-chat-input textarea:disabled { opacity: 0.6; }

.btn-send {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.15s;
  flex-shrink: 0;
}
.btn-send:hover:not(:disabled) { background: #7aa2f7; }
.btn-send:disabled { opacity: 0.5; cursor: not-allowed; }

/* Skills 按钮 */
.btn-skill-toggle {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.15s;
  flex-shrink: 0;
}
.btn-skill-toggle:hover { background: rgba(255, 255, 255, 0.1); color: #f9e2af; }
.btn-skill-toggle.active { color: #f9e2af; background: rgba(249, 226, 175, 0.1); }

/* Skills 面板 */
.skills-panel {
  border-top: 1px solid var(--border-color);
  background: rgba(30, 30, 46, 0.95);
  max-height: 200px;
  overflow-y: auto;
}
.skills-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.skills-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
}
.skill-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
}
.skill-item:hover { background: rgba(255,255,255,0.06); }
.skill-item.active { background: rgba(249, 226, 175, 0.1); border: 1px solid rgba(249, 226, 175, 0.2); }
.skill-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-primary);
}
.skill-item-header i { color: #f9e2af; font-size: 12px; }
.skill-name { font-weight: 500; }
.skill-source {
  font-size: 10px;
  color: var(--text-secondary);
  background: rgba(255,255,255,0.06);
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: auto;
}
.skill-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 3px;
  padding-left: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.skills-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
}

/* 已选 Skill 栏 */
.selected-skill-bar {
  padding: 4px 16px 0;
  background: rgba(49, 50, 68, 0.3);
}
.selected-skill-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px 3px 10px;
  background: rgba(249, 226, 175, 0.12);
  border: 1px solid rgba(249, 226, 175, 0.25);
  border-radius: 12px;
  font-size: 12px;
  color: #f9e2af;
}
.selected-skill-tag i { font-size: 11px; }
.skill-remove {
  background: none;
  border: none;
  color: rgba(249, 226, 175, 0.6);
  cursor: pointer;
  padding: 0 2px;
  font-size: 13px;
  line-height: 1;
  display: flex;
  align-items: center;
}
.skill-remove:hover { color: #f9e2af; }

/* Skill 徽章在用户消息中 */
.skill-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(255,255,255,0.15);
  border-radius: 10px;
  font-size: 11px;
  margin-bottom: 6px;
  color: rgba(255,255,255,0.9);
}
.skill-badge i { font-size: 10px; color: #f9e2af; }

/* 历史对话面板 */
.history-panel {
  border-top: 1px solid var(--border-color);
  background: rgba(30, 30, 46, 0.95);
  max-height: 240px;
  overflow-y: auto;
}
.history-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.history-list {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}
.history-item {
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.12s;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.history-item:hover { background: rgba(255,255,255,0.06); }
.history-item:last-child { border-bottom: none; }
.history-item-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3px;
}
.history-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}
.history-time {
  font-size: 10px;
  color: var(--text-secondary);
}
.history-preview {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-meta {
  font-size: 10px;
  color: rgba(255,255,255,0.3);
  margin-top: 2px;
}
.history-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
}

.btn-ai-action.active {
  color: #89b4fa;
  background: rgba(137, 180, 250, 0.1);
}

/* Tab 切换栏 */
.ai-tab-bar {
  display: flex;
  gap: 2px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 2px;
}
.ai-tab {
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
  white-space: nowrap;
}
.ai-tab:hover { color: var(--text-primary); }
.ai-tab.active {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}
.ai-tab i { font-size: 12px; }

/* 审计面板包装器 */
.ai-audit-wrapper {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 系统信息消息 */
.ai-message.system-info .ai-message-avatar i {
  color: #89b4fa;
}
.ai-message.system-info .ai-message-content {
  background: rgba(137, 180, 250, 0.06);
  border: 1px solid rgba(137, 180, 250, 0.15);
}
.ai-message.system-info .ai-message-text {
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--text-secondary);
}
</style>
