/**
 * VSCode 扩展「新增 / 编辑连接」专用页（vscode-edit.html 入口）。
 *
 * 复用桌端完整的 ConnectionEditor 组件（含表单 / 测试连接 / 保存），
 * 通过 iframe 在 WebView 面板中以弹窗形式呈现。编辑时按 ?id= 拉取连接；
 * 新增时不传 id。保存成功后向宿主 postMessage，由扩展刷新树并关闭面板。
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import i18n from '@/utils/i18n';
import VscodeEditWrapper from '@/vscode-edit-wrapper.vue';
import { initVscodeTheme } from '@/utils/vscode-theme';
import { installVscodeClipboardBridge } from '@/utils/vscode-clipboard';
import { installSelectionCopy } from '@/utils/selection-copy';

import 'bootstrap/dist/css/bootstrap.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@/assets/main.css';
import 'bootstrap';

import toastPlugin from '@/components/toast/index';
import modalPlugin from '@/components/modal/index';

// 跟随 VSCode 主题（非 VSCode 环境为空操作）
initVscodeTheme();

// VSCode WebView 跨源 iframe 内：为表单输入框安装剪贴板桥接
installVscodeClipboardBridge();

// 宿主可能不向页面派发右键事件（无原生菜单也无 contextmenu），安装「选中即浮现复制按钮」
installSelectionCopy();

const params = new URLSearchParams(location.search);
const id = params.get('id') || undefined;

const app = createApp(VscodeEditWrapper, { id });
app.use(createPinia());
app.use(i18n);
app.use(toastPlugin);
app.use(modalPlugin);
app.mount('#app');
