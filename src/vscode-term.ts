/**
 * VSCode 扩展 WebView 专用终端页（vscode-term.html 入口）。
 *
 * 复用完整 TerminalTab 组件——它与桌面端完全一致的终端体验，
 * 自带：AI 对话面板（机器人按钮）、文件管理器（文件夹按钮）、
 * ZMODEM 收发（sz/rz）等能力，但不渲染侧边栏 / Tab 栏 / 连接管理。
 * 对 RDP 类型连接则渲染 IronRDP-WASM 远程桌面组件。
 *
 * 一个连接打开一个独立 tab；连接信息由查询参数传入：
 *   ?connectionId=xxx&name=连接名&type=ssh|rdp|local
 * 缺省 connectionId 或不传时视为本地 Shell（id = __local__）。
 * 连接类型从 query.type 或后端连接配置推断，避免把 RDP 误当 SSH。
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import i18n from '@/utils/i18n';
import VscodeTermWrapper from '@/vscode-term-wrapper.vue';
import { initVscodeTheme } from '@/utils/vscode-theme';
import { installVscodeClipboardBridge } from '@/utils/vscode-clipboard';
import { installSelectionCopy } from '@/utils/selection-copy';
import { ConnectionService } from '@/service/connection';

import 'bootstrap/dist/css/bootstrap.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@/assets/main.css';
import 'bootstrap';

import toastPlugin from '@/components/toast/index';
import modalPlugin from '@/components/modal/index';

// 跟随 VSCode 主题（非 VSCode 环境为空操作）
initVscodeTheme();

// VSCode WebView 跨源 iframe 内：为普通输入框（AI 对话 / 文件管理等）安装剪贴板桥接
installVscodeClipboardBridge();

// 宿主可能不向页面派发右键事件（无原生菜单也无 contextmenu），安装「选中即浮现复制按钮」
installSelectionCopy();

const params = new URLSearchParams(location.search);
const connectionId = params.get('connectionId') || '__local__';
const nameParam = params.get('name');
const typeParam = params.get('type');

async function resolveConnection(): Promise<any> {
  if (connectionId === '__local__') {
    return {
      id: '__local__',
      name: nameParam || '本地 Shell',
      type: 'local',
      host: '',
      username: '',
      terminal: {} as any,
    };
  }

  // 优先用后端连接配置（含 RDP 的 host/port/凭据/options），避免仅凭 id 猜测类型
  try {
    const conn = await new ConnectionService().getConnectionById(connectionId);
    const data = conn?.ret === 0 ? conn.data : conn;
    if (data && data.id) {
      return { ...data, name: nameParam || data.name };
    }
  } catch { /* 拉取失败则回退到 query 推断 */ }

  return {
    id: connectionId,
    name: nameParam || connectionId,
    type: typeParam === 'rdp' ? 'rdp' : 'ssh',
    host: '',
    username: '',
    terminal: {} as any,
  };
}

resolveConnection().then((connection) => {
  // 每个 WebView 页生成独立 tabId，作为 AI 会话 / 组件 key
  const tabId = `vscode-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const app = createApp(VscodeTermWrapper, {
    tabId,
    connection,
  });
  app.use(createPinia());
  app.use(i18n);
  app.use(toastPlugin);
  app.use(modalPlugin);
  app.mount('#app');
});
