<template>
  <div class="vscode-term-root" style="height: 100vh; overflow: hidden;">
    <TerminalTab
      :tabId="tabId"
      :connection="connection"
      :active="true"
      @open-ai-settings="aiSettingsRef?.open()"
    />
    <AISettings ref="aiSettingsRef" />
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import TerminalTab from '@/components/terminal-tab.vue';
import AISettings from '@/components/ai-settings/index.vue';

defineProps<{ tabId: string; connection: any }>();

const aiSettingsRef = ref<InstanceType<typeof AISettings>>();
</script>
