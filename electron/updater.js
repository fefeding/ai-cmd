/**
 * @file 版本更新检查模块
 * @description 通过 GitHub Releases API 检查是否有新版本，仅 toast 提示，不自动下载
 *
 * 更新策略：
 * 1. 应用启动时自动检查 GitHub 最新 release 版本
 * 2. 发现新版本 → 通知渲染进程显示 toast 提示
 * 3. 用户点击 toast 跳转到下载页自行下载安装
 * 4. 不自动下载、不自动安装；所有错误静默忽略
 */

const { BrowserWindow, ipcMain, app, net } = require('electron');

// GitHub Releases API
const GITHUB_API = 'https://api.github.com/repos/fefeding/ai-cmd/releases/latest';
const DOWNLOAD_URL = 'https://github.com/fefeding/ai-cmd/releases/latest';

// 当前版本
const currentVersion = app.getVersion();

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
 * 通过 GitHub API 检查最新版本
 */
async function checkForUpdates() {
  try {
    const response = await net.fetch(GITHUB_API, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AICmd-Updater',
      },
    });

    if (!response.ok) {
      console.log(`[Updater] GitHub API returned ${response.status}`);
      return;
    }

    const release = await response.json();
    const latestVersion = release.tag_name?.replace(/^v/, '') || '';

    if (!latestVersion) {
      console.log('[Updater] Could not parse latest version');
      return;
    }

    console.log(`[Updater] Current: v${currentVersion}, Latest: v${latestVersion}`);

    if (compareVersions(latestVersion, currentVersion) > 0) {
      console.log(`[Updater] New version available: v${latestVersion}`);
      updateAvailable = {
        version: latestVersion,
        releaseDate: release.published_at,
        releaseNotes: release.body,
        downloadUrl: release.html_url || DOWNLOAD_URL,
      };
      broadcastUpdate('available', {
        version: latestVersion,
        downloadUrl: release.html_url || DOWNLOAD_URL,
      });
    } else {
      console.log('[Updater] Already up to date');
      updateAvailable = null;
    }
  } catch (err) {
    console.log('[Updater] Check failed (ignored):', err?.message || err);
  }
}

/**
 * 简单的语义化版本比较
 * @returns {number} 正数表示 v1 > v2，负数表示 v1 < v2，0 表示相等
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const a = parts1[i] || 0;
    const b = parts2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
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
            downloadUrl: updateAvailable.downloadUrl,
          }
        : null,
    };
  });
}

/**
 * 初始化更新检查
 * @param {object} options - 配置选项
 * @param {boolean} options.isDev - 是否开发模式
 */
function initAutoUpdater(options = {}) {
  // 开发模式下禁用
  if (options.isDev) {
    console.log('[Updater] Disabled in dev mode');
    return;
  }

  // 未打包时禁用
  if (!app.isPackaged) {
    console.log('[Updater] Disabled: app is not packaged');
    return;
  }

  console.log(`[Updater] Initialized, current version: v${currentVersion}`);

  // 注册 IPC 处理器
  setupUpdateIPC();

  // 延迟 5 秒后检查更新（避免启动时太卡）
  setTimeout(() => {
    checkForUpdates();
  }, 5000);

  // 每 4 小时检查一次更新
  setInterval(() => {
    checkForUpdates();
  }, 4 * 60 * 60 * 1000);
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
};
