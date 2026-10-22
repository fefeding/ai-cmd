# Changelog

## 0.1.17

- 修复 VSCode 扩展内**所有**输入框（终端、AI 配置、AI 对话、文件管理等）的复制/粘贴：新增全局剪贴板桥接 `installVscodeClipboardBridge`，polyfill `navigator.clipboard` 并拦截原生 `copy`/`cut`/`paste` 事件，统一经扩展 `vscode.env.clipboard` 完成，仅在 VSCode WebView 运行时生效。

## 0.1.16

- 修复 VSCode 扩展内终端（WebView 跨源 iframe）无法复制/粘贴的问题：新增剪贴板桥接，经「iframe → 宿主 WebView → 扩展 `vscode.env.clipboard` → 宿主 WebView → iframe」完成读写。

## 0.1.15

- 修复打包后启动报错「未找到后端构建产物 dist/server/index.js」。
