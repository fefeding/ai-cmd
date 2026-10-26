import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { createPinia } from 'pinia';
import i18n from '@/utils/i18n';

import 'bootstrap/dist/css/bootstrap.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@/assets/main.css';
import 'bootstrap';

import toastPlugin from '@/components/toast/index';
import modalPlugin from '@/components/modal/index';
import { installVscodeClipboardBridge } from '@/utils/vscode-clipboard';
import { installSelectionCopy } from '@/utils/selection-copy';

// VSCode WebView 跨源 iframe 内：为普通输入框（AI 配置 / AI 对话等）安装剪贴板桥接
installVscodeClipboardBridge();

// 宿主可能不向页面派发右键事件（无原生菜单也无 contextmenu），安装「选中即浮现复制按钮」
installSelectionCopy();

const app = createApp(App);
const pinia = createPinia();

app.use(router);
app.use(pinia);
app.use(i18n);
app.use(toastPlugin);
app.use(modalPlugin);

app.mount('#app');
