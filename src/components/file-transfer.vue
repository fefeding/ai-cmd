<template>
  <div v-if="visible" ref="widgetRef" class="file-transfer-widget" :class="{ collapsed: isCollapsed, dragging: isWidgetDragging }" :style="dragStyle">
    <!-- 标题栏（拖拽手柄） -->
    <div class="ft-header" @mousedown="onDragStart" @dblclick="isCollapsed = !isCollapsed">
      <span class="ft-title">
        <i class="bi bi-cloud-arrow-up me-1"></i>
        <template v-if="transferring">
          {{ t('fileTransfer.transferring') }}
        </template>
        <template v-else-if="transferHistory.length > 0">
          {{ t('fileTransfer.title') }} ({{ transferHistory.length }})
        </template>
        <template v-else>
          {{ t('fileTransfer.title') }}
        </template>
      </span>
      <div class="ft-header-actions">
        <button class="ft-btn-icon" @click.stop="isCollapsed = !isCollapsed" :title="isCollapsed ? '展开' : '收起'">
          <i :class="isCollapsed ? 'bi bi-chevron-up' : 'bi bi-chevron-down'"></i>
        </button>
        <button class="ft-btn-icon" @click.stop="handleClose" :title="t('common.close')">
          <i class="bi bi-x"></i>
        </button>
      </div>
    </div>

    <!-- 可折叠内容区 -->
    <div v-show="!isCollapsed" class="ft-body">
      <!-- 操作选择（自动模式时隐藏） -->
      <div v-if="!zmodemAutoMode" class="d-flex gap-2 mb-2">
        <button
          class="btn btn-sm flex-fill"
          :class="mode === 'upload' ? 'btn-primary' : 'btn-outline-secondary'"
          @click="mode = 'upload'"
        >
          <i class="bi bi-upload me-1"></i>{{ t('fileTransfer.upload') }}
        </button>
        <button
          class="btn btn-sm flex-fill"
          :class="mode === 'download' ? 'btn-primary' : 'btn-outline-secondary'"
          @click="mode = 'download'"
        >
          <i class="bi bi-download me-1"></i>{{ t('fileTransfer.download') }}
        </button>
      </div>

      <!-- 上传模式 -->
      <div v-if="mode === 'upload'">
        <div
          class="drop-zone"
          :class="{ dragging: isDragging }"
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop.prevent="handleDrop"
          @click="triggerFileInput"
        >
          <i class="bi bi-cloud-upload" style="font-size: 20px;"></i>
          <span class="ms-2">{{ t('fileTransfer.dropZone') }}</span>
        </div>
        <input
          ref="fileInput"
          type="file"
          multiple
          style="display: none;"
          @change="handleFileSelect"
        >
      </div>

      <!-- 下载模式 -->
      <div v-if="mode === 'download'">
        <div v-if="zmodemAutoMode" class="text-center py-2">
          <div class="spinner-border spinner-border-sm text-primary me-2"></div>
          {{ t('fileTransfer.waitingForFiles') }}
        </div>
        <div v-else class="mb-2">
          <input
            type="text"
            class="form-control form-control-sm"
            v-model="remoteFilePath"
            :placeholder="t('fileTransfer.remotePathPlaceholder')"
            style="background: #313244; border-color: #45475a; color: var(--text-primary);"
          >
          <button
            class="btn btn-primary btn-sm w-100 mt-2"
            :disabled="!remoteFilePath || transferring"
            @click="startManualDownload"
          >
            <i class="bi bi-download me-1"></i>{{ t('fileTransfer.startDownload') }}
          </button>
        </div>
      </div>

      <!-- 传输进度 -->
      <div v-if="transferring || transferHistory.length > 0" class="mt-2">
        <div class="transfer-list">
          <!-- 当前传输 -->
          <div v-if="currentProgress" class="transfer-item">
            <div class="d-flex align-items-center justify-content-between mb-1">
              <span class="text-truncate" style="font-size: 12px;">
                <i :class="currentProgress.direction === 'upload' ? 'bi bi-upload' : 'bi bi-download'" class="me-1"></i>
                {{ currentProgress.fileName }}
              </span>
              <span style="font-size: 11px; color: var(--text-secondary);">
                {{ formatSize(currentProgress.bytesSent) }} / {{ formatSize(currentProgress.bytesTotal) }}
              </span>
            </div>
            <div class="progress" style="height: 3px;">
              <div
                class="progress-bar"
                :class="currentProgress.state === 'error' ? 'bg-danger' : 'bg-primary'"
                :style="{ width: currentProgress.percent + '%' }"
              ></div>
            </div>
            <div v-if="currentProgress.state === 'error'" class="text-danger" style="font-size: 11px;">
              {{ t('fileTransfer.transferFailed') }}
            </div>
          </div>

          <!-- 历史记录 -->
          <div
            v-for="(item, idx) in transferHistory"
            :key="idx"
            class="transfer-item"
          >
            <div class="d-flex align-items-center justify-content-between">
              <span class="text-truncate" style="font-size: 12px;">
                <i :class="item.direction === 'upload' ? 'bi bi-upload' : 'bi bi-download'" class="me-1"></i>
                {{ item.fileName }}
              </span>
              <span style="font-size: 11px;" :class="item.state === 'complete' ? 'text-success' : 'text-danger'">
                {{ item.state === 'complete' ? t('fileTransfer.complete') : t('fileTransfer.failed') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 取消按钮 -->
      <div v-if="transferring" class="mt-2 text-center">
        <button class="btn btn-outline-danger btn-sm" @click="cancelTransfer">
          <i class="bi bi-x-circle me-1"></i>{{ t('fileTransfer.cancelTransfer') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Zmodem, formatFileSize, type ZmodemProgress } from '@/utils/zmodem';
import { toast } from '@/utils/toast';

const { t } = useI18n();

const fileInput = ref<HTMLInputElement>();
const widgetRef = ref<HTMLElement>();
const visible = ref(false);
const isCollapsed = ref(false);

// 拖拽状态
const dragPos = ref({ x: 0, y: 0 });
const isMoved = ref(false);
const isWidgetDragging = ref(false);
const dragStyle = computed(() => {
  if (!isMoved.value) return {}; // 默认用 CSS 定位
  return { left: `${dragPos.value.x}px`, top: `${dragPos.value.y}px`, bottom: 'auto', right: 'auto' };
});

let dragStartX = 0, dragStartY = 0, dragStartLeft = 0, dragStartTop = 0;

function onDragStart(e: MouseEvent) {
  // 只在左键拖拽，忽略按钮点击
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest('.ft-btn-icon')) return; // 点击按钮不触发拖拽

  e.preventDefault();
  const el = widgetRef.value!;
  const rect = el.getBoundingClientRect();
  const parentRect = el.parentElement!.getBoundingClientRect();

  // 首次拖拽时从 bottom/right 转为 left/top
  if (!isMoved.value) {
    dragPos.value = { x: rect.left - parentRect.left, y: rect.top - parentRect.top };
    isMoved.value = true;
  }

  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartLeft = dragPos.value.x;
  dragStartTop = dragPos.value.y;
  isWidgetDragging.value = true;

  const onMouseMove = (ev: MouseEvent) => {
    const dx = ev.clientX - dragStartX;
    const dy = ev.clientY - dragStartY;
    dragPos.value = { x: dragStartLeft + dx, y: dragStartTop + dy };
  };
  const onMouseUp = () => {
    isWidgetDragging.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}
const mode = ref<'upload' | 'download'>('upload');
const isDragging = ref(false);
const remoteFilePath = ref('');
const transferring = ref(false);
const currentProgress = ref<ZmodemProgress | null>(null);
const transferHistory = ref<ZmodemProgress[]>([]);

let zmodemSession: any = null;
let zmodemAutoMode = ref(false);
let activeTermRef: any = null;
let activeTabId: string | null = null;

/**
 * 向终端发送数据（自动附带正确的 sessionId）
 */
function sendToTerm(data: string) {
  if (!activeTermRef) return;
  const sid = activeTermRef.sessionId;
  activeTermRef.sendToServer({
    type: 'terminal',
    sessionId: sid || undefined,
    data,
  });
}

/**
 * 注册接收文件的 session 事件处理器
 */
function setupReceiveHandlers(session: any) {
  session.on('offer', (offer: any) => {
    handleFileOffer(offer);
  });
  session.on('session_end', () => {
    console.log('[FileTransfer] Receive session ended');
    transferring.value = false;
    currentProgress.value = null;
    // 自动折叠
    setTimeout(() => {
      if (!transferring.value) {
        isCollapsed.value = true;
      }
    }, 800);
  });
}

/**
 * 显示文件传输面板
 * @param tabId 当前 tab ID
 * @param termRef 终端组件引用
 * @param info ZMODEM session 信息 { role, session, offer? }
 */
function show(tabId: string, termRef: any, info?: any) {
  activeTabId = tabId;
  activeTermRef = termRef;
  currentProgress.value = null;
  transferHistory.value = [];
  transferring.value = false;
  zmodemAutoMode.value = false;
  visible.value = true;
  isCollapsed.value = false;

  if (info && info.session) {
    zmodemSession = info.session;
    const role = info.role;
    console.log('[FileTransfer] ZMODEM session ready, role:', role);

    if (role === 'send') {
      mode.value = 'upload';
      zmodemAutoMode.value = true;
      info.markHandlersReady?.();
    } else if (role === 'receive') {
      mode.value = 'download';
      zmodemAutoMode.value = true;
      setupReceiveHandlers(zmodemSession);
      info.markHandlersReady?.();

      zmodemSession.start?.().then((offerOrUndefined: any) => {
        if (offerOrUndefined && typeof offerOrUndefined.accept === 'function') {
          console.log('[FileTransfer] start() returned offer, handling directly');
          handleFileOffer(offerOrUndefined);
        } else {
          console.log('[FileTransfer] start() resolved without offer (ZFIN)');
        }
      }).catch((err: any) => {
        console.warn('[FileTransfer] session.start() error:', err);
        toast.error(t('fileTransfer.downloadFailed'));
      });
    }
  } else {
    zmodemSession = null;
    mode.value = 'upload';
  }
}

function handleClose() {
  if (transferring.value) {
    cancelTransfer();
  } else {
    if (activeTermRef) {
      const termRef = activeTermRef;
      const sid = termRef.sessionId;
      const sendAbort = (data: string) => {
        termRef.sendToServer({ type: 'terminal', sessionId: sid || undefined, data });
      };
      sendAbort('\x18\x18\x18\x18\x18');
      setTimeout(() => sendAbort('\x03'), 100);
      setTimeout(() => sendAbort('\x03'), 300);
    }
    if (zmodemSession) {
      try { zmodemSession.abort?.(); } catch (e) { /* ignore */ }
      zmodemSession = null;
    }
  }
  visible.value = false;
  activeTermRef = null;
  activeTabId = null;
}

function triggerFileInput() {
  fileInput.value?.click();
}

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (files?.length) {
    startUpload(Array.from(files));
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) {
    startUpload(Array.from(input.files));
    input.value = '';
  }
}

/**
 * 上传文件 - 通过 HTTP POST + SFTP 直传
 */
async function startUpload(files: File[]) {
  if (!activeTermRef) {
    toast.error(t('fileTransfer.terminalNotConnected'));
    return;
  }

  transferring.value = true;

  try {
    if (zmodemSession) {
      try { zmodemSession.abort?.(); } catch (e) { /* ignore */ }
      zmodemSession = null;
    }

    sendToTerm('\x03');
    await new Promise(r => setTimeout(r, 300));
    sendToTerm('\x03');
    await new Promise(r => setTimeout(r, 200));
    sendToTerm('\x15');
    await new Promise(r => setTimeout(r, 100));

    for (const file of files) {
      currentProgress.value = {
        direction: 'upload',
        fileName: file.name,
        bytesSent: 0,
        bytesTotal: file.size,
        percent: 0,
        state: 'transferring',
      };

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const sid = activeTermRef.sessionId;

      console.log(`[FileTransfer] HTTP upload: ${file.name} -> ${safeName}, size=${file.size}, sessionId=${sid}`);

      currentProgress.value = {
        direction: 'upload',
        fileName: file.name,
        bytesSent: Math.floor(file.size * 0.1),
        bytesTotal: file.size,
        percent: 10,
        state: 'transferring',
      };

      const result = await httpFileUpload(file, safeName, sid);

      if (result.success) {
        currentProgress.value = {
          direction: 'upload',
          fileName: file.name,
          bytesSent: file.size,
          bytesTotal: file.size,
          percent: 100,
          state: 'transferring',
        };

        transferHistory.value.unshift({
          direction: 'upload',
          fileName: file.name,
          bytesSent: file.size,
          bytesTotal: file.size,
          percent: 100,
          state: 'complete',
        });
      } else {
        throw new Error(result.error || 'Upload failed');
      }

      currentProgress.value = null;
    }

    transferring.value = false;
    toast.success(t('fileTransfer.uploadComplete'));

    // 上传完成后自动折叠
    setTimeout(() => {
      if (!transferring.value) {
        isCollapsed.value = true;
      }
    }, 800);
  } catch (error: any) {
    console.error('[FileTransfer] Upload error:', error);
    if (currentProgress.value) {
      transferHistory.value.unshift({ ...currentProgress.value, state: 'error' });
    }
    currentProgress.value = null;
    transferring.value = false;
    zmodemSession = null;
    toast.error(error.message || t('fileTransfer.uploadFailed'));
  }
}

/**
 * 通过 HTTP POST 上传文件到服务端
 */
async function httpFileUpload(
  file: File,
  remoteName: string,
  sessionId: string | null
): Promise<{ success: boolean; bytes?: number; error?: string }> {
  try {
    console.log(`[FileTransfer] POST /api/file-upload, size=${file.size}`);
    const resp = await fetch('/api/file-upload', {
      method: 'POST',
      headers: {
        'X-Session-Id': sessionId || '',
        'X-File-Name': remoteName,
        'Content-Type': 'application/octet-stream',
      },
      body: file,
    });
    const data = await resp.json();
    console.log(`[FileTransfer] HTTP upload result:`, data);
    return data;
  } catch (err: any) {
    console.error(`[FileTransfer] HTTP upload error:`, err);
    return { success: false, error: err.message || 'HTTP upload failed' };
  }
}

/**
 * 处理下载的文件 offer (sz)
 */
function handleFileOffer(offer: any) {
  const details = offer.get_details();
  const fileName = details.name;
  const fileSize = details.size || 0;

  console.log('[FileTransfer] Handling file offer:', fileName, fileSize, 'bytes');
  transferring.value = true;

  currentProgress.value = {
    direction: 'download',
    fileName,
    bytesSent: 0,
    bytesTotal: fileSize,
    percent: 0,
    state: 'transferring',
  };

  let receivedBytes = 0;
  offer.on('input', (payload: any) => {
    receivedBytes += payload.length;
    currentProgress.value = {
      direction: 'download',
      fileName,
      bytesSent: receivedBytes,
      bytesTotal: fileSize,
      percent: fileSize > 0 ? Math.round((receivedBytes / fileSize) * 100) : 0,
      state: 'transferring',
    };
  });

  offer.accept().then((packets: any[]) => {
    console.log('[FileTransfer] File received:', fileName, packets?.length, 'packets');
    if (packets && packets.length > 0) {
      Zmodem.Browser.save_to_disk(packets, fileName);
    }
    transferHistory.value.unshift({
      direction: 'download',
      fileName,
      bytesSent: fileSize,
      bytesTotal: fileSize,
      percent: 100,
      state: 'complete',
    });
    currentProgress.value = null;
    transferring.value = false;
    toast.success(t('fileTransfer.downloadComplete'));

    setTimeout(() => {
      if (!transferring.value) {
        isCollapsed.value = true;
      }
    }, 2000);
  }).catch((err: any) => {
    console.error('[FileTransfer] Offer accept error:', err);
    if (currentProgress.value) {
      transferHistory.value.unshift({ ...currentProgress.value, state: 'error' });
    }
    currentProgress.value = null;
    transferring.value = false;
    toast.error(err.message || t('fileTransfer.downloadFailed'));
  });
}

/**
 * 手动下载（非 ZMODEM 自动检测）
 */
function startManualDownload() {
  if (!remoteFilePath.value) {
    toast.warning(t('fileTransfer.remotePathRequired'));
    return;
  }
  if (activeTermRef) {
    const cmd = `sz ${remoteFilePath.value}\n`;
    activeTermRef.sendToServer?.({ type: 'terminal', sessionId: undefined, data: cmd });
    toast.info(t('fileTransfer.startDownload'));
  }
  isCollapsed.value = true;
}

function cancelTransfer() {
  if (activeTermRef) {
    const termRef = activeTermRef;
    const sid = termRef.sessionId;
    const sendAbort = (data: string) => {
      termRef.sendToServer({ type: 'terminal', sessionId: sid || undefined, data });
    };
    sendAbort('\x18\x18\x18\x18\x18');
    setTimeout(() => sendAbort('\x03'), 100);
    setTimeout(() => sendAbort('\x03'), 300);
  }
  if (zmodemSession) {
    try { zmodemSession.abort?.(); } catch (e) { /* ignore */ }
  }
  transferring.value = false;
  if (currentProgress.value) {
    transferHistory.value.unshift({ ...currentProgress.value, state: 'error' });
  }
  currentProgress.value = null;
  zmodemSession = null;
}

function formatSize(bytes: number): string {
  return formatFileSize(bytes);
}

defineExpose({ show });
</script>

<style scoped>
.file-transfer-widget {
  position: absolute;
  bottom: 12px;
  right: 12px;
  width: 300px;
  background: rgba(30, 30, 46, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 30;
  overflow: hidden;
  backdrop-filter: blur(12px);
  font-size: 13px;
}

.file-transfer-widget.collapsed {
  width: 200px;
}

.file-transfer-widget.dragging {
  pointer-events: none; /* 拖拽时禁止子元素捕获事件，避免干扰文件拖放 */
  opacity: 0.85;
}

.ft-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  cursor: grab;
  user-select: none;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ft-header:active {
  cursor: grabbing;
}

.ft-title {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #cdd6f4);
}

.ft-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ft-btn-icon {
  background: none;
  border: none;
  color: var(--text-secondary, #a6adc8);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ft-btn-icon:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #cdd6f4);
}

.ft-body {
  padding: 10px;
}

.drop-zone {
  border: 2px dashed #45475a;
  border-radius: 6px;
  padding: 14px 10px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary, #a6adc8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.drop-zone:hover,
.drop-zone.dragging {
  border-color: var(--accent, #89b4fa);
  background-color: rgba(137, 180, 250, 0.05);
  color: var(--text-primary, #cdd6f4);
}

.transfer-list {
  max-height: 140px;
  overflow-y: auto;
}

.transfer-item {
  padding: 6px 8px;
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.03);
  margin-bottom: 4px;
}
</style>
