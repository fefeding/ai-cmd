<template>
  <div class="vscode-term-root" style="height: 100vh; overflow: hidden;">
    <RdpTab
      v-if="connection?.type === 'rdp'"
      :tabId="tabId"
      :connection="connection"
      :active="true"
    />
    <TerminalTab
      v-else
      :tabId="tabId"
      :connection="connection"
      :active="true"
      @open-ai-settings="aiSettingsRef?.open()"
      @status-change="onStatusChange"
    />
    <AISettings ref="aiSettingsRef" />
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import TerminalTab from '@/components/terminal-tab.vue';
import RdpTab from '@/components/rdp-tab.vue';
import AISettings from '@/components/ai-settings/index.vue';

defineProps<{ tabId: string; connection: any }>();

const aiSettingsRef = ref<InstanceType<typeof AISettings>>();

// 把本标签实际连接的会话 id 上报给扩展宿主：「在终端执行选中内容」需要精确命中
// 当前面板的会话，同一连接开多个标签时不能只按 connectionId 取最新会话。
function onStatusChange(status: string, sessionId?: string): void {
  const sid = status === 'connected' && sessionId ? sessionId : '';
  try {
    window.parent?.postMessage({ type: 'aicmd-session-active', sessionId: sid }, '*');
  } catch { /* ignore */ }
}
</script>
