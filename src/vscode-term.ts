/**
 * VSCode 扩展 WebView 专用终端页（vscode-term.html 入口）。
 *
 * 复用完整的 TerminalTab 组件——它与桌面端完全一致的终端体验，
 * 自带：AI 对话面板（机器人按钮）、文件管理器（文件夹按钮）、
 * ZMODEM 收发（sz/rz）等能力，但不渲染侧边栏 / Tab 栏 / 连接管理。
 *
 * 一个连接打开一个独立 tab；连接信息由查询参数传入：
 *   ?connectionId=xxx&name=连接名
 * 缺省 connectionId 或不传时视为本地 Shell（id = __local__）。
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import i18n from '@/utils/i18n';
import VscodeTermWrapper from '@/vscode-term-wrapper.vue';
import { initVscodeTheme } from '@/utils/vscode-theme';

import 'bootstrap/dist/css/bootstrap.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@/assets/main.css';
import 'bootstrap';

import toastPlugin from '@/components/toast/index';
import modalPlugin from '@/components/modal/index';

// 跟随 VSCode 主题（非 VSCode 环境为空操作）
initVscodeTheme();

const params = new URLSearchParams(location.search);
const connectionId = params.get('connectionId') || '__local__';
const name =
  params.get('name') ||
  (connectionId === '__local__' ? '本地 Shell' : connectionId);

// 每个 WebView 页生成独立 tabId，作为 AI 会话 / 组件 key
const tabId = `vscode-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const connection = {
  id: connectionId,
  name,
  type: connectionId === '__local__' ? 'local' : 'ssh',
  host: '',
  username: '',
  terminal: {} as any,
} as any;

const app = createApp(VscodeTermWrapper, {
  tabId,
  connection,
});
app.use(createPinia());
app.use(i18n);
app.use(toastPlugin);
app.use(modalPlugin);
app.mount('#app');
