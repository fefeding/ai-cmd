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

// VSCode WebView 跨源 iframe 内：为普通输入框（AI 配置 / AI 对话等）安装剪贴板桥接
installVscodeClipboardBridge();

const app = createApp(App);
const pinia = createPinia();

app.use(router);
app.use(pinia);
app.use(i18n);
app.use(toastPlugin);
app.use(modalPlugin);

app.mount('#app');
