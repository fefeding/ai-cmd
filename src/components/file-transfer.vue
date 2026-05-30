<template>
  <Modal
    ref="modalRef"
    :title="t('fileTransfer.title')"
    :closeButton="{ text: t('common.close'), show: true }"
    :confirmButton="{ text: '', show: false }"
    :style="{ maxWidth: '500px', width: '100%' }"
    @onHidden="handleClose"
  >
    <div class="file-transfer-body">
      <!-- 操作选择（自动模式时隐藏） -->
      <div v-if="!zmodemAutoMode" class="d-flex gap-2 mb-3">
        <button
          class="btn flex-fill"
          :class="mode === 'upload' ? 'btn-primary' : 'btn-outline-secondary'"
          @click="mode = 'upload'"
        >
          <i class="bi bi-upload me-1"></i>{{ t('fileTransfer.upload') }}
        </button>
        <button
          class="btn flex-fill"
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
          <i class="bi bi-cloud-upload" style="font-size: 32px;"></i>
          <div class="mt-2">{{ t('fileTransfer.dropZone') }}</div>
          <div class="mt-1" style="font-size: 12px; color: var(--text-secondary);">
            {{ t('fileTransfer.multiFileSupport') }}
          </div>
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
        <div v-if="zmodemAutoMode" class="text-center py-3">
          <div class="spinner-border spinner-border-sm text-primary me-2"></div>
          {{ t('fileTransfer.waitingForFiles') }}
        </div>
        <div v-else class="mb-3">
          <label class="form-label">{{ t('fileTransfer.remotePath') }}</label>
          <input
            type="text"
            class="form-control"
            v-model="remoteFilePath"
            :placeholder="t('fileTransfer.remotePathPlaceholder')"
            style="background: #313244; border-color: #45475a; color: var(--text-primary);"
          >
        </div>
        <button
          v-if="!zmodemAutoMode"
          class="btn btn-primary w-100"
          :disabled="!remoteFilePath || transferring"
          @click="startManualDownload"
        >
          <i class="bi bi-download me-1"></i>{{ t('fileTransfer.startDownload') }}
        </button>
      </div>

      <!-- 传输进度 -->
      <div v-if="transferring || transferHistory.length > 0" class="mt-3">
        <div class="fw-bold mb-2" style="font-size: 13px;">{{ t('fileTransfer.transferHistory') }}</div>
        <div class="transfer-list">
          <!-- 当前传输 -->
          <div v-if="currentProgress" class="transfer-item">
            <div class="d-flex align-items-center justify-content-between mb-1">
              <span class="text-truncate" style="font-size: 13px;">
                <i :class="currentProgress.direction === 'upload' ? 'bi bi-upload' : 'bi bi-download'" class="me-1"></i>
                {{ currentProgress.fileName }}
              </span>
              <span style="font-size: 12px; color: var(--text-secondary);">
                {{ formatSize(currentProgress.bytesSent) }} / {{ formatSize(currentProgress.bytesTotal) }}
              </span>
            </div>
            <div class="progress" style="height: 4px;">
              <div
                class="progress-bar"
                :class="currentProgress.state === 'error' ? 'bg-danger' : 'bg-primary'"
                :style="{ width: currentProgress.percent + '%' }"
              ></div>
            </div>
            <div v-if="currentProgress.state === 'error'" class="text-danger" style="font-size: 12px;">
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
              <span class="text-truncate" style="font-size: 13px;">
                <i :class="item.direction === 'upload' ? 'bi bi-upload' : 'bi bi-download'" class="me-1"></i>
                {{ item.fileName }}
              </span>
              <span
                style="font-size: 12px;"
                :class="item.state === 'complete' ? 'text-success' : 'text-danger'"
              >
                {{ item.state === 'complete' ? t('fileTransfer.complete') : t('fileTransfer.failed') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div v-if="transferring" class="mt-3 text-center">
        <button class="btn btn-outline-danger btn-sm" @click="cancelTransfer">
          <i class="bi bi-x-circle me-1"></i>{{ t('fileTransfer.cancelTransfer') }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Modal from '@/components/modal/index.vue';
import { Zmodem, formatFileSize, type ZmodemProgress } from '@/utils/zmodem';
import { toast } from '@/utils/toast';

const { t } = useI18n();

const modalRef = ref();
const fileInput = ref<HTMLInputElement>();
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
    // 自动关闭弹窗
    setTimeout(() => {
      (document.activeElement as HTMLElement)?.blur?.();
      modalRef.value?.hide?.();
    }, 800);
  });
}

/**
 * 显示文件传输对话框
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

  if (info && info.session) {
    zmodemSession = info.session;
    const role = info.role;
    console.log('[FileTransfer] ZMODEM session ready, role:', role);

    if (role === 'send') {
      // zmodem.js: ZRINIT → Session.Send → role='send'
      // rz 发送 ZRINIT 表示"我想接收文件" → 浏览器上传文件
      mode.value = 'upload';
      zmodemAutoMode.value = true;
      info.markHandlersReady?.();
    } else if (role === 'receive') {
      // zmodem.js: ZRQINIT → Session.Receive → role='receive'
      // sz 发送 ZRQINIT 表示"我想发送文件" → 浏览器下载文件
      mode.value = 'download';
      zmodemAutoMode.value = true;
      setupReceiveHandlers(zmodemSession);
      info.markHandlersReady?.();

      // start() 发送 ZRINIT，返回 Promise<Offer | undefined>
      zmodemSession.start?.().then((offerOrUndefined: any) => {
        if (offerOrUndefined && typeof offerOrUndefined.accept === 'function') {
          // start() 返回了 Offer 对象，直接处理
          console.log('[FileTransfer] start() returned offer, handling directly');
          handleFileOffer(offerOrUndefined);
        } else {
          // ZFIN 直接到达（没有文件）
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

  modalRef.value?.show();
}

function handleClose() {
  console.log('[FileTransfer] handleClose called, transferring:', transferring.value, 'activeTermRef:', !!activeTermRef, 'zmodemSession:', !!zmodemSession);
  // 移除焦点避免 Bootstrap aria-hidden 警告
  (document.activeElement as HTMLElement)?.blur?.();

  if (transferring.value) {
    cancelTransfer();
  } else {
    // 即使没有传输中，也需要终止远程 rz/sz 进程
    if (activeTermRef) {
      // 保存引用，因为 setTimeout 回调执行时 activeTermRef 已被清空
      const termRef = activeTermRef;
      const sid = termRef.sessionId;
      console.log('[FileTransfer] Sending abort to sessionId:', sid);
      const sendAbort = (data: string) => {
        console.log('[FileTransfer] sendAbort:', JSON.stringify(data).substring(0, 30));
        termRef.sendToServer({ type: 'terminal', sessionId: sid || undefined, data });
      };
      // 发送 ZMODEM abort 序列（5 个 CAN 字符 = \x18）
      sendAbort('\x18\x18\x18\x18\x18');
      // 再发送 Ctrl+C 确保进程退出
      setTimeout(() => sendAbort('\x03'), 100);
      setTimeout(() => sendAbort('\x03'), 300);
    }
    if (zmodemSession) {
      try { zmodemSession.abort?.(); } catch (e) { /* ignore */ }
      zmodemSession = null;
    }
  }
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
 * 上传文件 - 通过终端 base64 编码传输文件到远程
 * 当 ZMODEM rz 被检测到时，先终止 rz 进程，然后通过 base64 编码传输
 */
async function startUpload(files: File[]) {
  if (!activeTermRef) {
    toast.error(t('fileTransfer.terminalNotConnected'));
    return;
  }

  transferring.value = true;

  try {
    // 如果有 ZMODEM session，先 abort
    if (zmodemSession) {
      try { zmodemSession.abort?.(); } catch (e) { /* ignore */ }
      zmodemSession = null;
    }

    // 可靠终止 rz 进程
    sendToTerm('\x03'); // Ctrl+C
    await new Promise(r => setTimeout(r, 500));
    sendToTerm('\x03'); // 再发一次 Ctrl+C
    await new Promise(r => setTimeout(r, 500));
    sendToTerm('\x15'); // Ctrl+U 清空当前行
    await new Promise(r => setTimeout(r, 300));
    // 禁用历史扩展，避免 ! 字符被 shell 解释
    sendToTerm('set +H\n');
    await new Promise(r => setTimeout(r, 300));

    for (const file of files) {
      currentProgress.value = {
        direction: 'upload',
        fileName: file.name,
        bytesSent: 0,
        bytesTotal: file.size,
        percent: 0,
        state: 'transferring',
      };

      // 读取文件内容并 base64 编码
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const b64 = btoa(binary);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const remotePath = safeName; // 使用当前目录，不加路径前缀
      const CHUNK_SIZE = 2000; // 每次发送的 base64 字符数（保持命令行 < 4KB PTY 缓冲区限制）

      // 创建空文件
      sendToTerm(`: > '${remotePath}'\n`);
      await new Promise(r => setTimeout(r, 400));

      // 分块发送 base64 数据（使用 heredoc 避免回显 base64 内容）
      const totalChunks = Math.ceil(b64.length / CHUNK_SIZE);
      for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
        const chunk = b64.substring(i, i + CHUNK_SIZE);
        const chunkIdx = Math.floor(i / CHUNK_SIZE) + 1;
        // heredoc: base64 数据通过 stdin 传入，不会在命令行回显
        sendToTerm(`base64 -d >> '${remotePath}' <<'__B64__'\n${chunk}\n__B64__\n`);
        await new Promise(r => setTimeout(r, 80));

        currentProgress.value = {
          direction: 'upload',
          fileName: file.name,
          bytesSent: Math.min(i + CHUNK_SIZE, b64.length),
          bytesTotal: b64.length,
          percent: Math.round((chunkIdx / totalChunks) * 100),
          state: 'transferring',
        };
      }

      // 验证文件大小
      const expectedSize = uint8.length;
      sendToTerm(`echo "[fshell] Upload verify: $(wc -c < '${remotePath}') / ${expectedSize} bytes"\n`);
      await new Promise(r => setTimeout(r, 300));

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

      currentProgress.value = null;
    }

    transferring.value = false;
    toast.success(t('fileTransfer.uploadComplete'));

    // 自动关闭对话框
    setTimeout(() => {
      (document.activeElement as HTMLElement)?.blur?.();
      modalRef.value?.hide?.();
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
 * 处理下载的文件 offer (sz)
 * session role = 'receive'
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

  // 监听数据输入
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

  // 接受文件并保存
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

    // 自动关闭弹窗（等待可能的后续文件或 session_end）
    setTimeout(() => {
      if (!transferring.value) {
        (document.activeElement as HTMLElement)?.blur?.();
        modalRef.value?.hide?.();
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
 * 手动下载（非 ZMODEM 自动检测，通过在终端执行 sz 命令触发）
 */
function startManualDownload() {
  if (!remoteFilePath.value) {
    toast.warning(t('fileTransfer.remotePathRequired'));
    return;
  }

  if (activeTermRef) {
    // 发送 sz 命令到终端
    const cmd = `sz ${remoteFilePath.value}\n`;
    activeTermRef.sendToServer?.({ type: 'terminal', sessionId: undefined, data: cmd });
    toast.info(t('fileTransfer.startDownload'));
  }

  modalRef.value?.hide?.();
}

function cancelTransfer() {
  // 发送 ZMODEM abort 序列（5 个 CAN 字符 = \x18）终止远程 rz/sz 进程
  if (activeTermRef) {
    // 保存引用，因为 setTimeout 回调执行时 activeTermRef 可能已被清空
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
    try {
      zmodemSession.abort?.();
    } catch (e) {
      // ignore
    }
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
.file-transfer-body {
  padding: 0.5rem;
}

.drop-zone {
  border: 2px dashed #45475a;
  border-radius: 8px;
  padding: 32px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary);
}

.drop-zone:hover,
.drop-zone.dragging {
  border-color: var(--accent);
  background-color: rgba(137, 180, 250, 0.05);
  color: var(--text-primary);
}

.transfer-list {
  max-height: 200px;
  overflow-y: auto;
}

.transfer-item {
  padding: 8px;
  border-radius: 6px;
  background-color: rgba(255, 255, 255, 0.03);
  margin-bottom: 6px;
}
</style>
