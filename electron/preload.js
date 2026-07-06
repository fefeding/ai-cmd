/**
 * @file Electron 预加载脚本
 * @description 通过 contextBridge 向渲染进程暴露最小 IPC 通信接口
 */

const { contextBridge, ipcRenderer } = require('electron');

// 终端 IPC 通道（替代 WebSocket）
const terminalIPC = {
  /** 发送消息到主进程（等效 ws.send） */
  send(message) {
    ipcRenderer.send('terminal:message', message);
  },
  /** 监听主进程消息（等效 ws.onmessage） */
  onMessage(callback) {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('terminal:event', handler);
    return () => ipcRenderer.removeListener('terminal:event', handler);
  },
};

// 自动更新 API
const updater = {
  /** 手动检查更新 */
  checkForUpdates() {
    return ipcRenderer.invoke('update:check');
  },
  /** 获取当前更新状态 */
  getStatus() {
    return ipcRenderer.invoke('update:status');
  },
  /** 安装更新并重启 */
  install() {
    return ipcRenderer.invoke('update:install');
  },
  /** 监听更新事件（available, progress, downloaded, error） */
  onEvent(callback) {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('update:event', handler);
    return () => ipcRenderer.removeListener('update:event', handler);
  },
  /** 监听菜单操作（如 check-update） */
  onMenuAction(callback) {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
};

const api = {
  request(pathname, body) {
    return ipcRenderer.invoke('api:request', { pathname, body });
  },
  /**
   * 文件上传（app:// 协议下 fetch 不可用，通过 IPC 上传到主进程）
   * @param {string} sessionId
   * @param {string} fileName
   * @param {ArrayBuffer|Uint8Array} fileData
   */
  uploadFile(sessionId, fileName, fileData) {
    return ipcRenderer.invoke('file:upload', { sessionId, fileName, fileData });
  },
};

// 剪贴板操作
// sandbox 模式下 clipboard 模块不可用，全部通过 IPC 委托主进程操作
const clip = {
  writeText(text) {
    ipcRenderer.send('clipboard:write', text);
  },
  readText() {
    // 同步读取在 sandbox 下不可用，返回空，粘贴走 readTextAsync
    return '';
  },
  /** 异步读取剪贴板（通过 IPC） */
  async readTextAsync() {
    return ipcRenderer.invoke('clipboard:read');
  },
};

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  isPackaged: !process.env.ELECTRON_DEV,
  platform: process.platform,
  api,
  clipboard: clip,
  terminalIPC,
  updater,
});
