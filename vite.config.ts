import { fileURLToPath, URL } from 'node:url';
import * as http from "node:http";
import * as url from "node:url";
import { defineConfig, type Connect, type PluginOption } from 'vite';

import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import CopyPlugin from 'vite-plugin-files-copy';
import ViteNunjucksPlugin from '@fefeding/vite-nunjucks-plugin';
import * as path from 'path';
import * as fs from 'fs';

// 直接导入服务端代码（开发模式不再依赖编译产物）
import { ConnectionService } from './server/service/connection.service';
import { SSHService } from './server/service/ssh.service';
import { AIService } from './server/service/ai.service';
import { SkillService } from './server/service/skill.service';

const urlPrefix = process.env.PREFIX ? `/${process.env.PREFIX}` : '';

// 创建共享服务实例（开发模式）
const connectionService = new ConnectionService();
connectionService.init();
const sshService = new SSHService(connectionService);
const skillService = new SkillService();
const aiService = new AIService(sshService, skillService);

const defaultInitState = {
    "config": {"prefix": urlPrefix, "apiUrl": process.env.API_URL||""},
    "title": process.env.TITLE || 'fterm远程终端'
};

const nunjucksPlugin = ViteNunjucksPlugin({
    variables: {
        prefix: '',
        viteTarget: '',
        __DEFAULTINITIAL_STATE__: JSON.stringify(defaultInitState),
    }
});

const viewDir = path.resolve(__dirname, './view');

const config = defineConfig({
    publicDir: false,
    plugins: [
        vue() as PluginOption,
        vueJsx() as PluginOption,
        // @ts-ignore
        CopyPlugin({ patterns: [] }),
        nunjucksPlugin,
        {
            name: 'copy-server-files',
            writeBundle: async () => {
                const serverSrcDir = path.resolve(__dirname, './server');
                const serverDistDir = path.resolve(__dirname, './dist/server');
                if (!fs.existsSync(serverDistDir)) {
                    fs.mkdirSync(serverDistDir, { recursive: true });
                }
                const copyRecursiveSync = (src: string, dest: string) => {
                    const exists = fs.existsSync(src);
                    const stats = exists ? fs.statSync(src) : null;
                    const isDirectory = exists && stats && stats.isDirectory();
                    if (isDirectory) {
                        if (!fs.existsSync(dest)) fs.mkdirSync(dest);
                        fs.readdirSync(src).forEach(childItemName => {
                            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
                        });
                    } else {
                        if (src.endsWith('.ts') || src.endsWith('.js')) fs.copyFileSync(src, dest);
                    }
                };
                copyRecursiveSync(serverSrcDir, serverDistDir);
                console.log('Server files copied to', serverDistDir);
            }
        },
        {
            name: 'fix-html-paths',
            writeBundle: async () => {
                const publicDir = path.resolve(__dirname, './dist/public');
                const htmlPath = path.join(publicDir, 'view/index.html');
                if (fs.existsSync(htmlPath)) {
                    let html = fs.readFileSync(htmlPath, 'utf-8');
                    html = html.replace(/\.\.\/([a-zA-Z0-9_-]+\.(js|css|woff|woff2|png|jpg|jpeg|gif|svg|ico))/g, '/public/$1');
                    fs.writeFileSync(htmlPath, html);
                }
                const viewHtmlPath = path.join(publicDir, 'view/index.html');
                const destViewDir = path.resolve(__dirname, './dist/view');
                const destViewHtmlPath = path.join(destViewDir, 'index.html');
                if (fs.existsSync(viewHtmlPath)) {
                    if (!fs.existsSync(destViewDir)) fs.mkdirSync(destViewDir, { recursive: true });
                    let html = fs.readFileSync(viewHtmlPath, 'utf-8');
                    fs.writeFileSync(destViewHtmlPath, html);
                    fs.unlinkSync(viewHtmlPath);
                }
            }
        },
        {
            name: 'vite-plugin-spa-fallback-with-nunjucks',
            configureServer(server) {
                return () => {
                    server.middlewares.use(async (req: http.IncomingMessage, res: http.ServerResponse, next: Connect.NextFunction) => {
                        const requestUrl = req.url || '';
                        if (requestUrl.startsWith('/api/') || requestUrl.startsWith('/ws/')) return next();
                        if (requestUrl.startsWith('/@vite/') || requestUrl.startsWith('/__vite_')) return next();
                        if (req.headers.upgrade === 'websocket') return next();
                        if (requestUrl !== '/index.html' && (/\.[a-zA-Z0-9]{1,4}(\?.*)?$/.test(requestUrl) || requestUrl.includes('@vite/client'))) return next();
                        const accept = req.headers.accept || '';
                        if (!accept.includes('text/html')) return next();
                        try {
                            const indexPath = path.resolve(viewDir, 'index.html');
                            if (!fs.existsSync(indexPath)) return next();
                            let html = fs.readFileSync(indexPath, 'utf-8');
                            html = await nunjucksPlugin.transformIndexHtml(html, { path: indexPath });
                            res.statusCode = 200;
                            res.setHeader('Content-Type', 'text/html');
                            res.end(html);
                        } catch (e: any) {
                            return next(e);
                        }
                    });
                };
            },
        },
        {
            name: 'server-api',
            configureServer(server) {
                server.middlewares.use((req: Connect.IncomingMessage, res: http.ServerResponse, next: Connect.NextFunction) => {
                    if (req.url?.startsWith('/api/')) {
                        if (!serverRoute(req, res, next)) {
                            res.statusCode = 404;
                            res.end('Not Found');
                        }
                    } else {
                        next();
                    }
                });
            },
        },
        {
            name: 'server-ws',
            async configureServer(server) {
                try {
                    console.log('[WS] SSH service initialized from source');

                    const WebSocket = require('ws');
                    // 使用 noServer: true 避免和 Vite 的 HMR WebSocket 冲突
                    const wss = new WebSocket.Server({ noServer: true });
                    console.log('[WS] WebSocket server (noServer) ready for /ws/terminal');

                    // 手动处理 upgrade，只拦截 /ws/terminal 路径
                    server.httpServer.on('upgrade', (req, socket, head) => {
                        if (req.url === '/ws/terminal') {
                            wss.handleUpgrade(req, socket, head, (ws) => {
                                wss.emit('connection', ws, req);
                            });
                        }
                        // 其他 WebSocket 请求（如 Vite HMR）不处理，自动放行
                    });

                    wss.on('connection', async (ws: any) => {
                        console.log('[WS] Client connected to Vite dev WebSocket');
                        let sessionId: string | null = null;

                        ws.on('message', async (raw: Buffer) => {
                            let msg: any;
                            try {
                                msg = JSON.parse(raw.toString());
                            } catch (e) {
                                ws.send(JSON.stringify({ type: 'error', data: 'Invalid message format' }));
                                return;
                            }

                            const { type, sessionId: sid, data } = msg;
                            switch (type) {
                                case 'create': {
                                    const { connectionId, cols, rows, name } = data || {};
                                    if (!connectionId) {
                                        ws.send(JSON.stringify({ type: 'error', data: 'Missing connectionId' }));
                                        return;
                                    }
                                    sessionId = sid || `ssh-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
                                    try {
                                        const sshSession = await sshService.createSession(sessionId, connectionId, cols || 80, rows || 24, name);

                                        // 根据会话类型设置数据接收
                                        const sendOutput = (chunk: any) => {
                                            if (ws.readyState === WebSocket.OPEN) {
                                                const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(typeof chunk === 'string' ? chunk : chunk);
                                                const hasBinary = buf.some((b: number) => b > 127);
                                                // 通知输出监听器（用于 Agent 捕获输出）
                                                if (!hasBinary) {
                                                    try { sshService.notifyOutput(sessionId!, buf.toString('utf-8')); } catch(e) {}
                                                }
                                                const zmSig = Buffer.from([42, 42, 24, 66]);
                                                if (buf.length >= 4 && buf.includes(zmSig)) {
                                                    console.log('[WS-DEBUG] ZMODEM sig in SSH output! buf.length:', buf.length,
                                                        'hasBinary:', hasBinary,
                                                        'first 30 bytes:', Array.from(buf.slice(0, 30)).join(','));
                                                }
                                                if (hasBinary) {
                                                    ws.send(JSON.stringify({ type: 'terminal', sessionId, data: buf.toString('base64'), binary: true }));
                                                } else {
                                                    ws.send(JSON.stringify({ type: 'terminal', sessionId, data: buf.toString('utf-8') }));
                                                }
                                            }
                                        };
                                        const sendClose = (source: string) => () => {
                                            if (ws.readyState === WebSocket.OPEN) {
                                                ws.send(JSON.stringify({ type: 'close', sessionId }));
                                            }
                                        };

                                        if (sshSession.pty) {
                                            // node-pty 模式
                                            sshSession.pty.onData(sendOutput);
                                            sshSession.pty.onExit(sendClose('Local PTY'));
                                        } else if (sshSession.childProcess) {
                                            // child_process 降级模式
                                            sshSession.childProcess.stdout?.on('data', sendOutput);
                                            sshSession.childProcess.stderr?.on('data', sendOutput);
                                            sshSession.childProcess.on('exit', sendClose('Local shell'));
                                        } else if (sshSession.stream) {
                                            // SSH 模式
                                            sshSession.stream.on('data', sendOutput);
                                            sshSession.stream.on('close', sendClose('SSH stream'));
                                        }

                                        ws.send(JSON.stringify({ type: 'status', sessionId, data: 'connected' }));
                                    } catch (err: any) {
                                        ws.send(JSON.stringify({ type: 'error', sessionId, data: err.message || '连接失败' }));
                                    }
                                    break;
                                }
                                case 'terminal': {
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
                                    if (sid) sshService.resize(sid, data.cols, data.rows);
                                    break;
                                }
                                case 'close': {
                                    if (sid) sshService.closeSession(sid);
                                    break;
                                }
                                case 'ai-agent-run': {
                                    const { aiSessionId, message, context, skillId } = data || {};
                                    if (!aiSessionId || !message) {
                                        ws.send(JSON.stringify({ type: 'ai-agent-event', event: { type: 'error', error: '缺少参数' } }));
                                        break;
                                    }
                                    aiService.agentRun(aiSessionId, message, context, (event: any) => {
                                        if (ws.readyState === WebSocket.OPEN) {
                                            ws.send(JSON.stringify({ type: 'ai-agent-event', sessionId: aiSessionId, event }));
                                        }
                                    }, skillId).catch((err: any) => {
                                        if (ws.readyState === WebSocket.OPEN) {
                                            ws.send(JSON.stringify({ type: 'ai-agent-event', sessionId: aiSessionId, event: { type: 'error', error: err.message } }));
                                        }
                                    });
                                    break;
                                }
                                case 'ai-agent-stop': {
                                    const { aiSessionId: stopSid } = data || {};
                                    if (stopSid) aiService.stopAgent(stopSid);
                                    break;
                                }
                            }
                        });

                        ws.on('close', () => {
                            if (sessionId) sshService.closeSession(sessionId);
                        });
                    });
                } catch (e) {
                    console.error('[WS] Failed to start WebSocket server:', e);
                }
            },
        },
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '#': fileURLToPath(new URL('../', import.meta.url)),
        },
    },
    build: {
        outDir: 'dist/public',
        assetsInlineLimit: 4096,
        manifest: true,
        minify: false,
        modulePreload: true,
        rollupOptions: {
            external: ['../../server/index', './server/index'],
            input: getViewInputs(viewDir),
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name].[ext]',
                manualChunks(id) {
                    const ms = [...id.matchAll(/\/node_modules\/([^\/]+)\//ig)];
                    if (ms && ms.length) {
                        const m = ms[ms.length - 1];
                        if (m && m[1]) {
                            if (m[1].includes('@vue') || m[1].includes('vue-') || m[1] == 'vue') return 'vue';
                            if (m[1].includes('bootstrap')) return 'bootstrap';
                            if (m[1].includes('xterm')) return 'xterm';
                        }
                    }
                }
            }
        },
    },
    base: urlPrefix,
    server: {
        host: '0.0.0.0',
        port: +`${process.env.VITE_PORT}` || 9801,
        cors: true,
    },
});
export default config;

function getViewInputs(dir: string): { [key: string]: string } {
    const entries = fs.readdirSync(dir);
    const htmlFiles = entries.filter(filename => filename.endsWith('.html'));
    const inputObj: { [key: string]: string } = {};
    for (const file of htmlFiles) {
        const name = path.basename(file, '.html');
        inputObj[name] = path.resolve(dir, file);
    }
    return inputObj;
}

async function serverRoute(req: Connect.IncomingMessage, res: http.ServerResponse, next: Connect.NextFunction) {
    try {
        if (!req.url?.startsWith('/api/')) return next();
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname || '';
        const method = req.method?.toLowerCase();
        if (method !== 'post') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ret: 405, msg: 'Only POST method is allowed' }));
            return true;
        }
        const body = await getRequestBody(req);
        if (pathname.startsWith('/api/connection/') || pathname.startsWith('/api/terminal/') || pathname.startsWith('/api/ai/')) {
            try {
                const data = await handleRoute(pathname, body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ret: 0, msg: 'success', data }));
            } catch (error: any) {
                console.error(error);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ret: 500, msg: error?.message || '系统异常' }));
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ret: 404, msg: 'API not found' }));
        }
    } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ret: 500, msg: error.message || 'Internal server error' }));
    }
    return true;

    async function getRequestBody(req: http.IncomingMessage): Promise<any> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
            req.on('error', reject);
        });
    }
}

/**
 * 开发模式下的 API 路由处理（直接使用共享服务实例）
 */
async function handleRoute(pathname: string, body: any) {
    // ========== 连接管理 ==========
    if (pathname === '/api/connection/getConnections') {
        return await connectionService.getAllConnections();
    }
    if (pathname === '/api/connection/getConnection') {
        const { id } = body;
        if (!id) throw new Error('Missing parameter: id');
        return await connectionService.getConnectionById(id);
    }
    if (pathname === '/api/connection/addConnection') {
        return await connectionService.addConnection(body);
    }
    if (pathname === '/api/connection/updateConnection') {
        const { id, ...updates } = body;
        if (!id) throw new Error('Missing parameter: id');
        return await connectionService.updateConnection(id, updates);
    }
    if (pathname === '/api/connection/deleteConnection') {
        const { id } = body;
        if (!id) throw new Error('Missing parameter: id');
        await connectionService.deleteConnection(id);
        return true;
    }
    if (pathname === '/api/connection/testConnection') {
        return await connectionService.testConnection(body);
    }

    // ========== 终端管理 ==========
    if (pathname === '/api/terminal/getSessions') {
        return sshService.getSessions();
    }
    if (pathname === '/api/terminal/renameSession') {
        const { sessionId, name } = body;
        if (!sessionId) throw new Error('Missing parameter: sessionId');
        sshService.renameSession(sessionId, name);
        return true;
    }
    if (pathname === '/api/terminal/deleteSession') {
        const { sessionId } = body;
        if (!sessionId) throw new Error('Missing parameter: sessionId');
        sshService.deleteSession(sessionId);
        return true;
    }
    if (pathname === '/api/terminal/closeSession') {
        const { sessionId } = body;
        if (!sessionId) throw new Error('Missing parameter: sessionId');
        sshService.closeSession(sessionId);
        return true;
    }
    if (pathname === '/api/terminal/closeAllSessions') {
        sshService.closeAllSessions();
        return true;
    }

    // ========== AI 配置 ==========

    // 获取 AI 配置
    if (pathname === '/api/ai/getConfig') {
        return aiService.getConfig();
    }
    // 更新 AI 配置
    if (pathname === '/api/ai/updateConfig') {
        return aiService.updateConfig(body);
    }
    // 测试 AI 配置
    if (pathname === '/api/ai/testConfig') {
        return await aiService.testConfig(body);
    }
    // AI 对话（非流式）
    if (pathname === '/api/ai/chat') {
        const { sessionId, message, context } = body;
        if (!sessionId) throw new Error('Missing parameter: sessionId');
        if (!message) throw new Error('Missing parameter: message');
        return await aiService.chat(sessionId, message, context);
    }
    // 清空 AI 对话历史
    if (pathname === '/api/ai/clearHistory') {
        const { sessionId } = body;
        if (!sessionId) throw new Error('Missing parameter: sessionId');
        aiService.clearHistory(sessionId);
        return true;
    }
    // 获取 AI 对话显示历史
    if (pathname === '/api/ai/getDisplayHistory') {
        const { sessionId } = body;
        if (!sessionId) throw new Error('Missing parameter: sessionId');
        return aiService.loadDisplayHistory(sessionId);
    }
    // 保存 AI 对话显示历史
    if (pathname === '/api/ai/saveDisplayHistory') {
        const { sessionId, messages, sessionName } = body;
        if (!sessionId) throw new Error('Missing parameter: sessionId');
        if (!messages) throw new Error('Missing parameter: messages');
        aiService.saveDisplayHistory(sessionId, messages, sessionName);
        return true;
    }
    // 列出所有历史对话
    if (pathname === '/api/ai/listHistories') {
        return aiService.listDisplayHistories();
    }
    // 加载指定历史对话
    if (pathname === '/api/ai/loadHistory') {
        const { sessionId } = body;
        if (!sessionId) throw new Error('Missing parameter: sessionId');
        return aiService.loadDisplayHistory(sessionId);
    }
    // 删除指定历史对话
    if (pathname === '/api/ai/deleteHistory') {
        const { sessionId } = body;
        if (!sessionId) throw new Error('Missing parameter: sessionId');
        aiService.deleteDisplayHistoryFile(sessionId);
        return true;
    }
    // 获取 Skills 列表
    if (pathname === '/api/ai/getSkills') {
        return skillService.getSkills();
    }
    // 获取指定 Skill
    if (pathname === '/api/ai/getSkill') {
        const { id } = body;
        if (!id) throw new Error('Missing parameter: id');
        const skill = skillService.getSkill(id);
        if (!skill) throw new Error('Skill not found: ' + id);
        return skill;
    }

    throw new Error('API endpoint not found');
}
