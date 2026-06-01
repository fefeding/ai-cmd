<template>
  <!-- 更新通知栏 -->
  <div v-if="updateState.showBanner" class="update-banner" :class="updateState.status">
    <div class="update-banner-content">
      <i class="bi" :class="updateBannerIcon"></i>
      <span class="update-banner-text">{{ updateBannerText }}</span>
      <button v-if="updateState.status === 'downloaded'" class="update-btn" @click="handleInstallUpdate">
        {{ t('update.restart') }}
      </button>
      <button v-else-if="updateState.status === 'available'" class="update-btn update-btn-secondary" @click="handleDismiss">
        {{ t('update.later') }}
      </button>
    </div>
    <button class="update-banner-close" @click="handleDismiss">
      <i class="bi bi-x"></i>
    </button>
  </div>

  <router-view />
</template>

<script lang="ts" setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// 更新状态
const updateState = reactive({
  showBanner: false,
  status: '' as '' | 'available' | 'progress' | 'downloaded' | 'error',
  version: '',
  percent: 0,
});

let unsubscribeUpdate: (() => void) | null = null;
let unsubscribeMenu: (() => void) | null = null;

const updateBannerIcon = computed(() => {
  switch (updateState.status) {
    case 'available': return 'bi-cloud-arrow-down';
    case 'progress': return 'bi-arrow-repeat';
    case 'downloaded': return 'bi-check-circle';
    case 'error': return 'bi-exclamation-triangle';
    default: return 'bi-info-circle';
  }
});

const updateBannerText = computed(() => {
  switch (updateState.status) {
    case 'available': return t('update.available', { version: updateState.version });
    case 'progress': return t('update.downloading', { percent: updateState.percent });
    case 'downloaded': return t('update.downloaded', { version: updateState.version });
    case 'error': return t('update.error');
    default: return '';
  }
});

function handleInstallUpdate() {
  window.electronAPI?.updater?.install();
}

function handleDismiss() {
  updateState.showBanner = false;
}

onMounted(() => {
  // 仅在 Electron 环境中监听更新事件
  if (!window.electronAPI?.updater) return;

  unsubscribeUpdate = window.electronAPI.updater.onEvent((msg: any) => {
    const { event, data } = msg;
    switch (event) {
      case 'available':
        updateState.status = 'available';
        updateState.version = data?.version || '';
        updateState.showBanner = true;
        break;
      case 'progress':
        updateState.status = 'progress';
        updateState.percent = data?.percent || 0;
        updateState.showBanner = true;
        break;
      case 'downloaded':
        updateState.status = 'downloaded';
        updateState.version = data?.version || '';
        updateState.showBanner = true;
        break;
      case 'not-available':
        // 已是最新版，不显示
        break;
      case 'error':
        console.error('[Update] Error:', data?.message);
        break;
    }
  });

  // 监听菜单 "Check for Updates" 操作
  unsubscribeMenu = window.electronAPI.updater.onMenuAction((action: string) => {
    if (action === 'check-update') {
      window.electronAPI?.updater?.checkForUpdates();
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

/* 更新通知栏 */
.update-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 13px;
  color: #cdd6f4;
  background: linear-gradient(90deg, #1e1e2e 0%, #313244 100%);
  border-bottom: 1px solid rgba(137, 180, 250, 0.2);
  animation: slideDown 0.3s ease;
}

.update-banner.available { border-bottom-color: rgba(137, 180, 250, 0.3); }
.update-banner.progress { border-bottom-color: rgba(249, 226, 175, 0.3); }
.update-banner.downloaded { border-bottom-color: rgba(166, 227, 161, 0.3); }

.update-banner-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.update-banner i { font-size: 14px; }
.update-banner.available i { color: #89b4fa; }
.update-banner.progress i { color: #f9e2af; animation: spin 1s linear infinite; }
.update-banner.downloaded i { color: #a6e3a1; }

.update-banner-text { flex: 1; }

.update-btn {
  padding: 3px 12px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  background: #a6e3a1;
  color: #1e1e2e;
  transition: opacity 0.15s;
}
.update-btn:hover { opacity: 0.85; }

.update-btn-secondary {
  background: rgba(255,255,255,0.1);
  color: #cdd6f4;
}

.update-banner-close {
  background: none;
  border: none;
  color: #6c7086;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  border-radius: 4px;
}
.update-banner-close:hover { color: #cdd6f4; background: rgba(255,255,255,0.1); }

@keyframes slideDown {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
