#!/usr/bin/env node

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

// 日志文件路径
const logFilePath = path.resolve(__dirname, 'server.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
const originalLog = console.log;
const originalError = console.error;

console.log = function (...args) {
  const output = args.map(a => {
    if (typeof a === 'object') return JSON.stringify(a);
    return String(a);
  }).join(' ') + '\n';
  logStream.write(`[${new Date().toISOString()}] ${output}`);
  originalLog.apply(console, args);
};

console.error = function (...args) {
  const output = args.map(a => {
    if (typeof a === 'object') return JSON.stringify(a);
    return String(a);
  }).join(' ') + '\n';
  logStream.write(`[${new Date().toISOString()}] [ERROR] ${output}`);
  originalError.apply(console, args);
};

// 创建 express 应用
const app = express();
const server = http.createServer(app);

// 静态文件目录
const staticDir = path.join(__dirname, 'dist');

// 解析 JSON 请求体
app.use(express.json());

// 检查 server 构建产物
const serverIndexPath = path.join(__dirname, 'dist/server/index.js');
if (!fs.existsSync(serverIndexPath)) {
  console.error(`[ERROR] 找不到 server 构建产物: ${serverIndexPath}`);
  console.error('[ERROR] 请先运行构建: pnpm run build-only');
  process.exit(1);
}

// 设置 CORS 头
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 处理 API 请求
app.use('/api/', async (req, res, next) => {
  if (req.method === 'POST') {
    try {
      const serverModule = require('./dist/server/index.js');
      const result = await serverModule.handleRoutes(req.originalUrl, req.body);
      res.status(200).json({ ret: 0, msg: 'success', data: result });
    } catch (error) {
      console.error('API Error:', error);
      res.status(500).json({ ret: 500, msg: error.message || 'Internal server error' });
    }
  } else {
    next();
  }
});

// 静态文件
app.use('/public', express.static(path.join(staticDir, 'public'), { dotfiles: 'allow' }));

// SPA fallback
app.use((req, res) => {
  const indexPath = path.join(staticDir, 'view', 'index.html');
  res.sendFile(indexPath, { dotfiles: 'allow' }, (err) => {
    if (err) {
      res.status(500).send('Error loading index.html:' + err.toString());
    }
  });
});

// ========== WebSocket 服务 ==========
const wss = new WebSocket.Server({ server, path: '/ws/terminal' });
console.log(`[WS] WebSocket server created on path /ws/terminal`);

wss.on('connection', async (ws, req) => {
  let sessionId = null;
  console.log(`[WS] Client connected from ${req.socket.remoteAddress}`);

  // 提取会话创建逻辑，供 create 和 reconnect 复用
  async function createSSHSession(sid, data) {
    const serverModule = require('./dist/server/index.js');
    const { sshService } = serverModule;
    const { connectionId, cols, rows, name } = data || {};
    if (!connectionId) {
      ws.send(JSON.stringify({ type: 'error', data: '缺少 connectionId' }));
      return;
    }

    sessionId = sid || `ssh-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[WS] Creating SSH session: ${sessionId}, connectionId: ${connectionId}`);

    const session = await sshService.createSession(sessionId, connectionId, cols || 80, rows || 24, name);
    console.log(`[WS] SSH session created: ${sessionId}`);

    // 根据会话类型绑定输出和关闭事件
    const sendOutput = (chunk) => {
      if (ws.readyState === WebSocket.OPEN) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const hasBinary = buf.some(b => b > 127);
        if (hasBinary) {
          ws.send(JSON.stringify({ type: 'terminal', sessionId, data: buf.toString('base64'), binary: true }));
        } else {
          ws.send(JSON.stringify({ type: 'terminal', sessionId, data: buf.toString('utf-8') }));
        }
      }
    };
    const sendClose = (source) => () => {
      console.log(`[WS] ${source} closed: ${sessionId}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'close', sessionId }));
      }
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

    ws.send(JSON.stringify({ type: 'status', sessionId, data: 'connected' }));
    console.log(`[WS] Session ${sessionId} connected, status sent`);
  }

  ws.on('message', async (raw) => {
    console.log(`[WS] Received raw message: ${raw.toString().substring(0, 200)}`);
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      console.error('[WS] Invalid message format:', e.message);
      ws.send(JSON.stringify({ type: 'error', data: 'Invalid message format' }));
      return;
    }

    const { type, sessionId: sid, data } = msg;
    console.log(`[WS] Processing message type: ${type}, sessionId: ${sid}`);

    try {
      const serverModule = require('./dist/server/index.js');
      const { sshService, connectionService } = serverModule;

      if (!sshService || !connectionService) {
        console.error('[WS] Server module not loaded properly');
        ws.send(JSON.stringify({ type: 'error', data: 'Server module not loaded' }));
        return;
      }

      switch (type) {
        case 'create': {
          // 创建新的 SSH 会话
          try {
            await createSSHSession(sid, data);
          } catch (err) {
            console.error(`[WS] SSH session creation failed: ${err.message}`);
            ws.send(JSON.stringify({ type: 'error', sessionId, data: err.message || 'SSH 连接失败' }));
          }
          break;
        }

        case 'reconnect': {
          // 重连：关闭旧会话并重新创建
          console.log(`[WS] Reconnecting session: ${sid}`);
          try {
            const serverModule = require('./dist/server/index.js');
            // 先关闭旧会话
            if (sid) {
              serverModule.sshService.closeSession(sid);
            }
            await createSSHSession(sid, data);
          } catch (err) {
            console.error(`[WS] SSH session reconnect failed: ${err.message}`);
            ws.send(JSON.stringify({ type: 'error', sessionId, data: err.message || '重连失败' }));
          }
          break;
        }

        case 'terminal': {
          // 用户输入转发到 SSH
          if (sid && data) {
            if (msg.binary) {
              // 二进制数据（ZMODEM等）
              sshService.writeData(sid, Buffer.from(data, 'base64'));
            } else {
              sshService.writeData(sid, data);
            }
          }
          break;
        }

        case 'resize': {
          // 调整终端大小
          if (sid && data) {
            sshService.resize(sid, data.cols, data.rows);
          }
          break;
        }

        case 'close': {
          // 关闭会话
          if (sid) {
            console.log(`[WS] Closing session: ${sid}`);
            sshService.closeSession(sid);
          }
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'error', data: `Unknown message type: ${type}` }));
      }
    } catch (err) {
      console.error('[WS] Error processing message:', err);
      ws.send(JSON.stringify({ type: 'error', data: err.message || '服务端异常' }));
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected, sessionId: ${sessionId}`);
    // WebSocket 断开时关闭关联的 SSH 会话
    if (sessionId) {
      try {
        const serverModule = require('./dist/server/index.js');
        serverModule.sshService.closeSession(sessionId);
      } catch (e) {
        // ignore
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] WebSocket error:', err);
  });
});

// 解析命令行参数获取端口
let portFromArgs;
for (let i = 0; i < process.argv.length; i++) {
  if ((process.argv[i] === '--port' || process.argv[i] === '-p') && process.argv[i + 1]) {
    portFromArgs = parseInt(process.argv[i + 1]);
    break;
  }
}

// 启动服务器
const PORT = portFromArgs || process.env.PORT || 9802;
server.listen(PORT, () => {
  const pidFilePath = path.join(__dirname, 'fterm.server.pid');
  fs.writeFileSync(pidFilePath, process.pid.toString());
  console.log(`PID ${process.pid} written to ${pidFilePath}`);
  console.log(`fterm Server is running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});

// 进程退出处理
process.on('exit', () => { logStream.end(); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  logStream.end();
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  logStream.end();
  process.exit(1);
});
