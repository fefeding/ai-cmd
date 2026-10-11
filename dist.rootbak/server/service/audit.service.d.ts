/**
 * 审计日志条目
 */
export interface AuditEntry {
    id: string;
    timestamp: number;
    sessionId: string;
    sessionName?: string;
    connectionId?: string;
    userMessage: string;
    tool: string;
    command: string;
    result: string;
    duration: number;
    status: 'success' | 'error' | 'blocked' | 'rewritten';
    rewrittenFrom?: string;
}
/**
 * 审计日志查询参数
 */
export interface AuditQuery {
    date?: string;
    sessionId?: string;
    keyword?: string;
    status?: string;
    limit?: number;
    offset?: number;
}
/**
 * 审计统计
 */
export interface AuditStats {
    total: number;
    success: number;
    error: number;
    blocked: number;
    rewritten: number;
    today: number;
}
/**
 * 命令审计服务
 * 记录所有 AI Agent 执行的命令及结果，按日存储为 JSONL 文件
 */
export declare class AuditService {
    private auditDir;
    private retentionDays;
    constructor();
    /**
     * 记录审计日志
     */
    log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry;
    /**
     * 查询审计日志
     */
    getLogs(query?: AuditQuery): {
        entries: AuditEntry[];
        total: number;
    };
    /**
     * 获取多日审计日志（用于导出）
     */
    getLogsRange(startDate: string, endDate: string): AuditEntry[];
    /**
     * 导出审计日志
     */
    exportLogs(startDate: string, endDate: string, format?: 'json' | 'csv'): string;
    /**
     * 获取统计信息
     */
    getStats(date?: string): AuditStats;
    /**
     * 获取可用日期列表
     */
    getAvailableDates(): string[];
    /**
     * 清理过期日志
     */
    private cleanupOldLogs;
    private getDateFilePath;
    private formatDate;
}
//# sourceMappingURL=audit.service.d.ts.map