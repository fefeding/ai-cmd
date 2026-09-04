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
        <div class="dest-dir-hint mt-2 px-2 py-1" v-if="mode === 'upload'">
          <div class="d-flex align-items-center gap-2">
            <label class="text-secondary mb-0 text-nowrap">
              <i class="bi bi-folder2 me-1 text-info"></i>{{ isZmodemSend ? 'rz 写入目录' : '目标目录' }}
            </label>
            <input
              v-model="destDir"
              type="text"
              class="form-control form-control-sm"
              placeholder="/当前/目录（可手动修改）"
              spellcheck="false"
              @input="destDirManual = true"
            >
            <button
              class="btn btn-sm btn-outline-secondary"
              :disabled="destDirLoading"
              @click="queryCwd(isZmodemSend, true)"
              title="重新检测当前目录"
            >
              <i class="bi" :class="destDirLoading ? 'bi-hourglass-split' : 'bi-arrow-clockwise'"></i>
            </button>
          </div>
          <div class="mt-1" style="font-size: 12px;">
            <template v-if="destDirLoading">
              <span class="text-secondary">
                <span class="spinner-border spinner-border-sm me-1" style="width: 10px; height: 10px;"></span>
                正在检测当前目录…
              </span>
            </template>
            <template v-else-if="destDir && !destDir.startsWith('/')">
              <span class="text-danger">
                <i class="bi bi-exclamation-triangle me-1"></i>目录必须是绝对路径（以 / 开头），否则将回退到家目录。
              </span>
            </template>
            <template v-else-if="!destDir">
              <span class="text-warning">
                <i class="bi bi-exclamation-triangle me-1"></i>
                未能自动检测当前目录{{ destDirError ? '：' + destDirError : '' }}，请手动填写目标目录（绝对路径），否则文件会传到家目录。
              </span>
            </template>
            <template v-else-if="isZmodemSend">
              <span class="text-secondary">上传前会中断远端 rz，文件将直接写入上面目录。</span>
            </template>
          </div>
        </div>
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

// 上传目标目录：由服务端可靠解析当前终端所在目录后展示，并用于构造绝对远程路径
const destDir = ref('');
const destDirLoading = ref(false);
const destDirError = ref('');
// 用户是否手动编辑过目标目录（手动后不再被自动检测结果覆盖）
const destDirManual = ref(false);
// 是否为 rz 触发的 ZMODEM 上传（role === 'send'）
const isZmodemSend = ref(false);

/**
 * 向服务端查询当前终端所在目录。
 * @param zmodem 远端 rz 是否正在等待接收文件。为 true 时服务端禁止向交互式 shell
 *               注入探测命令（否则 Ctrl+C 会打断 rz，注入文本也会被 rz 吞掉）。
 * @param force  强制服务端重新探测，忽略缓存（手动点"重新检测"、上传前兜底时使用）。
 */
async function queryCwd(zmodem?: boolean, force?: boolean): Promise<string> {
  const sid = activeTermRef?.sessionId;
  if (!sid) return '';
  destDirLoading.value = true;
  destDirError.value = '';
  try {
    const electronApi = (window as any).electronAPI;
    let cwd = '';
    if (electronApi?.api?.getCwd) {
      const res = await electronApi.api.getCwd(sid, !!zmodem, !!force);
      cwd = res?.cwd || '';
      if (!cwd && res?.error) destDirError.value = res.error;
    } else {
      const zmodemParam = zmodem ? '&zmodem=1' : '';
      const forceParam = force ? '&force=1' : '';
      const resp = await fetch(`/api/cwd?sessionId=${encodeURIComponent(sid)}${zmodemParam}${forceParam}`);
      const data = await resp.json();
      cwd = data?.cwd || '';
      if (!cwd && data?.error) destDirError.value = data.error;
    }
    // 只在解析成功且用户未手填时覆盖，避免清空用户手动输入
    if (cwd && !destDirManual.value) destDir.value = cwd;
    if (!cwd) destDirManual.value = false;
    return cwd;
  } catch (e: any) {
    destDirError.value = e?.message || String(e);
    return '';
  } finally {
    destDirLoading.value = false;
  }
}

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
  // 重置目标目录状态（每次打开面板重新解析）
  destDir.value = '';
  destDirError.value = '';
  destDirManual.value = false;
  // role === 'send' 即远端执行了 rz，浏览器需要上传文件
  isZmodemSend.value = !!(info && info.role === 'send');

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

  // 上传模式：提前向服务端解析当前终端目录，用于展示目标目录并构造绝对上传路径
  if (mode.value === 'upload') {
    if (isZmodemSend.value) {
      // rz 场景：远端 rz 正在等待接收文件。
      // 本组件的上传本来就要先中断 rz 再走 SFTP 直传（不走 ZMODEM 协议），
      // 所以这里直接中断它，让服务端向 shell 询问目录 —— /proc 进程探测在
      // tmux/子 shell 等场景下可能定位到错误的进程，只有问 shell 才是 100% 准确的。
      void (async () => {
        await interruptRemoteForeground();
        await queryCwd(false, true);
      })();
    } else {
      queryCwd(false);
    }
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

/** 目标目录是否已是可用的绝对路径 */
function hasValidDestDir(): boolean {
  return !!destDir.value && destDir.value.startsWith('/');
}

/**
 * 中断远端前台进程并清空当前输入行（Ctrl+C x2 + Ctrl+U）。
 * 上传流程本来就要中断 rz 再改用 SFTP 直传，所以这里是安全的；
 * 目录探测失败时也可以先调用它，让 shell 回到提示符后再注入探测命令。
 */
async function interruptRemoteForeground(): Promise<void> {
  if (!activeTermRef) return;
  sendToTerm('\x03');
  await new Promise(r => setTimeout(r, 300));
  sendToTerm('\x03');
  await new Promise(r => setTimeout(r, 200));
  sendToTerm('\x15');
  await new Promise(r => setTimeout(r, 300));
}

/**
 * 上传文件 - 通过 HTTP POST + SFTP 直传
 */
async function startUpload(files: File[]) {
  if (!activeTermRef) {
    toast.error(t('fileTransfer.terminalNotConnected'));
    return;
  }

  // 上传前必须确认目标目录：除非用户手动指定，否则一律以「中断前台进程后向 shell 询问」
  // 的结果为准 —— /proc 进程探测在 tmux / 子 shell 等场景下可能定位到错误的进程。
  // 本流程随后也会中断前台进程改用 SFTP 直传，所以这里的中断是安全的。
  if (!hasValidDestDir() || !destDirManual.value) {
    await interruptRemoteForeground();
    await queryCwd(false, true);
  }
  if (!hasValidDestDir()) {
    toast.warning('未能获取当前终端目录，请在上方填写目标目录（绝对路径）后重试');
    return;
  }

  transferring.value = true;

  try {
    if (zmodemSession) {
      try { zmodemSession.abort?.(); } catch (e) { /* ignore */ }
      zmodemSession = null;
    }

    await interruptRemoteForeground();

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
      // 优先使用服务端可靠解析出的当前目录构造绝对路径；未解析到时退回相对文件名，
      // 由服务端 uploadFileViaSftp 再次基于当前终端目录解析，确保文件落到当前目录而非家目录。
      const cwd = destDir.value && destDir.value.startsWith('/') ? destDir.value : '';
      const remoteName = cwd ? `${cwd.replace(/\/$/, '')}/${safeName}` : safeName;

      console.log(`[FileTransfer] HTTP upload: ${file.name} -> ${remoteName}, size=${file.size}, sessionId=${sid}`);

      currentProgress.value = {
        direction: 'upload',
        fileName: file.name,
        bytesSent: Math.floor(file.size * 0.1),
        bytesTotal: file.size,
        percent: 10,
        state: 'transferring',
      };

      const result = await httpFileUpload(file, remoteName, sid);

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
 * 通过 HTTP POST 上传文件到服务端（Web 模式）
 * 或 IPC 上传到主进程（Electron 模式，app:// 协议下 fetch 不可用）
 */
async function httpFileUpload(
  file: File,
  remoteName: string,
  sessionId: string | null
): Promise<{ success: boolean; bytes?: number; error?: string }> {
  // Electron 模式：通过 preload 暴露的 IPC API 上传
  const electronApi = (window as any).electronAPI;
  if (electronApi?.api?.uploadFile) {
    try {
      const buffer = await file.arrayBuffer();
      console.log(`[FileTransfer] IPC upload: ${file.name} -> ${remoteName}, size=${file.size}`);
      const result = await electronApi.api.uploadFile(sessionId || '', remoteName, buffer);
      console.log(`[FileTransfer] IPC upload result:`, result);
      return result;
    } catch (err: any) {
      console.error(`[FileTransfer] IPC upload error:`, err);
      return { success: false, error: err.message || 'IPC upload failed' };
    }
  }

  // Web 模式：通过 HTTP POST
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
