import { ConnectionService } from './connection.service';
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
export declare class MonitorService {
    private monitors;
    private connectionService;
    private eventCallback;
    private analysisTimer;
    /** 分析间隔（毫秒） */
    private analysisInterval;
    /** 单次分析最大行数 */
    private maxBatchLines;
    constructor(connectionService: ConnectionService);
    /**
     * 注册事件回调（由 server.js 调用，用于推送 WebSocket 事件）
     */
    onEvent(callback: MonitorEventCallback): void;
    /**
     * 启动日志监控
     */
    startMonitor(sessionId: string, connectionId: string, logPath: string, pattern?: string): Promise<{
        monitorId: string;
    }>;
    /**
     * 停止日志监控
     */
    stopMonitor(monitorId: string): boolean;
    /**
     * 停止指定 session 的所有监控
     */
    stopSessionMonitors(sessionId: string): void;
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
    }>;
    /**
     * 获取监控的告警列表
     */
    getAlerts(monitorId: string, limit?: number): MonitorAlert[];
    /**
     * 获取监控的最近输出行
     */
    getRecentLines(monitorId: string, limit?: number): string[];
    /**
     * 本地 tail -f
     */
    private startLocalTail;
    /**
     * SSH 远程 tail -f
     */
    private startSSHTail;
    /**
     * 处理监控数据（新行到达）
     */
    private handleMonitorData;
    /**
     * 检测日志级别
     */
    private detectLevel;
    /**
     * 定期批量分析（供 AI 调用，暂不自动调用 AI，而是暴露数据给前端）
     */
    private startAnalysisTimer;
    /**
     * 获取待分析的批量行（供 AI 分析接口使用）
     */
    getBatchForAnalysis(monitorId: string): string[];
    /**
     * 校验日志路径，避免读取敏感文件、特殊设备或通过远程 shell 元字符注入命令。
     */
    private validateLogPath;
    private isSensitiveLogPath;
    /**
     * Shell 参数转义
     */
    private escapeShellArg;
    /**
     * 发射事件
     */
    private emitEvent;
    /**
     * 销毁服务
     */
    destroy(): void;
}
//# sourceMappingURL=monitor.service.d.ts.map