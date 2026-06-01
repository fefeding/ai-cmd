/**
 * @file Electron 主进程入口
 * @description 创建桌面窗口，通过 IPC 直接处理终端通信（无需 HTTP/WebSocket 服务）
 *
 * 生产模式：加载本地 HTML，API 通过 nodeIntegration 直接 require，终端通过 IPC 通信
 * 开发模式：连接 Vite 开发服务器（API 走 HTTP，终端走 WebSocket）
 */

const { app, BrowserWindow, shell, ipcMain, protocol, net, Menu } = require('electron');
const path = require('path');
const { initAutoUpdater } = require('./updater');

// ========== 注册自定义协议（必须在 app.whenReady 之前） ==========
// 解决 file:// 协议下绝对路径（/public/xxx.js）无法加载的问题
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
]);

// 解析命令行参数
const args = process.argv.slice(app.isPackaged ? 1 : 2);
const devUrl = args.find(a => a.startsWith('--dev-url='))?.split('=')[1];
const isDev = !!devUrl;

let mainWindow = null;

// ========== 服务实例（延迟加载） ==========
let _services = null;

function getServices() {
  if (_services) return _services;
  if (isDev) {
    // 开发模式下服务端由 Vite 开发服务器提供，主进程不加载
    console.warn('[Electron] Dev mode: services are provided by Vite dev server, IPC disabled');
    return null;
  }
  // 加载编译后的服务端模块（生产模式从 dist/ 加载）
  const serverModule = require(path.join(__dirname, '..', 'dist', 'server', 'index.js'));
  _services = {
    sshService: serverModule.sshService,
    connectionService: serverModule.connectionService,
    aiService: serverModule.aiService,
    monitorService: serverModule.monitorService,
  };
  return _services;
}

// ========== 终端 IPC 处理（替代 WebSocket） ==========

// 跟踪每个窗口的 sessionId 列表（用于窗口关闭时清理）
const windowSessions = new Map();

function setupTerminalIPC() {
  ipcMain.on('terminal:message', async (event, msg) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const send = (response) => {
      if (!win.isDestroyed()) {
        win.webContents.send('terminal:event', response);
      }
    };

    const { type, sessionId: sid, data } = msg;
    const services = getServices();
    if (!services) {
      send({ type: 'error', data: 'Services not available (dev mode - use Vite WebSocket instead)' });
      return;
    }
    const { sshService, aiService, monitorService } = services;

    try {
      switch (type) {
        case 'create': {
          const { connectionId, cols, rows, name } = data || {};
          if (!connectionId) {
            send({ type: 'error', data: 'Missing connectionId' });
            return;
          }
          const sessionId = sid || `ssh-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;

          // 跟踪此窗口的 session
          if (!windowSessions.has(win.id)) windowSessions.set(win.id, new Set());
          windowSessions.get(win.id).add(sessionId);

          const session = await sshService.createSession(sessionId, connectionId, cols || 80, rows || 24, name);

          // 绑定输出
          const sendOutput = (chunk) => {
            if (win.isDestroyed()) return;
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const hasBinary = buf.some(b => b > 127);
            if (!hasBinary) {
              try { sshService.notifyOutput(sessionId, buf.toString('utf-8')); } catch (e) { /* ignore */ }
            }
            if (hasBinary) {
              send({ type: 'terminal', sessionId, data: buf.toString('base64'), binary: true });
            } else {
              send({ type: 'terminal', sessionId, data: buf.toString('utf-8') });
            }
          };
          const sendClose = (source) => () => {
            console.log(`[IPC] ${source} closed: ${sessionId}`);
            send({ type: 'close', sessionId });
          };

          if (session.pty) {
            session.pty.onData(sendOutput);
            session.pty.onExit(sendClose('Local PTY'));
          } else if (session.childProcess) {
            session.childProcess.stdout.on('data', sendOutput);
            session.childProcess.stderr.on('data', sendOutput);
            session.childProcess.on('close', sendClose('Local shell'));
          } else if (session.stream) {
            session.stream.on('data', sendOutput);
            session.stream.on('close', sendClose('SSH stream'));
          }

          send({ type: 'status', sessionId, data: 'connected' });
          break;
        }

        case 'reconnect': {
          if (sid) {
            sshService.closeSession(sid);
          }
          // 复用 create 逻辑
          const { connectionId, cols, rows, name } = data || {};
          if (!connectionId) {
            send({ type: 'error', data: 'Missing connectionId' });
            return;
          }
          const sessionId = sid || `ssh-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;

          if (!windowSessions.has(win.id)) windowSessions.set(win.id, new Set());
          windowSessions.get(win.id).add(sessionId);

          const session = await sshService.createSession(sessionId, connectionId, cols || 80, rows || 24, name);

          const sendOutput = (chunk) => {
            if (win.isDestroyed()) return;
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const hasBinary = buf.some(b => b > 127);
            if (!hasBinary) {
              try { sshService.notifyOutput(sessionId, buf.toString('utf-8')); } catch (e) { /* ignore */ }
            }
            if (hasBinary) {
              send({ type: 'terminal', sessionId, data: buf.toString('base64'), binary: true });
            } else {
              send({ type: 'terminal', sessionId, data: buf.toString('utf-8') });
            }
          };
          const sendClose = (source) => () => {
            send({ type: 'close', sessionId });
          };

          if (session.pty) {
            session.pty.onData(sendOutput);
            session.pty.onExit(sendClose('Local PTY'));
          } else if (session.childProcess) {
            session.childProcess.stdout.on('data', sendOutput);
            session.childProcess.stderr.on('data', sendOutput);
            session.childProcess.on('close', sendClose('Local shell'));
          } else if (session.stream) {
            session.stream.on('data', sendOutput);
            session.stream.on('close', sendClose('SSH stream'));
          }

          send({ type: 'status', sessionId, data: 'connected' });
          break;
        }

        case 'terminal': {
          if (sid && data) {
            if (msg.binary) {
              sshService.writeData(sid, Buffer.from(data, 'base64'));
            } else {
              sshService.writeData(sid, data);
            }
          }
          break;
        }

        case 'resize': {
          if (sid && data) {
            sshService.resize(sid, data.cols, data.rows);
          }
          break;
        }

        case 'close': {
          if (sid) {
            sshService.closeSession(sid);
            const sessions = windowSessions.get(win.id);
            if (sessions) sessions.delete(sid);
          }
          break;
        }

        case 'ai-agent-run': {
          const { aiSessionId, message, context, skillId, locale } = data || {};
          if (!aiSessionId || !message) {
            send({ type: 'ai-agent-event', event: { type: 'error', error: 'Missing params' } });
            return;
          }
          aiService.agentRun(aiSessionId, message, context, (agentEvent) => {
            send({ type: 'ai-agent-event', sessionId: aiSessionId, event: agentEvent });
          }, skillId, locale).catch((err) => {
            send({ type: 'ai-agent-event', sessionId: aiSessionId, event: { type: 'error', error: err.message } });
          });
          break;
        }

        case 'ai-agent-stop': {
          const { aiSessionId: stopSid } = data || {};
          if (stopSid) aiService.stopAgent(stopSid);
          break;
        }

        default:
          send({ type: 'error', data: `Unknown message type: ${type}` });
      }
    } catch (err) {
      console.error('[IPC] Error processing message:', err);
      send({ type: 'error', data: err.message || 'Internal error' });
    }
  });
}

// ========== 注册监控事件回调 ==========

function setupMonitorEvents() {
  const services = getServices();
  if (services?.monitorService) {
    services.monitorService.onEvent((sid, event) => {
      // 广播到所有窗口（简化处理）
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('terminal:event', { type: 'monitor-event', sessionId: sid, event });
        }
      });
    });
  }
}

// ========== 窗口关闭清理 ==========

function cleanupWindow(win) {
  const sessions = windowSessions.get(win.id);
  if (sessions) {
    const services = getServices();
    if (services) {
      sessions.forEach(sid => {
        try {
          services.monitorService.stopSessionMonitors(sid);
          services.sshService.closeSession(sid);
        } catch (e) { /* ignore */ }
      });
    }
    windowSessions.delete(win.id);
  }
}

// ========== 创建窗口 ==========

function createWindow(loadTarget) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'AICmd - AI Terminal',
    icon: path.join(__dirname, '..', 'public', process.platform === 'darwin' ? 'favicon.icns' : process.platform === 'win32' ? 'favicon.ico' : 'favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (loadTarget.startsWith('http')) {
    mainWindow.loadURL(loadTarget);
  } else if (loadTarget.startsWith('app://')) {
    mainWindow.loadURL(loadTarget);
  } else {
    mainWindow.loadFile(loadTarget);
  }

  mainWindow.on('closed', () => {
    if (mainWindow) {
      cleanupWindow(mainWindow);
      mainWindow = null;
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ========== 应用菜单 ==========

function setupMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Connection', accelerator: 'CmdOrCtrl+N', click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('menu:action', 'new-connection');
          }
        }},
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal('https://github.com/fefeding/ai-cmd') },
        { label: 'Report Issue', click: () => shell.openExternal('https://github.com/fefeding/ai-cmd/issues') },
        { type: 'separator' },
        { label: 'About', click: () => shell.openExternal('https://aigcwhere.com/opensource/aicmd') },
        { type: 'separator' },
        { label: 'Check for Updates...', click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('menu:action', 'check-update');
          }
        }},
      ],
    },
  ];

  // macOS 需要添加 app 菜单
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { label: 'About AICmd', click: () => shell.openExternal('https://aigcwhere.com/opensource/aicmd') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ========== 应用生命周期 ==========

app.whenReady().then(() => {
  // 注册 app:// 协议处理器（生产模式加载本地文件）
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    // app://local/xxx → 项目根目录/dist/xxx
    const filePath = path.join(__dirname, '..', 'dist', pathname);
    return net.fetch('file://' + filePath);
  });

  setupTerminalIPC();
  setupMenu();

  // 初始化服务（仅生产模式加载模块，开发模式由 Vite 提供）
  try {
    const services = getServices();
    if (services) {
      setupMonitorEvents();
      console.log('[Electron] Services initialized (production mode)');
    } else {
      console.log('[Electron] Services skipped (dev mode - using Vite dev server)');
    }
  } catch (e) {
    console.error('[Electron] Failed to initialize services:', e.message);
  }

  let target;
  if (isDev) {
    target = devUrl;
    console.log(`[Electron] Dev mode, connecting to ${target}`);
  } else {
    target = 'app://local/view/index.html';
    console.log(`[Electron] Production mode, loading ${target}`);
  }

  createWindow(target);

  // 初始化自动更新（生产模式启用，开发模式自动禁用）
  initAutoUpdater({ isDev });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(target);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
