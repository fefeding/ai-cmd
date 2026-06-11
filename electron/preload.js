/**
 * @file Electron 预加载脚本
 * @description 通过 contextBridge 向渲染进程暴露最小 IPC 通信接口
 */

const { contextBridge, ipcRenderer, clipboard } = require('electron');

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
};

// 剪贴板操作（contextIsolation 下渲染进程无法直接访问 navigator.clipboard）
const clip = {
  writeText(text) {
    clipboard.writeText(text);
  },
  readText() {
    return clipboard.readText();
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
