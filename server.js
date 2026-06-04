#!/usr/bin/env node

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

// 统一数据目录管理（所有写入文件必须通过此模块获取路径）
const { ensureDataDir, getDataPath } = require('./dist/server/utils/data-dir');
const dataDir = ensureDataDir();

// 日志文件路径（写入数据目录，非安装目录）
const logFilePath = getDataPath('server.log');
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id, X-File-Name');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  next();
});

// HTTP 文件上传端点（绕过 WebSocket，支持大文件）
app.post('/api/file-upload', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const fileName = req.headers['x-file-name'];
  if (!sessionId || !fileName) {
    res.status(400).json({ success: false, error: 'Missing X-Session-Id or X-File-Name header' });
    return;
  }
  try {
    const serverModule = require('./dist/server/index.js');
    const { sshService } = serverModule;
    // 收集原始请求体（文件二进制数据）
    console.log(`[HTTP-Upload] Receiving file: session=${sessionId}, file=${fileName}`);
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    console.log(`[HTTP-Upload] Received ${fileBuffer.length} bytes, calling SFTP...`);
    // 将原始 buffer 转为 base64 传给 SFTP 方法
    const b64 = fileBuffer.toString('base64');
    const bytes = await sshService.uploadFileViaSftp(sessionId, fileName, b64);
    console.log(`[HTTP-Upload] SFTP done: ${fileName}, ${bytes} bytes`);
    res.json({ success: true, bytes, fileName });
  } catch (err) {
    console.error(`[HTTP-Upload] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message, fileName });
  }
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
// maxPayload 设为 500MB，支持较大文件的 base64 传输（base64 比原文件大 ~33%）
const wss = new WebSocket.Server({ server, path: '/ws/terminal', maxPayload: 500 * 1024 * 1024 });
console.log(`[WS] WebSocket server created on path /ws/terminal (maxPayload: 500MB)`);

// 分块上传缓冲区: uploadId -> { chunks: string[], totalChunks: number, fileName: string, sessionId: string }
const pendingUploads = new Map();

// 跟踪 sessionId -> WebSocket 映射（用于推送监控事件）
const wsBySessionId = new Map();

// 注册日志监控事件回调（全局注册，通过 sessionId 查找对应的 WebSocket）
try {
  const serverModule = require('./dist/server/index.js');
  if (serverModule.monitorService) {
    serverModule.monitorService.onEvent((sid, event) => {
      const targetWs = wsBySessionId.get(sid);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({ type: 'monitor-event', sessionId: sid, event }));
      }
    });
  }
} catch (e) {
  console.error('[WS] Failed to register monitor event callback:', e.message);
}

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
        // 通知输出监听器（用于 Agent 捕获输出）
        if (!hasBinary) {
          try { sshService.notifyOutput(sessionId, buf.toString('utf-8')); } catch(e) {}
        }
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
    // 注册 sessionId -> ws 映射
    wsBySessionId.set(sessionId, ws);
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

        case 'ai-agent-run': {
          // AI Agent run
          const { aiSessionId, message, context, skillId, locale } = data || {};
          if (!aiSessionId || !message) {
            ws.send(JSON.stringify({ type: 'ai-agent-event', event: { type: 'error', error: 'Missing params' } }));
            break;
          }
          const { aiService } = serverModule;
          if (!aiService) {
            ws.send(JSON.stringify({ type: 'ai-agent-event', event: { type: 'error', error: 'AI service unavailable' } }));
            break;
          }
          console.log(`[WS] AI Agent run: session=${aiSessionId}, skill=${skillId || 'none'}, locale=${locale || 'auto'}, message=${message.substring(0, 50)}`);
          aiService.agentRun(aiSessionId, message, context, (event) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ai-agent-event', sessionId: aiSessionId, event }));
            }
          }, skillId, locale).catch((err) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ai-agent-event', sessionId: aiSessionId, event: { type: 'error', error: err.message } }));
            }
          });
          break;
        }

        case 'file-upload': {
          // SFTP 文件上传 - 单消息模式（小文件，<50MB base64）
          const { fileName, data: fileData } = data || {};
          if (!sid || !fileName || !fileData) {
            console.error(`[WS] file-upload missing params: sid=${sid}, fileName=${fileName}, hasData=${!!fileData}`);
            ws.send(JSON.stringify({ type: 'file-upload-result', success: false, error: 'Missing params', fileName }));
            break;
          }
          try {
            console.log(`[WS] SFTP upload START: session=${sid}, file=${fileName}, b64len=${fileData.length}, wsReady=${ws.readyState}`);
            const bytes = await sshService.uploadFileViaSftp(sid, fileName, fileData);
            console.log(`[WS] SFTP upload DONE: ${fileName}, ${bytes} bytes, wsReady=${ws.readyState}`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'file-upload-result', success: true, bytes, fileName }));
            } else {
              console.error(`[WS] Cannot send result, WS not open: state=${ws.readyState}`);
            }
          } catch (err) {
            console.error(`[WS] SFTP upload ERROR: ${err.message}`, err.stack);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'file-upload-result', success: false, error: err.message, fileName }));
            }
          }
          break;
        }

        case 'file-upload-start': {
          // 分块上传 - 开始（大文件）
          const { uploadId, fileName: startFileName, totalChunks } = data || {};
          if (!uploadId || !startFileName || !totalChunks) {
            ws.send(JSON.stringify({ type: 'file-upload-result', success: false, error: 'Missing params', fileName: startFileName }));
            break;
          }
          console.log(`[WS] Chunked upload start: id=${uploadId}, file=${startFileName}, chunks=${totalChunks}`);
          pendingUploads.set(uploadId, { chunks: new Array(totalChunks), totalChunks, fileName: startFileName, sessionId: sid, receivedChunks: 0 });
          break;
        }

        case 'file-upload-chunk': {
          // 分块上传 - 数据块
          const { uploadId: chunkId, chunkIndex, data: chunkData } = data || {};
          const upload = chunkId ? pendingUploads.get(chunkId) : null;
          if (!upload) {
            ws.send(JSON.stringify({ type: 'file-upload-result', success: false, error: 'Upload session not found' }));
            break;
          }
          upload.chunks[chunkIndex] = chunkData;
          upload.receivedChunks++;
          // 每 10 个 chunk 反馈一次进度
          if (upload.receivedChunks % 10 === 0 || upload.receivedChunks === upload.totalChunks) {
            ws.send(JSON.stringify({ type: 'file-upload-progress', uploadId: chunkId, received: upload.receivedChunks, total: upload.totalChunks }));
          }
          break;
        }

        case 'file-upload-end': {
          // 分块上传 - 结束，拼接并 SFTP 写入
          const { uploadId: endId } = data || {};
          const endUpload = endId ? pendingUploads.get(endId) : null;
          if (!endUpload) {
            console.error(`[WS] file-upload-end: upload session not found: ${endId}`);
            ws.send(JSON.stringify({ type: 'file-upload-result', success: false, error: 'Upload session not found' }));
            break;
          }
          try {
            console.log(`[WS] Chunked upload end: id=${endId}, file=${endUpload.fileName}, received=${endUpload.receivedChunks}/${endUpload.totalChunks}`);
            // 检查是否收到所有 chunk
            const missingChunks = endUpload.chunks.reduce((acc, c, i) => c === undefined ? [...acc, i] : acc, []);
            if (missingChunks.length > 0) {
              console.error(`[WS] Missing chunks: ${missingChunks.join(',')}`);
              ws.send(JSON.stringify({ type: 'file-upload-result', success: false, error: `Missing ${missingChunks.length} chunks`, fileName: endUpload.fileName }));
              pendingUploads.delete(endId);
              break;
            }
            const fullB64 = endUpload.chunks.join('');
            console.log(`[WS] Joined ${endUpload.totalChunks} chunks -> b64len=${fullB64.length}, calling SFTP upload...`);
            const bytes = await sshService.uploadFileViaSftp(endUpload.sessionId, endUpload.fileName, fullB64);
            console.log(`[WS] Chunked upload SFTP DONE: ${endUpload.fileName}, ${bytes} bytes, wsReady=${ws.readyState}`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'file-upload-result', success: true, bytes, fileName: endUpload.fileName }));
            }
          } catch (err) {
            console.error(`[WS] Chunked upload ERROR: ${err.message}`, err.stack);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'file-upload-result', success: false, error: err.message, fileName: endUpload.fileName }));
            }
          } finally {
            pendingUploads.delete(endId);
          }
          break;
        }

        case 'ai-agent-stop': {
          // 停止 AI Agent
          const { aiSessionId: stopSid } = data || {};
          if (stopSid) {
            const { aiService } = serverModule;
            if (aiService) {
              aiService.stopAgent(stopSid);
              console.log(`[WS] AI Agent stop requested: ${stopSid}`);
            }
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
    // 移除 sessionId -> ws 映射
    if (sessionId) {
      wsBySessionId.delete(sessionId);
      try {
        const serverModule = require('./dist/server/index.js');
        // 停止该会话的监控
        if (serverModule.monitorService) {
          serverModule.monitorService.stopSessionMonitors(sessionId);
        }
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

// PID 文件路径（统一使用数据目录）
const pidFilePath = getDataPath('aicmd.server.pid');

// 进程退出时清理 PID 文件
function cleanupPid() {
  try { if (fs.existsSync(pidFilePath)) fs.unlinkSync(pidFilePath); } catch {}
}

// 启动服务器
const PORT = portFromArgs || process.env.PORT || 9802;
server.listen(PORT, () => {
  fs.writeFileSync(pidFilePath, process.pid.toString());
  console.log(`PID ${process.pid} written to ${pidFilePath}`);
  console.log(`aicmd Server is running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});

// 进程退出处理
process.on('exit', () => { cleanupPid(); logStream.end(); });
process.on('SIGTERM', () => { cleanupPid(); process.exit(0); });
process.on('SIGINT', () => { cleanupPid(); process.exit(0); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanupPid();
  logStream.end();
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  cleanupPid();
  logStream.end();
  process.exit(1);
});
