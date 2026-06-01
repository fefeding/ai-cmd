/**
 * @file Electron 自动更新模块
 * @description 使用 electron-updater 检测、下载和安装应用更新
 *
 * 更新流程：
 * 1. 应用启动时自动检查更新
 * 2. 发现新版本 → 通知渲染进程显示提示
 * 3. 后台下载更新（利用 blockmap 增量下载）
 * 4. 下载完成 → 通知渲染进程显示"重启安装"按钮
 * 5. 用户确认后重启并安装
 */

const { autoUpdater } = require('electron-updater');
const { BrowserWindow, ipcMain, app } = require('electron');

// 更新状态
let updateAvailable = null;
let updateDownloaded = false;
let downloadProgress = null;

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

  // 配置 autoUpdater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // 事件监听
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
    broadcastUpdate('checking', null);
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[Updater] Update available: v${info.version}`);
    updateAvailable = info;
    updateDownloaded = false;
    broadcastUpdate('available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log(`[Updater] Already up to date: v${info.version}`);
    updateAvailable = null;
    updateDownloaded = false;
    broadcastUpdate('not-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    downloadProgress = {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    };
    // 每 10% 广播一次，避免过于频繁
    if (downloadProgress.percent % 10 === 0) {
      broadcastUpdate('progress', downloadProgress);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Updater] Update downloaded: v${info.version}`);
    updateDownloaded = true;
    broadcastUpdate('downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('[Updater] Error:', error.message);
    updateAvailable = null;
    updateDownloaded = false;
    downloadProgress = null;
    // 静默处理网络错误，不打扰用户
    if (!error.message.includes('net::') && !error.message.includes('ENOTFOUND')) {
      broadcastUpdate('error', { message: error.message });
    }
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
 * 检查更新
 */
async function checkForUpdates() {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('[Updater] Check failed:', err.message);
  }
}

/**
 * 安装更新并重启
 */
function quitAndInstall() {
  if (updateDownloaded) {
    autoUpdater.quitAndInstall();
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
      updateDownloaded,
      downloadProgress,
    };
  });

  // 渲染进程请求安装更新
  ipcMain.handle('update:install', () => {
    quitAndInstall();
    return { installing: true };
  });
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  quitAndInstall,
};
