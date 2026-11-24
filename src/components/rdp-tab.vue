<template>
  <div class="rdp-tab" ref="rootEl">
    <div class="rdp-toolbar">
      <span class="rdp-title"><i class="bi bi-display me-1"></i>{{ connection?.name || '远程桌面' }}</span>
      <span class="rdp-status" :class="status">{{ statusText }}</span>
      <button class="rdp-btn" :title="t('rdp.reconnect')" @click="reconnect">
        <i class="bi bi-arrow-clockwise"></i>
      </button>
      <button class="rdp-btn" :title="t('rdp.fit')" @click="fitDisplay">
        <i class="bi bi-arrows-fullscreen"></i>
      </button>
    </div>
    <div class="rdp-viewport" ref="viewportEl"></div>
    <div v-if="status === 'connecting'" class="rdp-overlay">
      <div class="spinner-border spinner-border-sm me-2"></div>{{ t('rdp.connecting') }}
    </div>
    <div v-if="status === 'error'" class="rdp-overlay rdp-error">
      <i class="bi bi-exclamation-triangle me-2"></i>{{ errorMessage || t('rdp.connectFailed') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { RdpRenderer, buildInstruction, keySym } from '../utils/rdp-renderer';
import type { ConnectionEntity, WSMessage } from '../typings/connection';

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
const status = ref<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
const errorMessage = ref('');

const statusText = computed(() => {
  if (status.value === 'connecting') return t('tab.connecting');
  if (status.value === 'connected') return t('tab.connected');
  if (status.value === 'error') return t('tab.error');
  return t('tab.disconnected');
});

let ws: WebSocket | any = null;
let ipcCleanup: (() => void) | null = null;
let renderer: RdpRenderer | null = null;
let sessionId: string | null = null;
let mouseButtons = 0;
let connecting = false;
let resizeObserver: ResizeObserver | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let keyUpHandler: ((e: KeyboardEvent) => void) | null = null;
let remoteW = 1280;
let remoteH = 800;

function isElectronIPC(): boolean {
  return !!((window as any).electronAPI?.isElectron && (window as any).electronAPI?.isPackaged);
}

function createIPCAdapter(): any {
  const ipc = (window as any).electronAPI.terminalIPC;
  const adapter: any = {
    readyState: 1,
    send(msg: string) { ipc.send(JSON.parse(msg)); },
    close() { adapter.readyState = 3; },
    onopen: null, onmessage: null, onerror: null, onclose: null,
  };
  const removeListener = ipc.onMessage((msg: any) => {
    if (adapter.onmessage) adapter.onmessage({ data: JSON.stringify(msg) });
  });
  ipcCleanup = () => { removeListener(); adapter.readyState = 3; };
  setTimeout(() => { if (adapter.onopen) adapter.onopen({}); }, 0);
  return adapter;
}

function sendToServer(msg: Record<string, unknown>) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

/** 发送 Guacamole 输入指令 */
function sendInput(inst: string) {
  if (!sessionId) return;
  sendToServer({ type: 'rdp-input', sessionId, data: inst });
}

function setStatus(s: typeof status.value, err?: string) {
  status.value = s;
  if (err) errorMessage.value = err;
  if (s === 'connected') nextTick(() => fitDisplay());
  emit('status-change', s, sessionId || undefined);
}

function connectWebSocket() {
  if (isElectronIPC()) {
    ws = createIPCAdapter();
  } else {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = new URLSearchParams(location.search).get('token');
    const wsUrl = `${protocol}//${location.host}/ws/terminal${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    ws = new WebSocket(wsUrl);
  }

  ws.onopen = () => {
    sendToServer({
      type: 'rdp-create',
      data: { connectionId: props.connection?.id, width: remoteW, height: remoteH },
    });
  };

  ws.onmessage = (event: any) => {
    try {
      const msg: WSMessage = JSON.parse(typeof event.data === 'string' ? event.data : '[binary]');
      handleServerMessage(msg);
    } catch { /* ignore */ }
  };

  ws.onerror = () => setStatus('error', t('rdp.wsFailed'));
  ws.onclose = () => { if (status.value !== 'disconnected') setStatus('disconnected'); };
}

function handleServerMessage(msg: WSMessage) {
  if (msg.sessionId && !sessionId) sessionId = msg.sessionId;
  switch (msg.type) {
    case 'status':
      if (msg.data === 'connected') setStatus('connected');
      break;
    case 'rdp-ready':
      setStatus('connected');
      break;
    case 'rdp-frame': {
      const text = String(msg.data || '');
      renderer?.feed(text);
      break;
    }
    case 'conn-log':
      console.log(`[RDP] ${msg.data}`);
      break;
    case 'close':
      setStatus('disconnected');
      break;
    case 'error':
      setStatus('error', String(msg.data || ''));
      break;
    default:
      break;
  }
}

function initRenderer() {
  if (!viewportEl.value || !props.connection) return;
  const opts = props.connection.options?.rdp || {};
  remoteW = opts.width || 1280;
  remoteH = opts.height || 800;

  renderer = new RdpRenderer(viewportEl.value, remoteW, remoteH, (timestamp) => {
    // guacd 推 sync 后需要回传 ack，否则停止推帧
    sendInput(buildInstruction('sync', timestamp));
  });

  const el = renderer.getElement();

  // 鼠标：按下/移动/松开（左键=1，中键=2，右键=4）
  el.addEventListener('mousedown', (e: MouseEvent) => {
    mouseButtons |= 1 << e.button;
    sendInput(renderer!.mouse(mouseButtons, e.offsetX, e.offsetY));
    e.preventDefault();
  });
  window.addEventListener('mouseup', (e: MouseEvent) => {
    mouseButtons &= ~(1 << e.button);
    sendInput(renderer!.mouse(mouseButtons, e.offsetX, e.offsetY));
  });
  el.addEventListener('mousemove', (e: MouseEvent) => {
    sendInput(renderer!.mouse(mouseButtons, e.offsetX, e.offsetY));
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  // 键盘
  keyHandler = (e: KeyboardEvent) => {
    const sym = keySym(e.key);
    if (sym) { sendInput(renderer!.key(1, sym)); e.preventDefault(); }
  };
  keyUpHandler = (e: KeyboardEvent) => {
    const sym = keySym(e.key);
    if (sym) { sendInput(renderer!.key(0, sym)); e.preventDefault(); }
  };
  window.addEventListener('keydown', keyHandler);
  window.addEventListener('keyup', keyUpHandler);

  resizeObserver = new ResizeObserver(() => fitDisplay());
  resizeObserver.observe(viewportEl.value);
}

function fitDisplay() {
  if (!renderer || !viewportEl.value) return;
  const scale = Math.min(
    viewportEl.value.clientWidth / remoteW,
    viewportEl.value.clientHeight / remoteH,
    1,
  );
  const el = renderer.getElement();
  el.style.transform = `scale(${scale})`;
  el.style.transformOrigin = '0 0';
}

function reconnect() {
  cleanup(false);
  start();
}

function start() {
  if (connecting) return;
  connecting = true;
  setStatus('connecting');
  initRenderer();
  connectWebSocket();
  nextTick(() => { connecting = false; });
}

function cleanup(emitClose = true) {
  if (keyHandler) { window.removeEventListener('keydown', keyHandler); keyHandler = null; }
  if (keyUpHandler) { window.removeEventListener('keyup', keyUpHandler); keyUpHandler = null; }
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  if (sessionId && emitClose) sendToServer({ type: 'rdp-close', sessionId });
  if (renderer) { renderer.dispose(); renderer = null; }
  if (ws) { try { ws.close(); } catch { /* */ } ws = null; }
  if (ipcCleanup) { ipcCleanup(); ipcCleanup = null; }
  sessionId = null;
}

onMounted(() => { start(); });
onBeforeUnmount(() => { cleanup(); });
watch(() => props.connection?.id, () => { reconnect(); });
</script>

<style scoped>
.rdp-tab { display: flex; flex-direction: column; width: 100%; height: 100%; background: #1a1a1a; position: relative; }
.rdp-toolbar { display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 10px; background: #252526; border-bottom: 1px solid #333; color: #ccc; font-size: 12px; flex-shrink: 0; }
.rdp-title { flex: 1; font-weight: 600; }
.rdp-status { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #333; }
.rdp-status.connected { background: #2d5a3d; color: #b7e4c7; }
.rdp-status.connecting { background: #5a4a2d; color: #f0dfb7; }
.rdp-status.error { background: #5a2d2d; color: #f0b7b7; }
.rdp-btn { background: transparent; border: none; color: #ccc; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.rdp-btn:hover { background: #3a3a3a; }
.rdp-viewport { flex: 1; overflow: hidden; background: #000; position: relative; }
.rdp-overlay { position: absolute; inset: 34px 0 0 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.75); color: #eee; font-size: 13px; z-index: 10; }
.rdp-overlay.rdp-error { color: #ffb7b7; padding: 20px; text-align: center; }
</style>
