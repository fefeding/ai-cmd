"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitorService = void 0;
const ssh2_1 = require("ssh2");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * 实时日志监控服务
 * 支持 tail -f 远程/本地日志文件，AI 实时分析异常
 */
class MonitorService {
    monitors = new Map();
    connectionService;
    eventCallback = null;
    analysisTimer = null;
    /** 分析间隔（毫秒） */
    analysisInterval = 5000;
    /** 单次分析最大行数 */
    maxBatchLines = 30;
    constructor(connectionService) {
        this.connectionService = connectionService;
        // 启动定期分析定时器
        this.startAnalysisTimer();
    }
    /**
     * 注册事件回调（由 server.js 调用，用于推送 WebSocket 事件）
     */
    onEvent(callback) {
        this.eventCallback = callback;
    }
    /**
     * 启动日志监控
     */
    async startMonitor(sessionId, connectionId, logPath, pattern) {
        const isLocal = connectionId === 'local' || connectionId === '';
        const safeLogPath = this.validateLogPath(logPath, isLocal);
        // 检查是否已有监控
        for (const [id, m] of this.monitors) {
            if (m.sessionId === sessionId && m.logPath === safeLogPath && m.running) {
                return { monitorId: id };
            }
        }
        const monitorId = `mon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const monitor = {
            id: monitorId,
            sessionId,
            connectionId,
            logPath: safeLogPath,
            pattern: pattern || '(ERROR|FATAL|CRITICAL|Exception|Traceback|panic|FAIL)',
            lineBuffer: [],
            alertBuffer: [],
            lastAnalyzedAt: Date.now(),
            lineCount: 0,
            running: false,
        };
        try {
            // 判断连接类型
            if (isLocal) {
                await this.startLocalTail(monitor);
            }
            else {
                await this.startSSHTail(monitor);
            }
            monitor.running = true;
            this.monitors.set(monitorId, monitor);
            this.emitEvent(sessionId, {
                type: 'monitor-started',
                monitorId,
            });
            return { monitorId };
        }
        catch (e) {
            this.emitEvent(sessionId, {
                type: 'monitor-error',
                monitorId,
                error: e.message || 'Failed to start monitor',
            });
            throw e;
        }
    }
    /**
     * 停止日志监控
     */
    stopMonitor(monitorId) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor)
            return false;
        monitor.running = false;
        try {
            if (monitor.sshStream) {
                monitor.sshStream.close();
                monitor.sshStream = undefined;
            }
            if (monitor.sshClient) {
                monitor.sshClient.end();
                monitor.sshClient = undefined;
            }
            if (monitor.childProcess) {
                monitor.childProcess.kill();
                monitor.childProcess = undefined;
            }
        }
        catch { /* ignore cleanup errors */ }
        this.emitEvent(monitor.sessionId, {
            type: 'monitor-stopped',
            monitorId,
        });
        this.monitors.delete(monitorId);
        return true;
    }
    /**
     * 停止指定 session 的所有监控
     */
    stopSessionMonitors(sessionId) {
        for (const [id, m] of this.monitors) {
            if (m.sessionId === sessionId) {
                this.stopMonitor(id);
            }
        }
    }
    /**
     * 获取活跃监控列表
     */
    getActiveMonitors(sessionId) {
        const result = [];
        for (const [id, m] of this.monitors) {
            if (sessionId && m.sessionId !== sessionId)
                continue;
            result.push({
                monitorId: id,
                sessionId: m.sessionId,
                connectionId: m.connectionId,
                logPath: m.logPath,
                lineCount: m.lineCount,
                alertCount: m.alertBuffer.length,
                running: m.running,
            });
        }
        return result;
    }
    /**
     * 获取监控的告警列表
     */
    getAlerts(monitorId, limit = 50) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor)
            return [];
        return monitor.alertBuffer.slice(-limit);
    }
    /**
     * 获取监控的最近输出行
     */
    getRecentLines(monitorId, limit = 100) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor)
            return [];
        return monitor.lineBuffer.slice(-limit);
    }
    // ========== 内部方法 ==========
    /**
     * 本地 tail -f
     */
    async startLocalTail(monitor) {
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)('tail', ['-f', '-n', '0', monitor.logPath], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            if (!child.stdout) {
                reject(new Error('Failed to start tail process'));
                return;
            }
            monitor.childProcess = child;
            let stderrBuf = '';
            child.stderr?.on('data', (data) => {
                stderrBuf += data.toString();
                // tail -f 首次可能报 "file not found"，等一下再看
                if (stderrBuf.includes('No such file') || stderrBuf.includes('cannot open')) {
                    reject(new Error(`Log file not found: ${monitor.logPath}`));
                }
            });
            child.stdout.on('data', (data) => {
                this.handleMonitorData(monitor, data.toString());
            });
            child.on('error', (err) => {
                if (monitor.running) {
                    this.emitEvent(monitor.sessionId, {
                        type: 'monitor-error',
                        monitorId: monitor.id,
                        error: err.message,
                    });
                }
            });
            child.on('close', (code) => {
                if (monitor.running) {
                    monitor.running = false;
                    this.emitEvent(monitor.sessionId, {
                        type: 'monitor-stopped',
                        monitorId: monitor.id,
                    });
                    this.monitors.delete(monitor.id);
                }
            });
            // 短暂等待确认进程启动成功
            setTimeout(() => {
                if (child.exitCode === null)
                    resolve();
                else
                    reject(new Error(stderrBuf || 'tail process exited'));
            }, 500);
        });
    }
    /**
     * SSH 远程 tail -f
     */
    async startSSHTail(monitor) {
        const conn = await this.connectionService.getConnectionById(monitor.connectionId);
        if (!conn)
            throw new Error('Connection not found: ' + monitor.connectionId);
        return new Promise((resolve, reject) => {
            const client = new ssh2_1.Client();
            monitor.sshClient = client;
            client.on('ready', () => {
                client.exec(`tail -f -n 0 ${this.escapeShellArg(monitor.logPath)}`, (err, stream) => {
                    if (err) {
                        client.end();
                        reject(err);
                        return;
                    }
                    monitor.sshStream = stream;
                    stream.on('data', (data) => {
                        this.handleMonitorData(monitor, data.toString());
                    });
                    stream.stderr.on('data', (data) => {
                        const msg = data.toString();
                        if (msg.includes('No such file') || msg.includes('cannot open')) {
                            reject(new Error(`Log file not found: ${monitor.logPath}`));
                        }
                    });
                    stream.on('close', () => {
                        if (monitor.running) {
                            monitor.running = false;
                            this.emitEvent(monitor.sessionId, {
                                type: 'monitor-stopped',
                                monitorId: monitor.id,
                            });
                            this.monitors.delete(monitor.id);
                        }
                        client.end();
                    });
                    resolve();
                });
            });
            client.on('error', (err) => {
                reject(new Error('SSH connection failed: ' + err.message));
            });
            // 连接 SSH
            const connectConfig = {
                host: conn.host,
                port: conn.port || 22,
                username: conn.username,
                readyTimeout: 10000,
            };
            if (conn.authType === 'password' && conn.password) {
                connectConfig.password = conn.password;
            }
            else if (conn.authType === 'privateKey' && conn.privateKey) {
                connectConfig.privateKey = conn.privateKey;
                if (conn.passphrase)
                    connectConfig.passphrase = conn.passphrase;
            }
            else {
                // 自动检测密钥
                const keyPaths = [
                    `${process.env.HOME}/.ssh/id_rsa`,
                    `${process.env.HOME}/.ssh/id_ed25519`,
                    `${process.env.HOME}/.ssh/id_ecdsa`,
                ];
                for (const kp of keyPaths) {
                    try {
                        const fs = require('fs');
                        if (fs.existsSync(kp)) {
                            connectConfig.privateKey = fs.readFileSync(kp);
                            break;
                        }
                    }
                    catch { /* skip */ }
                }
            }
            client.connect(connectConfig);
        });
    }
    /**
     * 处理监控数据（新行到达）
     */
    handleMonitorData(monitor, data) {
        if (!monitor.running)
            return;
        const lines = data.split('\n').filter(l => l.trim());
        if (lines.length === 0)
            return;
        // 追加到缓冲区
        monitor.lineBuffer.push(...lines);
        monitor.lineCount += lines.length;
        // 限制缓冲区大小（保留最近 1000 行）
        if (monitor.lineBuffer.length > 1000) {
            monitor.lineBuffer = monitor.lineBuffer.slice(-1000);
        }
        // 检测匹配模式的行
        try {
            const regex = new RegExp(monitor.pattern, 'i');
            for (const line of lines) {
                if (regex.test(line)) {
                    const level = this.detectLevel(line);
                    const alert = {
                        id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                        timestamp: Date.now(),
                        monitorId: monitor.id,
                        level,
                        message: line.substring(0, 500),
                        lines: [line],
                    };
                    monitor.alertBuffer.push(alert);
                    // 限制告警缓冲区
                    if (monitor.alertBuffer.length > 200) {
                        monitor.alertBuffer = monitor.alertBuffer.slice(-200);
                    }
                    this.emitEvent(monitor.sessionId, {
                        type: 'monitor-alert',
                        monitorId: monitor.id,
                        alert,
                    });
                }
            }
        }
        catch { /* regex error, ignore */ }
        // 推送新行事件（限制每次最多 50 行）
        const pushLines = lines.slice(0, 50);
        this.emitEvent(monitor.sessionId, {
            type: 'monitor-line',
            monitorId: monitor.id,
            lines: pushLines,
        });
    }
    /**
     * 检测日志级别
     */
    detectLevel(line) {
        const lower = line.toLowerCase();
        if (lower.includes('fatal') || lower.includes('critical') || lower.includes('panic')) {
            return 'critical';
        }
        if (lower.includes('error') || lower.includes('exception') || lower.includes('traceback') || lower.includes('fail')) {
            return 'error';
        }
        return 'warning';
    }
    /**
     * 定期批量分析（供 AI 调用，暂不自动调用 AI，而是暴露数据给前端）
     */
    startAnalysisTimer() {
        this.analysisTimer = setInterval(() => {
            // 目前仅做清理，AI 分析由前端按需触发
        }, this.analysisInterval);
    }
    /**
     * 获取待分析的批量行（供 AI 分析接口使用）
     */
    getBatchForAnalysis(monitorId) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor)
            return [];
        const lines = monitor.lineBuffer.slice(-this.maxBatchLines);
        monitor.lastAnalyzedAt = Date.now();
        return lines;
    }
    /**
     * 校验日志路径，避免读取敏感文件、特殊设备或通过远程 shell 元字符注入命令。
     */
    validateLogPath(logPath, isLocal) {
        const normalized = String(logPath || '').trim();
        if (!normalized) {
            throw new Error('Log path is required');
        }
        if (normalized.length > 1024 || /[\0\r\n]/.test(normalized)) {
            throw new Error('Invalid log path');
        }
        if (!path.isAbsolute(normalized)) {
            throw new Error('Log path must be absolute');
        }
        if (this.isSensitiveLogPath(normalized)) {
            throw new Error('Access to this log path is not allowed');
        }
        if (!isLocal) {
            if (/[*?\[\]{}<>|;&`$()]/.test(normalized)) {
                throw new Error('Remote log path contains unsafe shell characters');
            }
            return path.posix.normalize(normalized);
        }
        let realPath;
        try {
            realPath = fs.realpathSync(normalized);
            const stat = fs.statSync(realPath);
            if (!stat.isFile()) {
                throw new Error('Log path must point to a regular file');
            }
        }
        catch (error) {
            throw new Error(error?.message || 'Invalid log file');
        }
        if (this.isSensitiveLogPath(realPath)) {
            throw new Error('Access to this log path is not allowed');
        }
        return realPath;
    }
    isSensitiveLogPath(value) {
        const normalized = value.replace(/\\/g, '/').toLowerCase();
        const sensitivePaths = [
            '/dev/',
            '/proc/',
            '/sys/',
            '/run/',
            '/private/etc/',
            '/etc/',
            '/var/run/',
            '/var/db/',
            '/var/root/',
            '/root/',
            '/.ssh/',
            '/.gnupg/',
            '/keychain',
            '/shadow',
            '/passwd',
            '/sudoers',
        ];
        return sensitivePaths.some((entry) => normalized === entry.slice(0, -1) || normalized.includes(entry));
    }
    /**
     * Shell 参数转义
     */
    escapeShellArg(arg) {
        return `'${arg.replace(/'/g, "'\\''")}'`;
    }
    /**
     * 发射事件
     */
    emitEvent(sessionId, event) {
        if (this.eventCallback) {
            this.eventCallback(sessionId, event);
        }
    }
    /**
     * 销毁服务
     */
    destroy() {
        if (this.analysisTimer) {
            clearInterval(this.analysisTimer);
            this.analysisTimer = null;
        }
        for (const [id] of this.monitors) {
            this.stopMonitor(id);
        }
    }
}
exports.MonitorService = MonitorService;
//# sourceMappingURL=monitor.service.js.map