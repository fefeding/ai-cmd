# Changelog

## 0.1.20

- AI 对话体验优化：
  - 新增生成状态/动画：助手消息等待响应时显示跳动圆点、流式输出时显示闪烁光标；头部运行期间显示「生成中...」+ 实时耗时。
  - 新增执行耗时反馈：工具调用进行中显示旋转图标；头部耗时超过 30s 变为红色「执行较慢，可点击停止」提示。

## 0.1.19

- 修复 CodeBuddy 等 VSCode 系宿主下 AI 对话 / AI 配置输入框复制粘贴全失效：宿主会注入 `electronAPI.clipboard`，此前错误的宿主判定会使桥接安装被跳过、且请求命中该无效实现。现统一以「iframe 是否由扩展壳加载」为准判定，宿主 preload 降级为桥接失败后的兜底。

## 0.1.18

- 修复 VSCode WebView 内 AI 配置 / AI 对话等输入框仍无法复制粘贴：跨源 iframe 下浏览器不会派发 `copy`/`paste` 事件，改为直接拦截 `Ctrl/Cmd + C/X/V` 快捷键完成复制/剪切/粘贴（粘贴时按光标插入并派发 `input` 事件更新 `v-model`）。
- 补齐连接编辑页（`vscode-edit.ts`）遗漏安装的剪贴板桥接。

## 0.1.17

- 修复 VSCode 扩展内**所有**输入框（终端、AI 配置、AI 对话、文件管理等）的复制/粘贴：新增全局剪贴板桥接 `installVscodeClipboardBridge`，polyfill `navigator.clipboard` 并拦截原生 `copy`/`cut`/`paste` 事件，统一经扩展 `vscode.env.clipboard` 完成，仅在 VSCode WebView 运行时生效。

## 0.1.16

- 修复 VSCode 扩展内终端（WebView 跨源 iframe）无法复制/粘贴的问题：新增剪贴板桥接，经「iframe → 宿主 WebView → 扩展 `vscode.env.clipboard` → 宿主 WebView → iframe」完成读写。

## 0.1.15

- 修复打包后启动报错「未找到后端构建产物 dist/server/index.js」。
