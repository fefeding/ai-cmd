<template>
  <div class="rdp-tab" ref="rootEl">
    <div class="rdp-toolbar">
      <span class="rdp-title"><i class="bi bi-display me-1"></i>{{ connection?.name || '远程桌面' }}</span>
      <span class="rdp-status" :class="status">{{ statusText }}</span>
      <button class="rdp-btn" :title="t('rdp.paste')" @click="pasteClipboard" :disabled="status !== 'connected'">
        <i class="bi bi-clipboard"></i>
      </button>
      <button class="rdp-btn" title="上传文件到远程桌面" @click="openFilePicker" :disabled="status !== 'connected'">
        <i class="bi bi-upload"></i>
      </button>
      <button class="rdp-btn" title="下载远程文件" @click="downloadFiles" :disabled="status !== 'connected' || pendingDownloads.length === 0">
        <i class="bi bi-download"></i>
      </button>
      <button class="rdp-btn" :title="t('rdp.reconnect')" @click="reconnect">
        <i class="bi bi-arrow-clockwise"></i>
      </button>
      <button class="rdp-btn" :title="t('rdp.fit')" @click="fitDisplay">
        <i class="bi bi-arrows-fullscreen"></i>
      </button>
      <input ref="fileInputRef" type="file" multiple class="rdp-file-input" @change="onFilesSelected" />
      <!-- 隐藏的可编辑粘贴接收层：浏览器只对可编辑元素可靠派发携带 files 的 paste 事件。
           Cmd/Ctrl+V 时临时聚焦它，拿到文件后再转回 canvas。 -->
      <textarea ref="pasteSinkRef" class="rdp-paste-sink" tabindex="-1" aria-hidden="true"></textarea>
    </div>
    <div class="rdp-viewport" ref="viewportEl">
      <canvas ref="canvasEl" class="rdp-canvas" tabindex="0"></canvas>
    </div>
    <div v-if="status === 'connecting'" class="rdp-overlay">
      <div class="spinner-border spinner-border-sm me-2"></div>{{ t('rdp.connecting') }}
    </div>
    <div v-if="status === 'error'" class="rdp-overlay rdp-error">
      <i class="bi bi-exclamation-triangle me-2"></i>{{ errorMessage || t('rdp.connectFailed') }}
    </div>
    <div v-if="status === 'connected' && transferItems.length > 0" class="rdp-ft-panel">
      <div class="rdp-ft-header"><i class="bi bi-arrow-left-right me-1"></i>文件传输</div>
      <div class="rdp-ft-items">
        <div v-for="(item, i) in transferItems" :key="i" class="rdp-ft-item">
          <span class="rdp-ft-name" :title="item.name">{{ item.name }}</span>
          <span class="rdp-ft-state">{{ item.status }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import initWasm, {
  SessionBuilder, DesktopSize, Extension, DeviceEvent, InputTransaction, ClipboardData, setup,
} from 'ironrdp-wasm';
import type { Session } from 'ironrdp-wasm';
import { scancodeFor, isMacClient } from '@/utils/rdp-wasm-input';
import { toast } from '@/utils/toast';
import { readClipboard, writeClipboard } from '@/utils/vscode-clipboard';
import type { ConnectionEntity } from '@/typings/connection';

const props = defineProps<{
  tabId: string;
  connection?: ConnectionEntity;
  active: boolean;
}>();

const emit = defineEmits<{
  (e: 'status-change', status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting', sessionId?: string): void;
}>();

const { t } = useI18n();

const rootEl = ref<HTMLElement | null>(null);
const viewportEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const pasteSinkRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const status = ref<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
const errorMessage = ref('');
const transferItems = ref<Array<{ name: string; status: string }>>([]);

const statusText = computed(() => {
  if (status.value === 'connecting') return t('tab.connecting');
  if (status.value === 'connected') return t('tab.connected');
  if (status.value === 'error') return t('tab.error');
  return t('tab.disconnected');
});

let session: Session | null = null;
let wasmReady = false;
let connecting = false;
let disposed = false;
let domListeners: Array<{ target: EventTarget; type: string; handler: EventListener; options?: any }> = [];
let resizeObserver: ResizeObserver | null = null;

// 本地剪贴板文本缓存：在 copy 事件与点击远程画布时提前刷新。
// Ctrl+V 时必须「同步」把内容推入 RDP 事件队列再发 V 键——若等异步读取完成
// 才发 V 键，keyup 会先于 keydown 到达远程，粘贴不会触发。
let cachedClipboardText = '';

// 剪贴板 / 文件传输状态
let clipboardReady = false;
// RDP 剪贴板是单一剪贴板：initiate_file_copy 通告文件列表后，若再推送文本
// 会把远程看到的文件格式列表覆盖掉。此标志表示当前剪贴板承载的是待粘贴文件。
let fileCopyMode = false;
const uploadedFiles = new Map<number, File>();
const pendingDownloads = ref<Array<{ name: string; fileSize: number; index: number; clipDataId: any }>>([]);
const streamToFileInfo = new Map<number, { name: string; clipDataId: any; _chunks?: Uint8Array[]; _totalSize?: number; _expectedSize?: number; _sizeReceived?: boolean; _fileIndex?: number }>();

function addTransferItem(name: string, state: string): number {
  transferItems.value.push({ name, status: state });
  return transferItems.value.length - 1;
}
function updateTransferItem(index: number, state: string) {
  if (transferItems.value[index]) transferItems.value[index].status = state;
}

function formatError(e: any): string {
  return e?.message || String(e || '未知错误');
}

function isElectronIPC(): boolean {
  return !!((window as any).electronAPI?.isElectron && (window as any).electronAPI?.isPackaged);
}

/** 获取 WASM 客户端连接用的 WebSocket 代理地址 */
async function getProxyAddress(): Promise<string> {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (isElectronIPC()) {
    const api = (window as any).electronAPI;
    if (api?.getRdpProxyUrl) {
      return await api.getRdpProxyUrl();
    }
    throw new Error('当前 Electron 版本不支持 RDP 代理地址接口，请升级客户端');
  }
  const token = new URLSearchParams(location.search).get('token');
  const q = new URLSearchParams();
  if (props.connection?.id) q.set('connectionId', props.connection.id);
  if (token) q.set('token', token);
  return `${protocol}//${location.host}/ws/rdp?${q.toString()}`;
}

async function ensureWasm(): Promise<void> {
  if (wasmReady) return;
  try { setup('warn'); } catch { /* setup 可重复调用，忽略 */ }
  // 显式指定 wasm 路径：dev / 构建产物 / Electron / VSCode 四种模式统一为
  // /public/rdp_client_bg.wasm（构建时由 Vite 输出到此，dev 由中间件映射）。
  const base = (window as any).__AICMD_BASE__ || '';
  // wasm-bindgen 新版要求传 { module_or_path } 对象，直接传 URL 会触发弃用警告
  await initWasm({ module_or_path: `${base}/public/rdp_client_bg.wasm` });
  wasmReady = true;
}

function setStatus(s: typeof status.value, err?: string) {
  status.value = s;
  if (err) errorMessage.value = err;
  emit('status-change', s);
}

function applyInput(tx: InputTransaction) {
  try { session?.applyInputs(tx); } catch { /* ignore transient input errors */ }
}

function setupInputs(canvas: HTMLCanvasElement) {
  const isMac = isMacClient();
  const add = (target: EventTarget, type: string, handler: EventListener, options?: any) => {
    target.addEventListener(type, handler, options);
    domListeners.push({ target, type, handler, options });
  };

  add(canvas, 'keydown', ((e: KeyboardEvent) => {
    const isPaste = (e.ctrlKey || e.metaKey) && e.code === 'KeyV';
    // Ctrl/Cmd+V 不能 preventDefault：否则浏览器不会派发原生 paste 事件，
    // 就无法从 e.clipboardData.files 拿到本地复制的文件（异步剪贴板 API 读不到文件）。
    if (!isPaste) e.preventDefault();
    e.stopPropagation();
    if (!session) return;
    const scancode = scancodeFor(e.code, isMac);
    if (scancode === null) return;
    const tx = new InputTransaction();
    tx.addEvent(DeviceEvent.keyPressed(scancode));
    // CLIPRDR 是拉取模型：远程收到 V 键后会请求剪贴板内容。先用缓存文本入队作为
    // 兜底（VSCode 跨源 iframe 不派发 paste 事件时靠它）；浏览器里随后的 paste
    // 事件会用 e.clipboardData 的真实文本/文件覆盖，两者都在同一 tick 内完成，
    // 远早于远程经网络发回的数据请求。
    if (isPaste && !fileCopyMode && session) {
      pushClipboardSync(cachedClipboardText);
    }
    applyInput(tx);
    // 临时聚焦隐藏 textarea：浏览器（尤其 VSCode 跨源 iframe）只对可编辑元素可靠
    // 派发携带 clipboardData.files 的 paste 事件。paste handler 处理后会转回 canvas。
    if (isPaste) pasteSinkRef.value?.focus();
  }) as EventListener);

  // keyup 挂在 document：粘贴时焦点会临时转移到隐藏 textarea，若仍监听 canvas
  // 则可能收不到 V 的松开事件，导致远程 V 键一直按住。全局监听避免焦点丢失。
  add(document, 'keyup', ((e: KeyboardEvent) => {
    // 忽略其它输入框（含粘贴接收层）的按键，避免干扰页面其它区域
    if (document.activeElement !== canvas && document.activeElement !== pasteSinkRef.value) return;
    e.preventDefault(); e.stopPropagation();
    if (!session) return;
    const scancode = scancodeFor(e.code, isMac);
    if (scancode === null) return;
    const tx = new InputTransaction();
    tx.addEvent(DeviceEvent.keyReleased(scancode));
    applyInput(tx);
  }) as EventListener);

  add(canvas, 'mousemove', ((e: MouseEvent) => {
    if (!session) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    const tx = new InputTransaction();
    tx.addEvent(DeviceEvent.mouseMove(x, y));
    applyInput(tx);
  }) as EventListener);

  add(canvas, 'mousedown', ((e: MouseEvent) => {
    e.preventDefault();
    canvas.focus();
    // 点击远程画布时刷新缓存：覆盖「本地复制 → 直接点过来粘贴」的常见流程
    refreshClipboardCache();
    if (!session) return;
    const tx = new InputTransaction();
    tx.addEvent(DeviceEvent.mouseButtonPressed(e.button));
    applyInput(tx);
  }) as EventListener);

  add(window, 'mouseup', ((e: MouseEvent) => {
    if (!session) return;
    const tx = new InputTransaction();
    tx.addEvent(DeviceEvent.mouseButtonReleased(e.button));
    applyInput(tx);
  }) as EventListener);

  add(canvas, 'wheel', ((e: WheelEvent) => {
    e.preventDefault();
    if (!session) return;
    if (e.deltaY !== 0) {
      const tx = new InputTransaction();
      tx.addEvent(DeviceEvent.wheelRotations(true, e.deltaY > 0 ? -1 : 1, 1));
      applyInput(tx);
    }
    if (e.deltaX !== 0) {
      const tx = new InputTransaction();
      tx.addEvent(DeviceEvent.wheelRotations(false, e.deltaX > 0 ? -1 : 1, 1));
      applyInput(tx);
    }
  }) as EventListener, { passive: false } as any);

  add(canvas, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);

  // document 级 copy/cut：用户本地复制时同步捕获文本到缓存（paste 时即可立即入队）
  add(document, 'copy', (() => {
    setTimeout(refreshClipboardCache, 0);
  }) as EventListener);

  // 原生 paste 事件：这是读取「本地复制的文件」的唯一可靠途径——
  // navigator.clipboard.read() 在权限策略下常不可用且读不到文件对象。
  // 监听隐藏 textarea（可编辑元素，浏览器会可靠派发 paste），处理完立即把焦点
  // 转回 canvas，保证后续 keyup 仍由 canvas 处理、V 键能正常松开。
  add(pasteSinkRef.value!, 'paste', ((e: ClipboardEvent) => {
    if (!session) return;
    e.preventDefault();
    e.stopPropagation();
    // 先恢复焦点，确保 keyup(V) 在 canvas 上触发
    canvas.focus();
    // 已通过工具栏/拖拽通告过文件：浏览器剪贴板里的旧内容不能覆盖文件格式列表
    if (fileCopyMode) return;
    const dt = e.clipboardData;
    if (!dt) return;
    const files = Array.from(dt.files || []);
    if (files.length) {
      // 本地复制的文件 → 通告到 RDP 剪贴板，远程执行 Ctrl+V 时来拉取内容
      initiateFilesUpload(files);
      return;
    }
    // 文本：用 paste 事件携带的实时内容覆盖 keydown 里的缓存兜底
    const text = dt.getData('text/plain');
    cachedClipboardText = text || '';
    pushClipboardSync(cachedClipboardText);
  }) as EventListener);

  // 拖拽文件到远程画布同样走 CLIPRDR 文件上传
  add(canvas, 'dragover', ((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }) as EventListener);
  add(canvas, 'drop', ((e: DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) initiateFilesUpload(files);
  }) as EventListener);
}

function registerClipboardAndFiles(builder: InstanceType<typeof SessionBuilder>) {
  builder.extension(new Extension('enable_credssp', true));

  builder.remoteClipboardChangedCallback((data: any) => {
    clipboardReady = true;
    // 远程复制了新内容 → 退出文件复制模式。但不清空 uploadedFiles：
    // 文件传输是远程分多次拉取（SIZE + DATA 分块），期间若触发剪贴板变化，
    // 清空会导致后续 FileContentsRequest 找不到文件。
    fileCopyMode = false;
    try {
      if (data.isEmpty()) return;
      for (const item of data.items()) {
        if (String(item.mimeType()).startsWith('text/')) {
          const text = String(item.value() ?? '');
          if (text) void writeClipboard(text);
          break;
        }
      }
    } catch { /* ignore clipboard parse errors */ }
  });

  builder.forceClipboardUpdateCallback(async () => {
    // 初始化时也要同步一次本地剪贴板；之后每次 Ctrl+V 由 syncLocalClipboard 实时推送
    await syncLocalClipboard();
  });

  builder.extension(new Extension('files_available_callback', (files: any[], clipDataId: any) => {
    pendingDownloads.value = [];
    streamToFileInfo.clear();
    files.forEach((f, i) => {
      pendingDownloads.value.push({ name: f.name || `file_${i}`, fileSize: f.fileSize || 0, index: i, clipDataId });
      const elIdx = addTransferItem(f.name || `file_${i}`, '可下载');
      streamToFileInfo.set(i + 1, { name: f.name || `file_${i}`, clipDataId, _fileIndex: i });
      // 记录 UI index 映射（简单起见用 stream id 作为 key 的一部分）
      (streamToFileInfo.get(i + 1) as any)._uiIndex = elIdx;
    });
  }));

  builder.extension(new Extension('file_contents_request_callback', async (request: any) => {
    const file = uploadedFiles.get(request.index);
    const send = (isError: boolean, data: Uint8Array) => {
      try {
        session?.invokeExtension(new Extension('submit_file_contents', {
          stream_id: request.streamId, is_error: isError, data,
        }));
      } catch { /* ignore */ }
    };
    if (!file) { send(true, new Uint8Array(0)); return; }
    try {
      if (request.flags & 0x00000001) {
        const sizeBytes = new Uint8Array(8);
        new DataView(sizeBytes.buffer).setBigUint64(0, BigInt(file.size), true);
        send(false, sizeBytes);
      } else if (request.flags & 0x00000002) {
        const blob = file.slice(request.position, request.position + request.size);
        send(false, new Uint8Array(await blob.arrayBuffer()));
      }
    } catch { send(true, new Uint8Array(0)); }
  }));

  builder.extension(new Extension('file_contents_response_callback', (response: any) => {
    const info = streamToFileInfo.get(response.streamId);
    if (!info) return;
    if (response.isError) {
      if ((info as any)._uiIndex !== undefined) updateTransferItem((info as any)._uiIndex, '失败');
      return;
    }
    if (!info._chunks) { info._chunks = []; info._totalSize = 0; }
    if (response.data.length === 8 && !info._sizeReceived) {
      info._sizeReceived = true;
      info._expectedSize = Number(new DataView(response.data.buffer).getBigUint64(0, true));
      const dataStreamId = response.streamId + 1000;
      streamToFileInfo.set(dataStreamId, info);
      session?.invokeExtension(new Extension('request_file_contents', {
        stream_id: dataStreamId,
        file_index: info._fileIndex,
        flags: 0x00000002,
        position: 0,
        size: info._expectedSize,
        clip_data_id: info.clipDataId,
      }));
    } else {
      info._chunks.push(new Uint8Array(response.data));
      info._totalSize = (info._totalSize || 0) + response.data.length;
      if (info._expectedSize != null && info._totalSize >= info._expectedSize) {
        const blob = new Blob(info._chunks as BlobPart[]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = info.name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if ((info as any)._uiIndex !== undefined) updateTransferItem((info as any)._uiIndex, '已下载');
      }
    }
  }));
}

async function start() {
  if (connecting || disposed) return;
  connecting = true;
  setStatus('connecting');
  errorMessage.value = '';
  try {
    await ensureWasm();
    const canvas = canvasEl.value;
    const conn = props.connection;
    if (!canvas || !conn) throw new Error('缺少画布或连接配置');

    const opts = conn.options?.rdp || {};
    const proxyAddress = await getProxyAddress();
    const destination = `${conn.host || ''}:${conn.port || 3389}`;

    const builder = new SessionBuilder();
    builder.username(conn.username || '');
    builder.password(conn.password || '');
    if (opts.domain) builder.serverDomain(opts.domain);
    builder.destination(destination);
    builder.proxyAddress(proxyAddress);
    builder.authToken('none');
    builder.desktopSize(new DesktopSize(opts.width || 1280, opts.height || 800));
    builder.renderCanvas(canvas);
    builder.setCursorStyleCallbackContext(canvas);
    builder.setCursorStyleCallback(function (this: HTMLCanvasElement, style: string) {
      this.style.cursor = style || 'default';
    });
    registerClipboardAndFiles(builder);

    session = await builder.connect();
    const ds = session.desktopSize();
    canvas.width = ds.width;
    canvas.height = ds.height;
    setupInputs(canvas);

    setStatus('connected');
    refreshClipboardCache();
    nextFit();

    const currentSession = session;
    currentSession.run().then((info) => {
      if (disposed || session !== currentSession) return;
      setStatus('disconnected', info?.reason ? `会话结束: ${info.reason()}` : undefined);
    }).catch((e) => {
      if (disposed || session !== currentSession) return;
      setStatus('error', formatError(e));
    });
  } catch (e: any) {
    setStatus('error', formatError(e));
  } finally {
    connecting = false;
  }
}

function nextFit() {
  // nextTick 后画布尺寸已就绪，做一次自适应
  Promise.resolve().then(() => setTimeout(fitDisplay, 30));
}

function fitDisplay() {
  const canvas = canvasEl.value;
  const vp = viewportEl.value;
  if (!canvas || !vp || !canvas.width || !canvas.height) return;
  // tab 隐藏（display:none）时 viewport 尺寸为 0，跳过以免把画布缩成 0×0
  if (!props.active || vp.clientWidth === 0 || vp.clientHeight === 0) return;
  // 用 CSS 宽高缩放（而非 transform）：transform 不改变布局尺寸，会让 canvas 仍占
  // 1280×800 的布局空间并从左上角起，导致画面缩在左上、下方留黑边。
  // 直接设 CSS 尺寸后 flex 居中生效，且允许放大以铺满区域。
  const scale = Math.min(vp.clientWidth / canvas.width, vp.clientHeight / canvas.height);
  canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
  canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
  canvas.style.transform = '';
  canvas.style.transformOrigin = '';
}

/** 同步把文本推入 RDP 剪贴板队列（不 await，保证在按键之前入队） */
function pushClipboardSync(text: string) {
  if (!session) return;
  try {
    const data = new ClipboardData();
    data.addText('text/plain', text || '');
    // onClipboardPaste 返回 Promise，但内部是同步入队；不 await 以免打断按键时序
    void session.onClipboardPaste(data);
  } catch { /* ignore */ }
}

/** 刷新剪贴板缓存（copy 事件 / 点击画布 / 连接建立时调用） */
function refreshClipboardCache() {
  void readClipboard().then((text) => {
    if (text) cachedClipboardText = text;
  }).catch(() => { /* ignore */ });
}

/** 把本地剪贴板内容实时推送到 RDP 通道（工具栏按钮用，可异步） */
async function syncLocalClipboard(overrideText?: string) {
  if (!session) return;
  try {
    // 复用项目统一剪贴板读取：VSCode 跨源 iframe 走桥接、Electron 走 IPC、浏览器走 API
    const text = overrideText !== undefined ? overrideText : await readClipboard();
    cachedClipboardText = text || '';
    pushClipboardSync(cachedClipboardText);
  } catch { /* ignore */ }
}

async function pasteClipboard() {
  if (status.value !== 'connected' || !session) return;
  // 显式点剪贴板按钮 = 切回文本复制模式
  fileCopyMode = false;
  uploadedFiles.clear();
  await syncLocalClipboard();
}

function openFilePicker() { fileInputRef.value?.click(); }

/** 把本地 File 列表通告到 RDP 剪贴板（上传按钮 / 原生 paste / 拖拽共用） */
function initiateFilesUpload(files: File[]) {
  if (!files.length || !session) return;
  // 每次上传重新编号（uploadedFiles 的 key 须与 initiate_file_copy 的文件列表下标一致）
  uploadedFiles.clear();
  files.forEach((file, index) => {
    uploadedFiles.set(index, file);
    addTransferItem(file.name, '等待远程粘贴');
  });
  try {
    fileCopyMode = true;
    session.invokeExtension(new Extension('initiate_file_copy', files.map((file) => ({
      name: file.name, size: file.size, lastModified: file.lastModified,
    }))));
    toast.info(`已选择 ${files.length} 个文件，请在远程桌面按 Ctrl+V 粘贴`);
  } catch (err: any) {
    fileCopyMode = false;
    setStatus('error', `上传失败: ${formatError(err)}`);
  }
}

async function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  initiateFilesUpload(files);
}

function downloadFiles() {
  if (!session) return;
  pendingDownloads.value.forEach((f) => {
    const streamId = f.index + 1;
    const info = streamToFileInfo.get(streamId);
    if (!info) return;
    session?.invokeExtension(new Extension('request_file_contents', {
      stream_id: streamId, file_index: f.index, flags: 0x00000001,
      position: 0, size: 8, clip_data_id: f.clipDataId,
    }));
  });
}

function reconnect() {
  cleanup(false);
  start();
}

function cleanup(emitClose = true) {
  disposed = true;
  if (session) {
    try { session.shutdown(); } catch { /* ignore */ }
    session = null;
  }
  for (const l of domListeners) {
    try { l.target.removeEventListener(l.type, l.handler, l.options); } catch { /* ignore */ }
  }
  domListeners = [];
  uploadedFiles.clear();
  pendingDownloads.value = [];
  streamToFileInfo.clear();
  transferItems.value = [];
  clipboardReady = false;
  fileCopyMode = false;
  cachedClipboardText = '';
  if (emitClose) setStatus('disconnected');
}

onMounted(() => {
  disposed = false;
  if (viewportEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => fitDisplay());
    resizeObserver.observe(viewportEl.value);
  }
  start();
});
onBeforeUnmount(() => {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  cleanup();
});
watch(() => props.connection?.id, () => {
  cleanup(false);
  disposed = false;
  start();
});
// 切回该 tab 时重新自适应（隐藏期间 viewport 尺寸为 0，fitDisplay 被跳过）
watch(() => props.active, (active) => {
  if (active) nextFit();
});
</script>

<style scoped>
.rdp-tab { display: flex; flex-direction: column; width: 100%; height: 100%; background: #1a1a1a; position: relative; }
.rdp-toolbar { display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 10px; background: #252526; border-bottom: 1px solid #333; color: #ccc; font-size: 12px; flex-shrink: 0; }
.rdp-title { flex: 1; font-weight: 600; }
.rdp-status { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #333; }
.rdp-status.connected { background: #2d5a3d; color: #b7e4c7; }
.rdp-status.error { background: #6b2b2b; color: #f0b7b7; }
.rdp-btn { background: transparent; border: none; color: #ccc; cursor: pointer; padding: 3px 6px; border-radius: 3px; font-size: 13px; }
.rdp-btn:hover:not(:disabled) { background: #3a3a3a; }
.rdp-btn:disabled { opacity: 0.4; cursor: default; }
.rdp-file-input { display: none; }
/* 隐藏粘贴接收层：必须保持可编辑且不可 display:none（否则无法聚焦/接收 paste） */
.rdp-paste-sink { position: absolute; left: -9999px; top: 0; width: 1px; height: 1px; opacity: 0; border: none; padding: 0; resize: none; }
.rdp-viewport { flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #000; position: relative; min-height: 0; }
.rdp-canvas { outline: none; flex-shrink: 0; display: block; }
.rdp-overlay { position: absolute; inset: 34px 0 0 0; display: flex; align-items: center; justify-content: center; background: rgba(26,26,26,0.85); color: #ccc; font-size: 13px; z-index: 5; }
.rdp-error { color: #f0b7b7; }
.rdp-ft-panel { position: absolute; right: 10px; bottom: 10px; width: 240px; max-height: 180px; background: rgba(37,37,38,0.95); border: 1px solid #444; border-radius: 4px; color: #ccc; font-size: 11px; z-index: 4; overflow: hidden; }
.rdp-ft-header { padding: 5px 8px; border-bottom: 1px solid #444; font-weight: 600; }
.rdp-ft-items { max-height: 140px; overflow-y: auto; padding: 4px 8px; }
.rdp-ft-item { display: flex; justify-content: space-between; gap: 6px; padding: 2px 0; }
.rdp-ft-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rdp-ft-state { color: #8ab4f8; flex-shrink: 0; }
</style>
