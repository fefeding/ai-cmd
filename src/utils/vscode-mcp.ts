/**
 * VSCode WebView（跨源 iframe）对话上下文桥接。
 *
 * 终端页运行在扩展 WebView 的 iframe 中（源为本地 http://127.0.0.1:port），
 * 与扩展宿主通信统一走 postMessage，由扩展壳转发：
 *
 *   iframe → 壳 → 扩展宿主：{ type: 'aicmd-chat-context-request' }
 *   扩展宿主 → 壳 → iframe：{ type: 'aicmd-chat-context-capability', ... }
 *   iframe → 壳 → 扩展宿主：{ type: 'aicmd-attach-chat', snapshot, ... }
 *
 * 能力由扩展宿主返回：原生 VSCode 只有在常用 AI 对话插件激活后才 available；
 * CodeBuddy / Trae / Cursor / Windsurf 等按各自 chat 命令探测。非 VSCode 环境
 * （桌面 Electron / 浏览器）为空操作。这里不调用后端 MCP，也不维护绑定状态。
 */
import { isVscodeThemeHost } from './vscode-theme';

export type ChatAdapter = 'codebuddy' | 'trae' | 'workbench-chat' | 'clipboard-focus';

export interface ChatContextCapability {
  available: boolean;
  adapter?: ChatAdapter;
  focusCommand?: string;
  host?: string;
}

export interface TerminalChatContextPayload {
  type: 'aicmd-attach-chat';
  sessionId: string;
  sessionName?: string;
  connectionId?: string;
  connectionType?: string;
  host?: string;
  username?: string;
  snapshot: string;
}

type CapabilityListener = (capability: ChatContextCapability) => void;

let capability: ChatContextCapability = { available: false };
const listeners = new Set<CapabilityListener>();
let initialized = false;
let pollTimer: number | undefined;

function post(msg: object): void {
  try {
    window.parent?.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
}

/** 是否显示「添加到 AI 对话」菜单（由扩展宿主的能力探测结果决定） */
export function isChatContextAvailable(): boolean {
  return isVscodeThemeHost() && capability.available;
}

/** 订阅能力变化，订阅时立即回调一次当前值 */
export function onChatContextAvailability(cb: CapabilityListener): () => void {
  listeners.add(cb);
  cb(capability);
  return () => listeners.delete(cb);
}

/** 向扩展宿主请求一次能力探测（插件激活状态可能在页面打开后变化） */
export function requestChatContextCapability(): void {
  if (!isVscodeThemeHost()) return;
  post({ type: 'aicmd-chat-context-request' });
}

/** 初始化桥接：只注册一次监听，并在 iframe 就绪后主动拉取能力 */
export function initChatContextBridge(): void {
  if (initialized || !isVscodeThemeHost()) return;
  initialized = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as (ChatContextCapability & { type?: string }) | null;
    if (!d || d.type !== 'aicmd-chat-context-capability') return;
    capability = {
      available: !!d.available,
      adapter: d.adapter,
      focusCommand: d.focusCommand,
      host: d.host,
    };
    for (const listener of listeners) {
      try {
        listener(capability);
      } catch {
        /* ignore */
      }
    }
  });
  requestChatContextCapability();
  window.addEventListener('load', requestChatContextCapability);
  // onDidChange 不覆盖插件延迟激活：低频重探，让 AI 插件后启动也能出现菜单
  pollTimer = window.setInterval(requestChatContextCapability, 5000);
}

/** 页面卸载时可显式停止轮询（通常 iframe 生命周期结束时浏览器自动清理） */
export function disposeChatContextBridge(): void {
  if (pollTimer !== undefined) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
  initialized = false;
}

/** 把终端输出快照作为上下文送进扩展宿主的 AI 对话输入框 */
export function attachTerminalToChat(
  payload: Omit<TerminalChatContextPayload, 'type'>
): void {
  post({ ...payload, type: 'aicmd-attach-chat' } as TerminalChatContextPayload);
}
