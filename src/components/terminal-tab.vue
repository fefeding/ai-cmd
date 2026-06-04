<template>
  <div class="terminal-wrapper" ref="terminalWrapper">
    <div class="terminal-container" ref="terminalContainer"></div>
    
    <!-- AI 按钮 -->
    <button 
      v-if="status === 'connected'" 
      class="ai-toggle-btn" 
      :class="{ active: showAIChat }"
      :style="showAIChat ? { right: (aiChatWidth + 12) + 'px' } : {}"
      @click="toggleAIChat"
      :title="t('ai.chat')"
    >
      <i class="bi bi-robot"></i>
    </button>

    <!-- AI 对话面板 -->
    <div v-show="showAIChat" class="ai-chat-wrapper" :style="{ width: aiChatWidth + 'px' }" ref="aiChatWrapperRef">
      <div class="ai-resize-handle" @mousedown="startResize"></div>
      <AIChat
        ref="aiChatRef"
        :sessionId="sessionId || tabId"
        :sessionName="props.connection.name"
        :connectionId="props.connection.id"
        :isOpen="showAIChat"
        :getTerminalContext="getTerminalContext"
        @close="showAIChat = false"
        @ws-send="handleAISend"
        @open-settings="$emit('open-ai-settings')"
      />
    </div>

    <div v-if="status === 'connecting'" class="terminal-status">
      <div class="spinner-border spinner-border-sm text-warning me-2"></div>
      {{ t('tab.connecting') }}
    </div>
    <div v-if="status === 'error'" class="terminal-status text-danger">
      <i class="bi bi-exclamation-triangle me-2"></i>
      {{ t('tab.connectionFailed') }}: {{ errorMessage }}
    </div>
    <div v-if="status === 'disconnected'" class="terminal-status text-secondary">
      <i class="bi bi-wifi-off me-2"></i>
      {{ t('tab.disconnected') }}
      <button class="btn btn-sm btn-outline-light ms-3" @click="reconnect">
        <i class="bi bi-arrow-clockwise me-1"></i>{{ t('tab.reconnect') }}
      </button>
    </div>
    <div v-if="status === 'reconnecting'" class="terminal-status text-warning">
      <div class="spinner-border spinner-border-sm text-warning me-2"></div>
      {{ t('tab.reconnecting') }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import type { ConnectionEntity, WSMessage } from '@/typings/connection';
import { createSentry, base64ToOctets, stringToOctets, octetsToBase64, Zmodem } from '@/utils/zmodem';
import AIChat from '@/components/ai-chat/index.vue';

const { t } = useI18n();

const props = defineProps<{
  tabId: string;
  connection: ConnectionEntity;
  active: boolean;
}>();

const emit = defineEmits<{
  (e: 'status-change', status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting', sessionId?: string): void;
  (e: 'zmodem-detected', detection: any): void;
  (e: 'open-ai-settings'): void;
}>();

const terminalWrapper = ref<HTMLElement>();
const terminalContainer = ref<HTMLElement>();
const status = ref<'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting'>('connecting');
const errorMessage = ref('');

// AI 聊天相关
const showAIChat = ref(false);
const aiChatRef = ref<InstanceType<typeof AIChat>>();

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let ws: WebSocket | null = null;
let ipcCleanup: (() => void) | null = null;
let sessionId: string | null = null;
let resizeObserver: ResizeObserver | null = null;
let sentry: any = null;
let zmodemSession: any = null;
let zmodemRole: string | null = null; // 'send' | 'receive'
let fileUploadResultCallback: ((msg: WSMessage) => void) | null = null;

// 初始化终端
function initTerminal() {
  if (!terminalContainer.value) return;

  terminal = new Terminal({
    cols: props.connection.terminal?.cols || 80,
    rows: props.connection.terminal?.rows || 24,
    fontSize: props.connection.terminal?.fontSize || 14,
    fontFamily: props.connection.terminal?.fontFamily || '"JetBrains Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace',
    theme: props.connection.terminal?.theme === 'light' ? {
      background: '#eff1f5',
      foreground: '#4c4f69',
      cursor: '#dc8a78',
      cursorAccent: '#eff1f5',
      selectionBackground: '#acb0be40',
      selectionForeground: '#4c4f69',
      black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
      blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be',
      brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b', brightYellow: '#df8e1d',
      brightBlue: '#1e66f5', brightMagenta: '#ea76cb', brightCyan: '#179299', brightWhite: '#bcc0cc',
    } : {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      cursorAccent: '#1e1e2e',
      selectionBackground: '#585b7066',
      selectionForeground: '#cdd6f4',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
      brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
    },
    cursorStyle: props.connection.terminal?.cursorStyle || 'block',
    cursorBlink: true,
    cursorInactiveStyle: 'outline',
    scrollback: 5000,
    lineHeight: 1.2,
    letterSpacing: 0.5,
    // @ts-ignore
    wordWrap: true,
    allowProposedApi: true,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  terminal.open(terminalContainer.value);

  // 自适应大小
  nextTick(() => {
    fitAddon?.fit();
  });

  // 监听用户输入
  terminal.onData((data) => {
    sendToServer({ type: 'terminal', sessionId: sessionId || undefined, data });
  });

  // 监听二进制数据
  terminal.onBinary((data) => {
    sendToServer({ type: 'terminal', sessionId: sessionId || undefined, data });
  });

  // 监听大小变化
  terminal.onResize(({ cols, rows }) => {
    sendToServer({ type: 'resize', sessionId: sessionId || undefined, data: { cols, rows } });
  });

  // 初始化 ZMODEM Sentry
  initSentry();
}

// 初始化 ZMODEM Sentry
function initSentry() {
  console.log('[ZMODEM] Initializing Sentry...');
  sentry = createSentry({
    toTerminal: (octets: number[]) => {
      // 将 octets 写入终端
      if (terminal && octets.length > 0) {
        // 调试：检查写入终端的数据是否包含 ZMODEM 特征
        const hasZm = octets.length >= 4 && octets.some((_, i) =>
          i + 3 < octets.length &&
          octets[i] === 42 && octets[i+1] === 42 && octets[i+2] === 24 && octets[i+3] === 66
        );
        if (hasZm) {
          console.warn('[ZMODEM] !!! Sentry passed ZMODEM bytes to terminal! length:', octets.length,
            'bytes:', octets.slice(0, 30).join(','));
        }
        terminal.write(new Uint8Array(octets));
      }
    },
    sender: (octets: number[]) => {
      // 将 ZMODEM 协议数据发送到服务器（base64 编码）
      const b64 = octetsToBase64(octets);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'terminal',
          sessionId: sessionId || undefined,
          data: b64,
          binary: true,
        }));
      }
    },
    onDetect: (detection: any) => {
      const role = detection.get_session_role();
      console.log('[ZMODEM] >>>> onDetect fired! role:', role, 'existingSession:', !!zmodemSession);

      // 【关键防护】如果已有活跃 ZMODEM session，忽略新的检测
      // 原因：rz 时浏览器发送 ZRINIT 回应，PTY 可能回显 ZRINIT 字节
      // sentry 会把回显的 ZRINIT 误检为 Session.Send（role='send'），
      // 覆盖正确的 Session.Receive（role='receive'）
      if (zmodemSession) {
        console.warn('[ZMODEM] Ignoring duplicate detection (role:', role, '), session already active');
        try { detection.deny(); } catch(_e) { /* ignore */ }
        return;
      }

      console.log('[ZMODEM] Detected:', role, '- auto-confirming immediately');

      // 立即 confirm，防止后续 ZRQINIT/ZRINIT 导致 detection 变 stale
      try {
        const session = detection.confirm();
        zmodemSession = session;
        zmodemRole = role;

        // 【关键补丁1】预注册所有可能的事件类型，防止 "Bad event" 异常
        // Session.Send 没有注册 'offer' 等事件，如果意外触发会崩溃
        const neededEvents = ['offer', 'data_in', 'file_end'];
        for (const evt of neededEvents) {
          if (!session._on_evt || session._on_evt[evt] === undefined) {
            console.log('[ZMODEM] Pre-registering missing event:', evt);
            try { session._Add_event(evt); } catch(_e) { /* ignore */ }
          }
        }

        // 【关键补丁2】包装 session.consume 以安全处理事件时序问题
        const _origSessionConsume = session.consume.bind(session);
        const _eventBuffer: Array<{evt: string, args: any[]}> = [];
        let _handlersReady = false;

        // 包装 _Happen 来缓存或安全忽略早期事件
        const _origHappen = session._Happen.bind(session);
        session._Happen = function(this: any, evt: string, ...args: any[]) {
          if (!_handlersReady) {
            // handlers 尚未注册，缓存事件
            console.log('[ZMODEM] Early event (buffering):', evt);
            _eventBuffer.push({ evt, args });
            return;
          }
          return _origHappen(evt, ...args);
        };

        // 包装 consume 捕获任何未处理的异常
        session.consume = function(octets: number[]) {
          try {
            return _origSessionConsume(octets);
          } catch (err: any) {
            console.warn('[ZMODEM] session.consume() error (caught):', err);
          }
        };

        // 监听 session 结束，清理状态以便下次检测
        // 直接包装内部方法，不走 _Happen 事件系统，确保不被缓冲
        const _origOnSessionEnd = session._on_session_end?.bind(session);
        if (_origOnSessionEnd) {
          session._on_session_end = function() {
            console.log('[ZMODEM] Session ended, cleaning up state');
            zmodemSession = null;
            zmodemRole = null;
            return _origOnSessionEnd();
          };
        }

        // 通知 file-transfer 组件时，传递一个 replay 函数
        // 当 handlers 注册完毕后调用，重放缓存的事件
        const markHandlersReady = () => {
          _handlersReady = true;
          console.log('[ZMODEM] Handlers ready, replaying', _eventBuffer.length, 'buffered events');
          for (const item of _eventBuffer) {
            try {
              _origHappen(item.evt, ...item.args);
            } catch (e) {
              console.warn('[ZMODEM] Replay error for', item.evt, ':', e);
            }
          }
          _eventBuffer.length = 0;
        };

        if (role === 'send') {
          // zmodem.js: ZRINIT → Session.Send → role='send'
          // rz 发送 ZRINIT，浏览器应上传文件
          console.log('[ZMODEM] rz detected (ZRINIT) - browser will send files');
          emit('zmodem-detected', { role, session, markHandlersReady });
        } else {
          // zmodem.js: ZRQINIT → Session.Receive → role='receive'
          // sz 发送 ZRQINIT，浏览器应下载文件
          console.log('[ZMODEM] sz detected (ZRQINIT) - browser will receive files');
          emit('zmodem-detected', { role, session, markHandlersReady });
        }
      } catch (err) {
        console.error('[ZMODEM] Auto-confirm error:', err);
        zmodemSession = null;
        zmodemRole = null;
      }
    },
    onRetract: () => {
      console.log('[ZMODEM] Retracted - detection invalidated');
      // 只在没有已确认 session 时清理（retract 只影响 pending detection）
      if (!zmodemSession) {
        zmodemRole = null;
      }
    },
  });
  console.log('[ZMODEM] Sentry initialized:', !!sentry);
}

// 检测是否在 Electron 生产模式中（桌面客户端生产模式用 IPC，开发模式/Web 端用 WebSocket）
function isElectronIPC(): boolean {
  return !!((window as any).electronAPI?.isElectron && (window as any).electronAPI?.isPackaged);
}

/**
 * IPC 适配器 - 在 Electron 中模拟 WebSocket 接口
 * 通过 preload 暴露的 terminalIPC 与主进程通信
 */
function createIPCAdapter(): WebSocket {
  const ipc = (window as any).electronAPI.terminalIPC;
  const adapter: any = {
    readyState: 1, // OPEN
    send(msg: string) {
      ipc.send(JSON.parse(msg));
    },
    close() {
      adapter.readyState = 3; // CLOSED
      if (adapter.onclose) adapter.onclose({ code: 1000, reason: 'IPC closed' });
    },
    onopen: null as any,
    onmessage: null as any,
    onerror: null as any,
    onclose: null as any,
  };

  // 监听主进程消息
  const removeListener = ipc.onMessage((msg: any) => {
    if (adapter.onmessage) {
      adapter.onmessage({ data: JSON.stringify(msg) });
    }
  });

  // 立即触发 onopen（IPC 无需等待连接）
  setTimeout(() => {
    if (adapter.onopen) adapter.onopen({});
  }, 0);

  // 保存清理函数
  ipcCleanup = () => {
    removeListener();
    adapter.readyState = 3;
  };

  return adapter as WebSocket;
}

// WebSocket / IPC 连接
function connectWebSocket() {
  if (isElectronIPC()) {
    // Electron（开发/生产均走 IPC）
    console.log('[TerminalTab] Using Electron IPC');
    ws = createIPCAdapter();
  } else {
    // Web 端：使用 WebSocket
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws/terminal`;
    console.log(`[TerminalTab] Connecting to WebSocket: ${wsUrl}`);
    ws = new WebSocket(wsUrl);
  }

  ws.onopen = () => {
    console.log(`[TerminalTab] WebSocket connected, sending create`);
    // 发送创建会话请求
    sendToServer({
      type: 'create',
      data: {
        connectionId: props.connection.id,
        cols: terminal?.cols || 80,
        rows: terminal?.rows || 24,
        name: props.connection.name,
      }
    });
  };

  ws.onmessage = (event) => {
    const dataStr = typeof event.data === 'string' ? event.data : '[binary]';
    console.log(`[TerminalTab] WS message:`, dataStr.substring(0, 100));
    try {
      const msg: WSMessage = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {
      console.error('WebSocket message parse error:', e);
    }
  };

  ws.onerror = (err) => {
    console.error('[TerminalTab] WebSocket error:', err);
    setStatus('error', t('tab.wsFailed'));
  };

  ws.onclose = (event) => {
    console.log(`[TerminalTab] WebSocket closed, code: ${event.code}, reason: ${event.reason}`);
    if (status.value !== 'disconnected' && status.value !== 'reconnecting') {
      setStatus('disconnected');
    }
    // WebSocket 断开后自动尝试重连
    scheduleReconnect();
  };
}

// 重连相关
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 2000; // 基础延迟 2 秒

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[TerminalTab] Max reconnect attempts reached');
    return;
  }
  const delay = RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempts);
  console.log(`[TerminalTab] Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`);
  reconnectTimer = setTimeout(() => {
    reconnect();
  }, delay);
}

function reconnect() {
  // 清除之前的重连定时器
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  console.log('[TerminalTab] Reconnecting...');
  setStatus('reconnecting');
  reconnectAttempts++;

  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    // WebSocket 已断开，重新建立连接
    connectWebSocket();
  } else {
    // WebSocket 还活着，只是 SSH 断开了，发送重连请求
    sendToServer({
      type: 'reconnect',
      sessionId: sessionId || undefined,
      data: {
        connectionId: props.connection.id,
        cols: terminal?.cols || 80,
        rows: terminal?.rows || 24,
        name: props.connection.name,
      }
    });
  }
}

/** Hex header length (without CR+LF): type(2) + flags(8) + crc(4) = 14 hex chars + 5 prefix = 19, or 18 without CR */
const ZMODEM_HEX_HEADER_LEN = 19; // with CR before LF
const ZMODEM_HEX_HEADER_LEN_NO_CR = 18;

/**
 * 手动检测 ZRQINIT/ZRINIT hex 帧
 * 搜索 **\x18B0 前缀 + 正确的 hex header 结构（含 CR+LF 校验）
 */
function detectZmodemFrame(octets: number[]): { type: 'ZRQINIT' | 'ZRINIT'; offset: number; frameLen: number } | null {
  for (let i = 0; i <= octets.length - 20; i++) {
    if (octets[i] === 42 && octets[i+1] === 42 && octets[i+2] === 24 &&
        octets[i+3] === 66 && octets[i+4] === 48) {
      // 找到 **\x18B0 前缀，验证 hex header 结构
      // 在 i+5 开始搜索 CR(0x0d)+LF(0x8a) 或 LF(0x0a)
      const searchEnd = Math.min(i + 25, octets.length);
      for (let j = i + 5; j < searchEnd; j++) {
        if (octets[j] === 0x8a || octets[j] === 0x0a) {
          // 检查 CR+LF: LF 前一字节应为 CR(0x0d 或 0x8d)
          const hexLen = j - i; // 从 ** 到 LF(含) 的长度
          if ((hexLen === ZMODEM_HEX_HEADER_LEN + 1 && (octets[j-1] === 0x0d || octets[j-1] === 0x8d)) ||
              hexLen === ZMODEM_HEX_HEADER_LEN_NO_CR + 1) {
            // 有效 hex header! 检查帧类型
            const frameLen = j - i + 1; // 包含 LF
            // 可选：也包含尾部 XON (0x11)
            const totalLen = (j + 1 < octets.length && octets[j+1] === 0x11) ? frameLen + 1 : frameLen;
            if (octets[i+5] === 48) return { type: 'ZRQINIT', offset: i, frameLen: totalLen };
            if (octets[i+5] === 49) return { type: 'ZRINIT', offset: i, frameLen: totalLen };
          }
          break;
        }
      }
    }
  }
  return null;
}

/**
 * 手动创建 ZMODEM session 并设置到 sentry
 * 完全绕过 sentry 的检测机制（因为 Vite 缓存导致 _parse_hex patch 不生效）
 */
function createManualSession(type: 'ZRQINIT' | 'ZRINIT', frameOctets: number[]) {
  let session: any;
  let role: string;

  if (type === 'ZRQINIT') {
    // sz 命令发送 ZRQINIT → 远程发送 → 浏览器接收 → Session.Receive
    session = new (Zmodem.Session as any).Receive();
    role = 'receive';
  } else {
    // rz 命令发送 ZRINIT → 远程接收 → 浏览器发送 → Session.Send
    session = new (Zmodem.Session as any).Send(
      Zmodem.Header.build('ZRINIT', ['CANFDX', 'CANOVIO', 'CANFC32'])
    );
    role = 'send';
  }

  zmodemSession = session;
  zmodemRole = role;
  console.log('[ZMODEM] Manual session created:', role, '(' + type + ')');

  // 【关键】清理 sentry 内部状态，防止旧缓存数据干扰
  sentry._cache = [];
  sentry._parsed_session = null;
  sentry._zsession = session;

  // 注册 garbage 事件（将非 ZMODEM 数据输出到终端）
  session.on('garbage', (garbage: number[]) => {
    if (terminal && garbage.length > 0) {
      terminal.write(new Uint8Array(garbage));
    }
  });

  // session 结束时清理 sentry 和本地状态
  session.on('session_end', () => {
    console.log('[ZMODEM] Session ended (via event), cleaning up');
    sentry._zsession = null;
    zmodemSession = null;
    zmodemRole = null;
  });

  // 设置 sender（将 ZMODEM 协议数据发回远程）
  session.set_sender((octets: number[]) => {
    const b64 = octetsToBase64(octets);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'terminal',
        sessionId: sessionId || undefined,
        data: b64,
        binary: true,
      }));
    }
  });

  // 预注册 Receive session 才有的事件，防止 Session.Send 被误创建时崩溃
  const neededEvents = ['offer', 'data_in', 'file_end'];
  for (const evt of neededEvents) {
    if (!session._on_evt || session._on_evt[evt] === undefined) {
      try { session._Add_event(evt); } catch(_e) { /* ignore */ }
    }
  }

  // 事件缓冲（handlers 注册前的事件先缓存）
  const _eventBuffer: Array<{evt: string, args: any[]}> = [];
  let _handlersReady = false;
  const _origHappen = session._Happen.bind(session);
  session._Happen = function(evt: string, ...args: any[]) {
    if (!_handlersReady) {
      _eventBuffer.push({ evt, args });
      return;
    }
    return _origHappen(evt, ...args);
  };

  const _origSessionConsume = session.consume.bind(session);
  session.consume = function(octets: number[]) {
    try { return _origSessionConsume(octets); }
    catch (err: any) {
      console.warn('[ZMODEM] session.consume() error (caught):', err);
      throw err; // 重新抛出，让 handleServerMessage 处理
    }
  };

  // 包装 _on_session_end 确保状态清理（不走 _Happen 事件系统）
  const _origOnSessionEnd = session._on_session_end?.bind(session);
  if (_origOnSessionEnd) {
    session._on_session_end = function() {
      console.log('[ZMODEM] _on_session_end called, cleaning up');
      zmodemSession = null;
      zmodemRole = null;
      return _origOnSessionEnd();
    };
  }

  const markHandlersReady = () => {
    _handlersReady = true;
    console.log('[ZMODEM] Handlers ready, replaying', _eventBuffer.length, 'buffered events');
    for (const item of _eventBuffer) {
      try { _origHappen(item.evt, ...item.args); } catch (e) { /* ignore */ }
    }
    _eventBuffer.length = 0;
  };

  // 通知父组件
  emit('zmodem-detected', { role, session, markHandlersReady });
}

// 处理服务端消息
function handleServerMessage(msg: WSMessage) {
  switch (msg.type) {
    case 'terminal':
      if (msg.data && sentry) {
        let octets: number[];
        if (msg.binary) {
          octets = base64ToOctets(msg.data as string);
        } else {
          octets = stringToOctets(msg.data as string);
        }
        try {
          // 检查已有 session 是否已结束（例如 ZFIN 后）
          // 如果已结束，清理状态并将数据直接写到终端
          if (zmodemSession) {
            try {
              if (zmodemSession.has_ended?.()) {
                console.log('[ZMODEM] Session already ended, cleaning up and passing data to terminal');
                zmodemSession = null;
                zmodemRole = null;
                sentry._zsession = null;
                sentry._cache = [];
                if (terminal && octets.length > 0) {
                  terminal.write(new Uint8Array(octets));
                }
                return;
              }
            } catch (e) {
              // has_ended 可能抛异常，忽略
            }
          }

          // 【核心修复】zmodem.js 的 _parse_hex 在整个 buffer 中搜索 LF，
          // 当 ZRQINIT/ZRINIT 帧前面有文本时解析失败。
          // Vite 缓存导致 node_modules 的 patch 不生效。
          // 方案：完全绕过 sentry 的检测，手动识别 ZMODEM 帧。
          if (!zmodemSession) {
            const frameInfo = detectZmodemFrame(octets);
            if (frameInfo) {
              console.log('[ZMODEM] Manual detection:', frameInfo.type,
                'at offset', frameInfo.offset, 'frameLen:', frameInfo.frameLen);
              // 将帧前的文本直接写到终端（绕过 sentry）
              if (frameInfo.offset > 0) {
                const textPart = octets.slice(0, frameInfo.offset);
                console.log('[ZMODEM] Writing prefix text to terminal:', textPart.length, 'bytes');
                if (terminal) terminal.write(new Uint8Array(textPart));
              }
              // 提取帧数据
              const frameData = octets.slice(frameInfo.offset, frameInfo.offset + frameInfo.frameLen);
              // 手动创建 session（会清理 sentry 缓存并设置 _zsession）
              createManualSession(frameInfo.type, frameData);
              // 帧之后的尾部数据（如果有）通过 sentry 路由（现在 _zsession 已设置）
              const trailing = octets.slice(frameInfo.offset + frameInfo.frameLen);
              if (trailing.length > 0) {
                console.log('[ZMODEM] Passing trailing bytes to sentry:', trailing.length);
                sentry.consume(trailing);
              }
              return;
            }
            // 没有检测到帧，且没有活跃 session → 正常通过 sentry
            // （sentry 可能检测到但我们没检测到，让它处理）
          }
          sentry.consume(octets);
        } catch (err: any) {
          // sentry/session 抛出错误 → 强制清理 ZMODEM 状态并恢复终端
          console.warn('[ZMODEM] handleServerMessage error, force cleanup:', err?.message || err);
          zmodemSession = null;
          zmodemRole = null;
          try { sentry._zsession = null; sentry._cache = []; sentry._parsed_session = null; } catch (_) { /* ignore */ }
          if (terminal && octets.length > 0) {
            terminal.write(new Uint8Array(octets));
          }
        }
      }
      break;

    case 'status':
      if (msg.sessionId) {
        sessionId = msg.sessionId;
      }
      if (msg.data === 'connected') {
        reconnectAttempts = 0; // 重置重连计数
        setStatus('connected', msg.sessionId);
      }
      break;

    case 'close':
      setStatus('disconnected');
      break;

    case 'error':
      setStatus('error', msg.data || '连接失败');
      break;

    case 'ai-agent-event':
      // 转发 Agent 事件到 AIChat 组件
      if (aiChatRef.value && msg.event) {
        aiChatRef.value.handleAgentEvent(msg.event);
      }
      break;

    case 'monitor-event':
      // 转发监控事件到 AIChat 组件
      if (aiChatRef.value && msg.event) {
        aiChatRef.value.handleMonitorEvent(msg.event);
      }
      break;

    case 'file-upload-result':
      // 转发 SFTP 上传结果到 file-transfer 组件
      if (fileUploadResultCallback) {
        fileUploadResultCallback(msg);
      }
      break;
  }
}

// 发送消息到服务端
function sendToServer(msg: WSMessage) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// 更新状态
function setStatus(s: typeof status.value, detail?: string) {
  status.value = s;
  if (s === 'error' && detail) errorMessage.value = detail;
  emit('status-change', s, sessionId || undefined);
}

// 聚焦终端
function focus() {
  terminal?.focus();
}

// 自适应大小
function fit() {
  nextTick(() => {
    fitAddon?.fit();
  });
}

// 写入数据到终端（用于 ZMODEM 等场景）
function writeToTerminal(data: string) {
  terminal?.write(data);
}

// 获取终端实例
function getTerminal() {
  return terminal;
}

// 获取 ZMODEM session 对象
function getZmodemSession() {
  return zmodemSession;
}

// 获取 ZMODEM role
function getZmodemRole() {
  return zmodemRole;
}

// 获取 Sentry 实例
function getSentry() {
  return sentry;
}

// 监听 active 状态变化，切换时重新 fit
watch(() => props.active, (val) => {
  if (val) {
    nextTick(() => {
      fit();
      focus();
    });
  }
});

onMounted(() => {
  initTerminal();

  // ResizeObserver 监听容器大小变化（监听 terminal-container，因为 flex 布局下它会随 AI 面板开合而变化）
  if (terminalContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      if (props.active) fit();
    });
    resizeObserver.observe(terminalContainer.value);
  }

  // 建立 WebSocket 连接
  connectWebSocket();
});

onBeforeUnmount(() => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  resizeObserver?.disconnect();
  ws?.close();
  ipcCleanup?.();
  terminal?.dispose();
});

defineExpose({ focus, fit, writeToTerminal, getTerminal, getZmodemSession, getZmodemRole, getSentry, sendToServer, setFileUploadCallback: (cb: ((msg: WSMessage) => void) | null) => { fileUploadResultCallback = cb; }, _getWsState: () => ws ? (ws.readyState === WebSocket.OPEN ? 'open' : ws.readyState === WebSocket.CONNECTING ? 'connecting' : ws.readyState === WebSocket.CLOSING ? 'closing' : 'closed') : 'null', get sessionId() { return sessionId; } });

// AI 相关方法
const aiChatWrapperRef = ref<HTMLElement>();
const aiChatWidth = ref(380);
const AI_CHAT_MIN_WIDTH = 280;
const AI_CHAT_MAX_WIDTH_RATIO = 0.6; // 最大宽度为容器的 60%

function startResize(e: MouseEvent) {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = aiChatWidth.value;
  const containerWidth = terminalWrapper.value?.clientWidth || 800;
  const maxWidth = containerWidth * AI_CHAT_MAX_WIDTH_RATIO;

  const onMouseMove = (ev: MouseEvent) => {
    const delta = startX - ev.clientX; // 向左拖 = 宽度增加
    const newWidth = Math.min(Math.max(startWidth + delta, AI_CHAT_MIN_WIDTH), maxWidth);
    aiChatWidth.value = newWidth;
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function toggleAIChat() {
  showAIChat.value = !showAIChat.value;
}

function getTerminalContext(): string {
  // 获取终端最近的输出内容
  if (!terminal) return '';
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let i = Math.max(0, buffer.cursorY - 50); i <= buffer.cursorY; i++) {
    const line = buffer.getLine(i);
    if (line) {
      lines.push(line.translateToString(true));
    }
  }
  return lines.join('\n');
}

function handleExecuteCommand(command: string) {
  // 将命令发送到终端
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendToServer({ 
      type: 'terminal', 
      sessionId: sessionId || undefined, 
      data: command + '\n' 
    });
  }
}

// AI Agent WebSocket 发送
function handleAISend(msg: any) {
  sendToServer(msg);
}
</script>

<style scoped>
.terminal-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  display: flex;
}

.terminal-container {
  flex: 1;
  height: 100%;
  padding: 4px;
  min-width: 0;
  overflow: hidden;
}

.terminal-status {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  font-size: 14px;
  padding: 12px 24px;
  background-color: rgba(0, 0, 0, 0.6);
  border-radius: 8px;
  z-index: 10;
}

/* AI 按钮 */
.ai-toggle-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: rgba(49, 50, 68, 0.9);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.2s, right 0.15s ease;
  z-index: 20;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.ai-toggle-btn:hover {
  background: rgba(69, 71, 90, 0.95);
  color: var(--accent);
  transform: scale(1.05);
}

.ai-toggle-btn.active {
  background: var(--accent);
  color: white;
}

/* AI 对话面板包装器 */
.ai-chat-wrapper {
  position: relative;
  width: 380px;
  min-width: 280px;
  height: 100%;
  flex-shrink: 0;
  z-index: 15;
  will-change: transform;
  transform: translateZ(0);
}

/* AI 拖拽调整宽度的手柄 */
.ai-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 20;
  background: transparent;
  transition: background 0.2s;
}
.ai-resize-handle:hover,
.ai-resize-handle:active {
  background: var(--accent, #89b4fa);
  opacity: 0.6;
}
</style>
