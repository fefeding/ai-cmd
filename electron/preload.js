/**
 * @file Electron 预加载脚本
 * @description 向渲染进程暴露终端 IPC 通信接口（替代 WebSocket）
 *
 * 在 nodeIntegration: true + contextIsolation: false 下，
 * 直接挂载到 window 对象，渲染进程通过 window.electronAPI 访问
 */

const { ipcRenderer } = require('electron');

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

window.electronAPI = {
  isElectron: true,
  isPackaged: !process.env.ELECTRON_DEV,
  platform: process.platform,
  terminalIPC,
};
