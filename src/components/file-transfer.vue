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
          <div v-if="!isZmodemSend" class="d-flex align-items-center gap-2">
            <label class="text-secondary mb-0 text-nowrap">
              <i class="bi bi-folder2 me-1 text-info"></i>目标目录
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
              @click="refreshDestDir()"
              title="重新检测当前目录"
            >
              <i class="bi" :class="destDirLoading ? 'bi-hourglass-split' : 'bi-arrow-clockwise'"></i>
            </button>
          </div>
          <!-- rz 场景：走 ZMODEM 直发，目录由 rz 自己的 cwd 决定，无需也无从填写 -->
          <div v-else class="d-flex align-items-center gap-2 text-secondary">
            <i class="bi bi-folder2 text-info"></i>
            <span>将通过 ZMODEM 发送给 rz，文件写入终端当前目录</span>
          </div>
          <div v-if="!isZmodemSend" class="mt-1" style="font-size: 12px;">
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
            <template v-else-if="!destDirConfirmed && destDirUnreliable">
              <span class="text-danger">
                <i class="bi bi-exclamation-triangle me-1"></i>
                自动检测可能不准（sudo su 后无法读取进程目录），请核对或修改上面目录后再上传。
              </span>
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

/**
 * 等待「自动发起的 rz」握手成功。
 * 手动上传时我们会在终端执行 rz，然后等 Sentry 检测到 ZRINIT 并建好 Session.Send，
 * 由 show() 通过这个回调把 session 交回来。
 */
let pendingRzResolve: ((session: any) => void) | null = null;

// 上传目标目录：由服务端可靠解析当前终端所在目录后展示，并用于构造绝对远程路径
const destDir = ref('');
const destDirLoading = ref(false);
const destDirError = ref('');
// 用户是否手动编辑过目标目录（手动后不再被自动检测结果覆盖）
const destDirManual = ref(false);
// 目标目录是否已被权威来源确认（rz 进程自身的 cwd，或中断后向 shell 询问的结果）。
// 已确认时上传前不再重复探测，避免探测失败把正确目录改回家目录。
const destDirConfirmed = ref(false);
// 当前展示的目录来自不可信推断（sudo su 后探测只能看到登录 shell），需要用户核对
const destDirUnreliable = ref(false);
// 是否为 rz 触发的 ZMODEM 上传（role === 'send'）
const isZmodemSend = ref(false);

/**
 * 向服务端查询当前终端所在目录。
 * @param zmodem 远端 rz 是否正在等待接收文件。为 true 时服务端禁止向交互式 shell
 *               注入探测命令（否则 Ctrl+C 会打断 rz，注入文本也会被 rz 吞掉）。
 * @param force  强制服务端重新探测，忽略缓存（手动点"重新检测"、上传前兜底时使用）。
 */
/**
 * 向服务端查询当前终端所在目录。
 * @param zmodem 远端 rz 是否正在等待接收文件。为 true 时服务端禁止向交互式 shell
 *               注入探测命令（否则 Ctrl+C 会打断 rz，注入文本也会被 rz 吞掉）。
 * @param force  强制服务端重新探测，忽略缓存（手动点"重新检测"、上传前兜底时使用）。
 * @returns cwd 目录；reliable=false 表示结果不可信（sudo su 后读不到 /proc，
 *          只是「唯一读得到的进程」，往往是登录 shell 家目录），不能直接当结论。
 */
async function queryCwd(zmodem?: boolean, force?: boolean): Promise<{ cwd: string; reliable: boolean }> {
  const sid = activeTermRef?.sessionId;
  if (!sid) return { cwd: '', reliable: false };
  destDirLoading.value = true;
  destDirError.value = '';
  try {
    const electronApi = (window as any).electronAPI;
    let cwd = '';
    let reliable = false;
    if (electronApi?.api?.getCwd) {
      const res = await electronApi.api.getCwd(sid, !!zmodem, !!force);
      cwd = res?.cwd || '';
      reliable = res?.reliable !== false && !!cwd;
      if (!cwd && res?.error) destDirError.value = res.error;
    } else {
      const zmodemParam = zmodem ? '&zmodem=1' : '';
      const forceParam = force ? '&force=1' : '';
      const resp = await fetch(`/api/cwd?sessionId=${encodeURIComponent(sid)}${zmodemParam}${forceParam}`);
      const data = await resp.json();
      cwd = data?.cwd || '';
      reliable = data?.reliable !== false && !!cwd;
      if (!cwd && data?.error) destDirError.value = data.error;
    }
    // 只在解析成功且用户未手填时覆盖，避免清空用户手动输入
    if (cwd && !destDirManual.value) {
      destDir.value = cwd;
      destDirUnreliable.value = !reliable;
    }
    if (!cwd) destDirManual.value = false;

    // 服务端拿不到目录，或结果不可信（sudo su 后只能看到登录 shell）时，
    // 用终端提示符里的目录兜底：提示符就是屏幕上的内容，既不受 /proc 权限限制，
    // 也不受进程可见性影响，是这类场景下唯一稳定的来源（root@host:/data/server#）。
    // 这样输入框不会空着，用户不必被"未能自动检测"劝退，上传时仍会再校验一次。
    if ((!cwd || !reliable) && !destDirManual.value) {
      const fromPrompt = cwdFromPrompt();
      if (fromPrompt) {
        destDir.value = fromPrompt;
        destDirUnreliable.value = true;
      }
    }
    return { cwd, reliable };
  } catch (e: any) {
    destDirError.value = e?.message || String(e);
    return { cwd: '', reliable: false };
  } finally {
    destDirLoading.value = false;
  }
}

/**
 * 兜底：从终端屏显的提示符里解析当前目录（root@host:/data/server/work-agent#）。
 * 这是唯一不受权限影响的来源 —— sudo su 之后服务端读不到 /proc，rz 又占着终端时，
 * 屏幕上的提示符就是当前目录的最直接证据。
 */
function cwdFromPrompt(): string {
  try {
    const p = activeTermRef?.getCurrentCwd?.();
    return typeof p === 'string' && p.startsWith('/') ? p : '';
  } catch {
    return '';
  }
}

/** 把目录写入输入框（用户手填过就不覆盖）并标记是否可信 */
function applyDestDir(cwd: string, reliable: boolean) {
  if (!cwd || !cwd.startsWith('/')) return false;
  if (!destDirManual.value) {
    destDir.value = cwd;
    destDirUnreliable.value = !reliable;
  }
  if (reliable) destDirConfirmed.value = true;
  return true;
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
  destDirConfirmed.value = false;
  destDirUnreliable.value = false;
  // role === 'send' 即远端执行了 rz，浏览器需要上传文件
  isZmodemSend.value = !!(info && info.role === 'send');

  if (info && info.session) {
    zmodemSession = info.session;
    const role = info.role;
    // 若这次握手是我们自动执行 rz 触发的，唤醒等待中的上传流程
    if (role === 'send' && pendingRzResolve) {
      pendingRzResolve(info.session);
    }
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

  // 上传模式：提前向服务端解析当前终端目录，用于构造 SFTP 直传的绝对路径。
  //
  // rz 场景跳过探测：此时走 ZMODEM 直发，文件由 rz 写入它自己的 cwd（= 终端当前目录），
  // 根本用不到目录。而且探测在这里是有害的 —— 注入 pwd 需要先中断 rz，
  // 中断后 ZMODEM 传输就没法进行了；不中断则注入的命令会被 rz 当数据吞掉。
  if (mode.value === 'upload' && !isZmodemSend.value) {
    queryCwd(false);
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

/** 手动点「重新检测」：中断前台进程后向 shell 询问，拿不到再用提示符解析兜底 */
async function refreshDestDir() {
  await interruptRemoteForeground();
  const r = await queryCwd(false, true);
  if (r.cwd && r.reliable) destDirConfirmed.value = true;
  else if (!r.cwd) applyDestDir(cwdFromPrompt(), false);
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
  // rz 会把终端设为 raw 模式，此时 Ctrl+C 只是普通字节、产生不了 SIGINT，
  // 必须先发 ZMODEM 中止序列（8×CAN + 8×BS）才能真正结束 rz。
  sendToTerm('\x18\x18\x18\x18\x18\x18\x18\x18');
  await new Promise(r => setTimeout(r, 200));
  sendToTerm('\x08\x08\x08\x08\x08\x08\x08\x08');
  await new Promise(r => setTimeout(r, 200));
  sendToTerm('\x03');
  await new Promise(r => setTimeout(r, 300));
  sendToTerm('\x03');
  await new Promise(r => setTimeout(r, 200));
  sendToTerm('\x15');
  await new Promise(r => setTimeout(r, 300));
}

/**
 * 在终端自动执行 rz，并等待 ZMODEM 握手完成（Xshell 拖放上传的行为）。
 *
 * 这样上传就完全不需要知道目录：rz 由当前 shell 启动、继承其 cwd，并把收到的文件
 * 写进这个目录。相比 SFTP 直传，它不需要 /proc 探测、不需要注入 pwd，
 * 也不受 sudo su / tmux / 子 shell 影响 —— 目录正确性由内核保证。
 *
 * @returns 建好的 Session.Send；超时或远端没有 lrzsz 时返回 null，调用方退回 SFTP。
 */
function autoStartRzAndWait(timeoutMs = 8000): Promise<any> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (session: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pendingRzResolve = null;
      resolve(session);
    };
    const timer = setTimeout(() => {
      console.warn('[FileTransfer] auto rz timed out, falling back to SFTP');
      finish(null);
    }, timeoutMs);
    pendingRzResolve = finish;
    // 先清掉输入行里可能残留的半截内容，再执行 rz
    sendToTerm('\x15');
    setTimeout(() => sendToTerm('rz -bye\r'), 120);
  });
}

/**
 * 通过 ZMODEM 直接把文件发给远端正在等待的 rz（Xshell / SecureCRT 的做法）。
 *
 * 为什么这是最可靠的方案：rz 由用户所在的 shell 启动，会继承该 shell 的 cwd，
 * 并把收到的文件写进这个目录 —— 我们不需要知道这个目录是什么，它天然就是对的。
 * 相比之下 SFTP 直传必须先拿到绝对路径，才有了 /proc 进程探测、注入 pwd、
 * 解析提示符等一堆在 sudo su / tmux / 子 shell 下会失效的启发式手段。
 */
async function startZmodemUpload(files: File[]) {
  const session = zmodemSession;
  if (!session) return;

  transferring.value = true;
  const CHUNK = 64 * 1024; // 分块读取，避免大文件一次性占用内存
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  let doneBytes = 0;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      currentProgress.value = {
        direction: 'upload',
        fileName: file.name,
        bytesSent: 0,
        bytesTotal: file.size,
        percent: 0,
        state: 'transferring',
      };
      console.log(`[FileTransfer] ZMODEM upload: ${file.name} (${file.size} bytes)`);

      // 向远端 rz 发起文件要约；接收端接受后返回 Transfer 对象
      const transfer = await session.send_offer({
        name: file.name,
        size: file.size,
        mtime: Math.floor((file.lastModified || Date.now()) / 1000),
        files_remaining: files.length - i,
        bytes_remaining: totalBytes - doneBytes,
      });

      if (!transfer) {
        // 远端跳过该文件（通常是同名文件已存在）
        toast.warning(`远端已跳过：${file.name}（可能同名文件已存在）`);
        doneBytes += file.size;
        continue;
      }

      let sent = 0;
      while (sent < file.size) {
        const end = Math.min(sent + CHUNK, file.size);
        const buf = new Uint8Array(await file.slice(sent, end).arrayBuffer());
        transfer.send(buf);
        sent += buf.length;
        currentProgress.value = {
          direction: 'upload',
          fileName: file.name,
          bytesSent: sent,
          bytesTotal: file.size,
          percent: Math.min(99, Math.round((sent / file.size) * 100)),
          state: 'transferring',
        };
      }
      // end() 返回的 Promise 在接收端确认收完该文件后 resolve
      await transfer.end([]);
      doneBytes += file.size;

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
    }

    // 通知远端本批传输结束（发送 ZEOF / ZFIN）
    try {
      await session.close();
    } catch (e) {
      console.warn('[FileTransfer] ZMODEM close:', e);
    }
    // rz 已退出，切回普通上传模式。
    // 必须先给 destDir 一个正确初值：rz 模式下我们从不探测目录（也没必要），
    // 若直接切回输入框模式就会显示空的"未能自动检测当前目录"，让人误以为上传失败。
    // 优先用终端提示符填充（不向终端注入任何命令），拿不到再真问一次 shell。
    // 这里刻意不标记 destDirConfirmed，下次上传仍会重新校验，避免沿用过期目录。
    const promptCwd = cwdFromPrompt();
    if (promptCwd && !destDirManual.value) {
      destDir.value = promptCwd;
      destDirUnreliable.value = false;
    } else {
      await queryCwd(false, true);
    }
    zmodemSession = null;
    isZmodemSend.value = false;
    toast.success(t('fileTransfer.uploadComplete'));
  } catch (e: any) {
    console.error('[FileTransfer] ZMODEM upload failed:', e);
    toast.error(`ZMODEM 上传失败：${e?.message || String(e)}`);
  } finally {
    transferring.value = false;
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

  // 【Xshell 方案】远端 rz 正在等待接收：直接走 ZMODEM 把文件发给 rz，
  // 由 rz 写入它自己的 cwd —— 而 rz 是由当前 shell 启动的，其 cwd 就是终端当前目录。
  // 因此这里完全不需要"猜"目录，也就不可能出现"传到家目录"的问题。
  // （SFTP 直传必须事先知道绝对路径，才引出了前面一系列不可靠的目录探测。）
  if (isZmodemSend.value && zmodemSession) {
    await startZmodemUpload(files);
    return;
  }

  // 【Xshell 方案 - 手动上传】终端里没有正在等待的 rz：主动在终端执行 rz，再走 ZMODEM 直发。
  // 文件由 rz 写入它自己的 cwd，因此完全不需要探测目录，也就不受 sudo su 影响。
  // 远端没有 lrzsz（或终端正忙）时会超时返回 null，自动退回下面的 SFTP + 目录探测。
  // 只在终端确实停在 shell 提示符（空闲）时才自动执行 rz，
  // 避免在 vim / top 之类前台程序里把命令灌进去。
  if (!zmodemSession && cwdFromPrompt()) {
    const session = await autoStartRzAndWait();
    if (session) {
      zmodemSession = session;
      isZmodemSend.value = true;
      await startZmodemUpload(files);
      return;
    }
  }

  // 目标目录未确认时（用户也未手填），先中断前台进程再向 shell 询问 —— 这是权威结果。
  // 已确认（例如取自 rz 进程自身 cwd）时不再重复探测，避免探测失败把正确目录改回家目录。
  if (!destDirManual.value && (!hasValidDestDir() || !destDirConfirmed.value)) {
    await interruptRemoteForeground();
    const r = await queryCwd(false, true);
    if (r.cwd && r.reliable) {
      destDirConfirmed.value = true;
    } else if (!r.cwd) {
      // 服务端探测失败（sudo su 后读不到 /proc）：用终端提示符里的目录兜底
      applyDestDir(cwdFromPrompt(), false);
    }
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
