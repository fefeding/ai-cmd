/**
 * @file Electron 预加载脚本
 * @description 向渲染进程暴露终端 IPC 通信接口（替代 WebSocket）
 *
 * 在 nodeIntegration: true + contextIsolation: false 下，
 * 直接挂载到 window 对象，渲染进程通过 window.electronAPI 访问
 */

const { ipcRenderer } = require('electron');
const path = require('path');

// 服务端模块绝对路径（供渲染进程 require 使用）
const serverModulePath = path.join(process.resourcesPath, 'app.asar', 'dist', 'server', 'index.js');

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

window.electronAPI = {
  isElectron: true,
  isPackaged: !process.env.ELECTRON_DEV,
  platform: process.platform,
  serverModulePath,
  terminalIPC,
  updater,
};
