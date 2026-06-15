<template>
  <!-- 更新通知卡片 - 右下角浮动 -->
  <Transition name="update-slide">
    <div v-if="updateState.showBanner" class="update-card" :class="updateState.status">
      <!-- 顶部标题栏 -->
      <div class="update-card-header">
        <div class="update-card-title">
          <i class="bi" :class="updateCardIcon"></i>
          <span>{{ updateCardTitle }}</span>
        </div>
        <button class="update-card-close" @click="handleDismiss" :title="t('common.close')">
          <i class="bi bi-x"></i>
        </button>
      </div>

      <!-- 内容区 -->
      <div class="update-card-body">
        <!-- 发现新版本 -->
        <template v-if="updateState.status === 'available'">
          <div class="update-version-info">
            <span class="update-version-badge">v{{ updateState.version }}</span>
          </div>
          <div class="update-card-desc">{{ t('update.availableDesc') }}</div>
          <div class="update-card-actions">
            <button class="update-btn update-btn-secondary" @click="handleDismiss">
              {{ t('update.later') }}
            </button>
          </div>
        </template>

        <!-- 下载中 -->
        <template v-else-if="updateState.status === 'progress'">
          <div class="update-progress-section">
            <div class="update-progress-header">
              <span class="update-progress-label">{{ t('update.downloading') }}</span>
              <span class="update-progress-percent">{{ updateState.percent }}%</span>
            </div>
            <div class="update-progress-bar">
              <div class="update-progress-fill" :style="{ width: updateState.percent + '%' }"></div>
            </div>
            <div class="update-progress-detail">
              <span>{{ formatBytes(updateState.transferred) }}</span>
              <span>/ {{ formatBytes(updateState.total) }}</span>
              <span v-if="updateState.speed"> · {{ formatBytes(updateState.speed) }}/s</span>
            </div>
          </div>
        </template>

        <!-- 下载完成 -->
        <template v-else-if="updateState.status === 'downloaded'">
          <div class="update-version-info">
            <span class="update-version-badge">v{{ updateState.version }}</span>
          </div>
          <div class="update-card-desc">{{ t('update.downloadedDesc') }}</div>
          <div class="update-card-actions">
            <button class="update-btn update-btn-secondary" @click="handleDismiss">
              {{ t('update.later') }}
            </button>
            <button class="update-btn" @click="handleInstallUpdate">
              <i class="bi bi-arrow-clockwise me-1"></i>{{ t('update.restart') }}
            </button>
          </div>
        </template>

        <!-- 错误 -->
        <template v-else-if="updateState.status === 'error'">
          <div class="update-card-desc update-error-text">{{ updateState.errorMessage || t('update.error') }}</div>
          <div class="update-card-actions">
            <button class="update-btn update-btn-secondary" @click="handleDismiss">
              {{ t('common.close') }}
            </button>
            <button class="update-btn" @click="handleRetryUpdate">
              <i class="bi bi-arrow-clockwise me-1"></i>{{ t('update.retry') }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Transition>

  <router-view />
</template>

<script lang="ts" setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { publish } from '@/base/eventBus';

const { t } = useI18n();

// 更新状态
const updateState = reactive({
  showBanner: false,
  status: '' as '' | 'available' | 'progress' | 'downloaded' | 'error',
  version: '',
  percent: 0,
  transferred: 0,
  total: 0,
  speed: 0,
  errorMessage: '',
});

let unsubscribeUpdate: (() => void) | null = null;
let unsubscribeMenu: (() => void) | null = null;

const updateCardIcon = computed(() => {
  switch (updateState.status) {
    case 'available': return 'bi-cloud-arrow-down';
    case 'progress': return 'bi-arrow-repeat';
    case 'downloaded': return 'bi-check-circle-fill';
    case 'error': return 'bi-exclamation-triangle-fill';
    default: return 'bi-info-circle';
  }
});

const updateCardTitle = computed(() => {
  switch (updateState.status) {
    case 'available': return t('update.newVersion');
    case 'progress': return t('update.downloadingTitle');
    case 'downloaded': return t('update.readyToInstall');
    case 'error': return t('update.updateFailed');
    default: return '';
  }
});

/** 格式化字节大小 */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return val >= 10 ? `${Math.round(val)} ${units[i]}` : `${val.toFixed(1)} ${units[i]}`;
}

function handleInstallUpdate() {
  window.electronAPI?.updater?.install();
}

function handleDismiss() {
  updateState.showBanner = false;
}

function handleRetryUpdate() {
  updateState.showBanner = false;
  window.electronAPI?.updater?.checkForUpdates();
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
        updateState.transferred = data?.transferred || 0;
        updateState.total = data?.total || 0;
        updateState.speed = data?.bytesPerSecond || 0;
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
        updateState.status = 'error';
        updateState.errorMessage = data?.message || '';
        updateState.showBanner = true;
        break;
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

/* 更新通知卡片 - 右下角浮动 */
.update-card {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 10000;
  width: 320px;
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
  color: #cdd6f4;
  background: #1e1e2e;
  border: 1px solid rgba(137, 180, 250, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
}

.update-card.available { border-color: rgba(137, 180, 250, 0.3); }
.update-card.progress { border-color: rgba(249, 226, 175, 0.3); }
.update-card.downloaded { border-color: rgba(166, 227, 161, 0.3); }
.update-card.error { border-color: rgba(243, 139, 168, 0.3); }

.update-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.update-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
}

.update-card.available .update-card-title { color: #89b4fa; }
.update-card.progress .update-card-title { color: #f9e2af; }
.update-card.progress .update-card-title i { animation: spin 1s linear infinite; }
.update-card.downloaded .update-card-title { color: #a6e3a1; }
.update-card.error .update-card-title { color: #f38ba8; }

.update-card-close {
  background: none;
  border: none;
  color: #6c7086;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  border-radius: 4px;
  line-height: 1;
}
.update-card-close:hover { color: #cdd6f4; background: rgba(255,255,255,0.1); }

.update-card-body {
  padding: 10px 12px 12px;
}

.update-version-info {
  margin-bottom: 6px;
}

.update-version-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  background: rgba(137, 180, 250, 0.15);
  color: #89b4fa;
}
.update-card.downloaded .update-version-badge {
  background: rgba(166, 227, 161, 0.15);
  color: #a6e3a1;
}

.update-card-desc {
  font-size: 12px;
  color: #a6adc8;
  line-height: 1.5;
  margin-bottom: 8px;
}

.update-error-text {
  color: #f38ba8;
}

.update-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

/* 进度条 */
.update-progress-section {
  padding: 2px 0;
}

.update-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.update-progress-label {
  font-size: 12px;
  color: #a6adc8;
}

.update-progress-percent {
  font-size: 14px;
  font-weight: 700;
  color: #f9e2af;
  font-variant-numeric: tabular-nums;
}

.update-progress-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.update-progress-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #f9e2af, #fab387);
  transition: width 0.3s ease;
}

.update-progress-detail {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: #6c7086;
  font-variant-numeric: tabular-nums;
}

/* 按钮 */
.update-btn {
  padding: 5px 14px;
  font-size: 12px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  background: #a6e3a1;
  color: #1e1e2e;
  transition: opacity 0.15s;
  display: inline-flex;
  align-items: center;
}
.update-btn:hover { opacity: 0.85; }

.update-btn-secondary {
  background: rgba(255,255,255,0.08);
  color: #a6adc8;
}
.update-btn-secondary:hover { color: #cdd6f4; background: rgba(255,255,255,0.12); }

/* 动画 */
.update-slide-enter-active { animation: slideInRight 0.35s ease; }
.update-slide-leave-active { animation: slideOutRight 0.25s ease; }

@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOutRight {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
