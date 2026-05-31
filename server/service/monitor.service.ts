import { Client, type ClientChannel } from 'ssh2';
import { spawn, type ChildProcess } from 'child_process';
import { ConnectionService } from './connection.service';
import { ConnectionEntity } from '../model/connection.entity';

/**
 * 监控会话
 */
interface MonitorSession {
  id: string;
  sessionId: string;
  connectionId: string;
  logPath: string;
  pattern: string;
  // SSH 模式
  sshClient?: Client;
  sshStream?: ClientChannel;
  // 本地模式
  childProcess?: ChildProcess;
  // 缓冲与分析
  lineBuffer: string[];
  alertBuffer: MonitorAlert[];
  lastAnalyzedAt: number;
  lineCount: number;
  running: boolean;
}

/**
 * 监控告警
 */
export interface MonitorAlert {
  id: string;
  timestamp: number;
  monitorId: string;
  level: 'error' | 'warning' | 'critical';
  message: string;
  lines: string[];
  aiAnalysis?: string;
}

/**
 * 监控事件回调
 */
export type MonitorEventCallback = (sessionId: string, event: {
  type: 'monitor-line' | 'monitor-alert' | 'monitor-error' | 'monitor-started' | 'monitor-stopped';
  monitorId?: string;
  lines?: string[];
  alert?: MonitorAlert;
  error?: string;
}) => void;

/**
 * 实时日志监控服务
 * 支持 tail -f 远程/本地日志文件，AI 实时分析异常
 */
export class MonitorService {
  private monitors: Map<string, MonitorSession> = new Map();
  private connectionService: ConnectionService;
  private eventCallback: MonitorEventCallback | null = null;
  private analysisTimer: NodeJS.Timeout | null = null;
  /** 分析间隔（毫秒） */
  private analysisInterval = 5000;
  /** 单次分析最大行数 */
  private maxBatchLines = 30;

  constructor(connectionService: ConnectionService) {
    this.connectionService = connectionService;
    // 启动定期分析定时器
    this.startAnalysisTimer();
  }

  /**
   * 注册事件回调（由 server.js 调用，用于推送 WebSocket 事件）
   */
  onEvent(callback: MonitorEventCallback) {
    this.eventCallback = callback;
  }

  /**
   * 启动日志监控
   */
  async startMonitor(sessionId: string, connectionId: string, logPath: string, pattern?: string): Promise<{ monitorId: string }> {
    // 检查是否已有监控
    for (const [id, m] of this.monitors) {
      if (m.sessionId === sessionId && m.logPath === logPath && m.running) {
        return { monitorId: id };
      }
    }

    const monitorId = `mon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const monitor: MonitorSession = {
      id: monitorId,
      sessionId,
      connectionId,
      logPath,
      pattern: pattern || '(ERROR|FATAL|CRITICAL|Exception|Traceback|panic|FAIL)',
      lineBuffer: [],
      alertBuffer: [],
      lastAnalyzedAt: Date.now(),
      lineCount: 0,
      running: false,
    };

    try {
      // 判断连接类型
      const isLocal = connectionId === 'local' || connectionId === '';
      if (isLocal) {
        await this.startLocalTail(monitor);
      } else {
        await this.startSSHTail(monitor);
      }
      monitor.running = true;
      this.monitors.set(monitorId, monitor);

      this.emitEvent(sessionId, {
        type: 'monitor-started',
        monitorId,
      });

      return { monitorId };
    } catch (e: any) {
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
  stopMonitor(monitorId: string): boolean {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) return false;

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
    } catch { /* ignore cleanup errors */ }

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
  stopSessionMonitors(sessionId: string) {
    for (const [id, m] of this.monitors) {
      if (m.sessionId === sessionId) {
        this.stopMonitor(id);
      }
    }
  }

  /**
   * 获取活跃监控列表
   */
  getActiveMonitors(sessionId?: string): Array<{
    monitorId: string;
    sessionId: string;
    connectionId: string;
    logPath: string;
    lineCount: number;
    alertCount: number;
    running: boolean;
  }> {
    const result: any[] = [];
    for (const [id, m] of this.monitors) {
      if (sessionId && m.sessionId !== sessionId) continue;
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
  getAlerts(monitorId: string, limit = 50): MonitorAlert[] {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) return [];
    return monitor.alertBuffer.slice(-limit);
  }

  /**
   * 获取监控的最近输出行
   */
  getRecentLines(monitorId: string, limit = 100): string[] {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) return [];
    return monitor.lineBuffer.slice(-limit);
  }

  // ========== 内部方法 ==========

  /**
   * 本地 tail -f
   */
  private async startLocalTail(monitor: MonitorSession): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('tail', ['-f', '-n', '0', monitor.logPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      if (!child.stdout) {
        reject(new Error('Failed to start tail process'));
        return;
      }

      monitor.childProcess = child;

      let stderrBuf = '';
      child.stderr?.on('data', (data: Buffer) => {
        stderrBuf += data.toString();
        // tail -f 首次可能报 "file not found"，等一下再看
        if (stderrBuf.includes('No such file') || stderrBuf.includes('cannot open')) {
          reject(new Error(`Log file not found: ${monitor.logPath}`));
        }
      });

      child.stdout.on('data', (data: Buffer) => {
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
        if (child.exitCode === null) resolve();
        else reject(new Error(stderrBuf || 'tail process exited'));
      }, 500);
    });
  }

  /**
   * SSH 远程 tail -f
   */
  private async startSSHTail(monitor: MonitorSession): Promise<void> {
    const conn = await this.connectionService.getConnectionById(monitor.connectionId);
    if (!conn) throw new Error('Connection not found: ' + monitor.connectionId);

    return new Promise((resolve, reject) => {
      const client = new Client();
      monitor.sshClient = client;

      client.on('ready', () => {
        client.exec(`tail -f -n 0 ${this.escapeShellArg(monitor.logPath)}`, (err, stream) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          monitor.sshStream = stream as ClientChannel;

          (stream as ClientChannel).on('data', (data: Buffer) => {
            this.handleMonitorData(monitor, data.toString());
          });

          (stream as ClientChannel).stderr.on('data', (data: Buffer) => {
            const msg = data.toString();
            if (msg.includes('No such file') || msg.includes('cannot open')) {
              reject(new Error(`Log file not found: ${monitor.logPath}`));
            }
          });

          (stream as ClientChannel).on('close', () => {
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
      const connectConfig: any = {
        host: conn.host,
        port: conn.port || 22,
        username: conn.username,
        readyTimeout: 10000,
      };

      if (conn.authType === 'password' && conn.password) {
        connectConfig.password = conn.password;
      } else if (conn.authType === 'privateKey' && conn.privateKey) {
        connectConfig.privateKey = conn.privateKey;
        if (conn.passphrase) connectConfig.passphrase = conn.passphrase;
      } else {
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
          } catch { /* skip */ }
        }
      }

      client.connect(connectConfig);
    });
  }

  /**
   * 处理监控数据（新行到达）
   */
  private handleMonitorData(monitor: MonitorSession, data: string) {
    if (!monitor.running) return;

    const lines = data.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;

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
          const alert: MonitorAlert = {
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
    } catch { /* regex error, ignore */ }

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
  private detectLevel(line: string): 'error' | 'warning' | 'critical' {
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
  private startAnalysisTimer() {
    this.analysisTimer = setInterval(() => {
      // 目前仅做清理，AI 分析由前端按需触发
    }, this.analysisInterval);
  }

  /**
   * 获取待分析的批量行（供 AI 分析接口使用）
   */
  getBatchForAnalysis(monitorId: string): string[] {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) return [];

    const lines = monitor.lineBuffer.slice(-this.maxBatchLines);
    monitor.lastAnalyzedAt = Date.now();
    return lines;
  }

  /**
   * Shell 参数转义
   */
  private escapeShellArg(arg: string): string {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  /**
   * 发射事件
   */
  private emitEvent(sessionId: string, event: any) {
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
