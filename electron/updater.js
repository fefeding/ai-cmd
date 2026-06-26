/**
 * @file Electron 自动更新模块
 * @description 使用 electron-updater 仅检测是否有新版本
 *
 * 更新策略（仅提示，不自动更新）：
 * 1. 应用启动时自动检查更新
 * 2. 发现新版本 → 通知渲染进程在顶部显示条幅提示
 * 3. 用户点击条幅跳转到下载页自行下载安装
 * 4. 不自动下载、不自动安装；所有更新错误静默忽略，不再报错
 */

const { autoUpdater } = require('electron-updater');
const { BrowserWindow, ipcMain, app } = require('electron');

// 更新状态
let updateAvailable = null;

/**
 * 向所有窗口广播更新事件
 */
function broadcastUpdate(event, data) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('update:event', { event, data });
    }
  });
}

/**
 * 初始化自动更新
 * @param {object} options - 配置选项
 * @param {boolean} options.isDev - 是否开发模式
 */
function initAutoUpdater(options = {}) {
  // 开发模式下禁用自动更新
  if (options.isDev) {
    console.log('[Updater] Disabled in dev mode');
    return;
  }

  // 未打包时禁用（如通过 npm start 运行的 Web 模式）
  if (!app.isPackaged) {
    console.log('[Updater] Disabled: app is not packaged');
    return;
  }

  // 仅检查更新，不自动下载，不自动安装
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // 事件监听
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[Updater] Update available: v${info.version}`);
    updateAvailable = info;
    broadcastUpdate('available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log(`[Updater] Already up to date: v${info.version}`);
    updateAvailable = null;
  });

  // 所有错误静默忽略，不再向渲染进程广播，避免报错打扰用户
  autoUpdater.on('error', (error) => {
    console.log('[Updater] Error (ignored):', error?.message || error);
  });

  // 注册 IPC 处理器
  setupUpdateIPC();

  // 延迟 3 秒后检查更新（避免启动时太卡）
  setTimeout(() => {
    checkForUpdates();
  }, 3000);

  // 每小时检查一次更新
  setInterval(() => {
    checkForUpdates();
  }, 60 * 60 * 1000);
}

/**
 * 检查更新（错误静默忽略）
 */
async function checkForUpdates() {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.log('[Updater] Check failed (ignored):', err?.message || err);
  }
}

/**
 * 注册更新相关的 IPC 通道
 */
function setupUpdateIPC() {
  // 渲染进程请求检查更新
  ipcMain.handle('update:check', async () => {
    await checkForUpdates();
    return { checking: true };
  });

  // 渲染进程请求获取当前更新状态
  ipcMain.handle('update:status', () => {
    return {
      updateAvailable: updateAvailable
        ? {
            version: updateAvailable.version,
            releaseDate: updateAvailable.releaseDate,
          }
        : null,
    };
  });
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
};
