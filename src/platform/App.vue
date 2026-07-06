<template>
  <router-view />
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { publish } from '@/base/eventBus';
import { toast } from '@/utils/toast';

const { t } = useI18n();

let unsubscribeUpdate: (() => void) | null = null;
let unsubscribeMenu: (() => void) | null = null;

onMounted(() => {
  // 仅在 Electron 环境中监听更新事件
  if (!window.electronAPI?.updater) return;

  unsubscribeUpdate = window.electronAPI.updater.onEvent((msg: any) => {
    const { event, data } = msg;
    if (event === 'available' && data?.version) {
      const version = data.version;
      const downloadUrl = data.downloadUrl || 'https://github.com/fefeding/ai-cmd/releases/latest';
      toast.info(
        t('update.available', { version }),
        t('update.newVersion'),
        8000
      );
    }
  });

  // 监听菜单操作
  unsubscribeMenu = window.electronAPI.updater.onMenuAction((action: string) => {
    if (action === 'check-update') {
      window.electronAPI?.updater?.checkForUpdates();
    } else if (action === 'new-connection') {
      publish('MENU_NEW_CONNECTION');
    }
  });
});

onBeforeUnmount(() => {
  unsubscribeUpdate?.();
  unsubscribeMenu?.();
});
</script>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
