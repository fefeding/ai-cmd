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
exports.AuditService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const data_dir_1 = require("../utils/data-dir");
/**
 * 命令审计服务
 * 记录所有 AI Agent 执行的命令及结果，按日存储为 JSONL 文件
 */
class AuditService {
    auditDir;
    retentionDays = 30;
    constructor() {
        this.auditDir = (0, data_dir_1.getDataPath)('audit');
        try {
            if (!fs.existsSync(this.auditDir)) {
                fs.mkdirSync(this.auditDir, { recursive: true });
            }
        }
        catch { /* ignore */ }
        this.cleanupOldLogs();
    }
    /**
     * 记录审计日志
     */
    log(entry) {
        const fullEntry = {
            ...entry,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
        };
        try {
            const filePath = this.getDateFilePath(this.formatDate(new Date()));
            const line = JSON.stringify(fullEntry) + '\n';
            fs.appendFileSync(filePath, line, 'utf-8');
        }
        catch (e) {
            console.error('[AuditService] Failed to write log:', e.message);
        }
        return fullEntry;
    }
    /**
     * 查询审计日志
     */
    getLogs(query = {}) {
        const date = query.date || this.formatDate(new Date());
        const filePath = this.getDateFilePath(date);
        if (!fs.existsSync(filePath)) {
            return { entries: [], total: 0 };
        }
        let entries = [];
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            entries = lines.map(line => {
                try {
                    return JSON.parse(line);
                }
                catch {
                    return null;
                }
            }).filter(Boolean);
        }
        catch {
            return { entries: [], total: 0 };
        }
        // 过滤
        if (query.sessionId) {
            entries = entries.filter(e => e.sessionId === query.sessionId);
        }
        if (query.status) {
            entries = entries.filter(e => e.status === query.status);
        }
        if (query.keyword) {
            const kw = query.keyword.toLowerCase();
            entries = entries.filter(e => e.command.toLowerCase().includes(kw) ||
                e.result.toLowerCase().includes(kw) ||
                e.userMessage.toLowerCase().includes(kw));
        }
        // 按时间倒序
        entries.sort((a, b) => b.timestamp - a.timestamp);
        const total = entries.length;
        const offset = query.offset || 0;
        const limit = query.limit || 100;
        entries = entries.slice(offset, offset + limit);
        return { entries, total };
    }
    /**
     * 获取多日审计日志（用于导出）
     */
    getLogsRange(startDate, endDate) {
        const allEntries = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = this.formatDate(d);
            const filePath = this.getDateFilePath(dateStr);
            if (!fs.existsSync(filePath))
                continue;
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.trim().split('\n').filter(Boolean);
                for (const line of lines) {
                    try {
                        allEntries.push(JSON.parse(line));
                    }
                    catch { /* skip */ }
                }
            }
            catch { /* skip */ }
        }
        allEntries.sort((a, b) => b.timestamp - a.timestamp);
        return allEntries;
    }
    /**
     * 导出审计日志
     */
    exportLogs(startDate, endDate, format = 'json') {
        const entries = this.getLogsRange(startDate, endDate);
        if (format === 'csv') {
            const header = 'id,timestamp,datetime,sessionId,sessionName,connectionId,userMessage,tool,command,status,duration,rewrittenFrom';
            const rows = entries.map(e => {
                const dt = new Date(e.timestamp).toISOString();
                const escape = (s) => `"${(s || '').replace(/"/g, '""')}"`;
                return [
                    e.id, e.timestamp, dt,
                    escape(e.sessionId), escape(e.sessionName || ''),
                    escape(e.connectionId || ''), escape(e.userMessage),
                    escape(e.tool), escape(e.command),
                    e.status, e.duration, escape(e.rewrittenFrom || '')
                ].join(',');
            });
            return header + '\n' + rows.join('\n');
        }
        return JSON.stringify(entries, null, 2);
    }
    /**
     * 获取统计信息
     */
    getStats(date) {
        const targetDate = date || this.formatDate(new Date());
        const { entries } = this.getLogs({ date: targetDate, limit: 99999 });
        const stats = {
            total: entries.length,
            success: 0,
            error: 0,
            blocked: 0,
            rewritten: 0,
            today: 0,
        };
        const todayStr = this.formatDate(new Date());
        for (const e of entries) {
            if (e.status === 'success')
                stats.success++;
            else if (e.status === 'error')
                stats.error++;
            else if (e.status === 'blocked')
                stats.blocked++;
            else if (e.status === 'rewritten')
                stats.rewritten++;
            if (targetDate === todayStr)
                stats.today = stats.total;
            else {
                // 额外查今天的
                const todayEntries = this.getLogs({ date: todayStr, limit: 1 });
                stats.today = todayEntries.total;
            }
        }
        return stats;
    }
    /**
     * 获取可用日期列表
     */
    getAvailableDates() {
        try {
            if (!fs.existsSync(this.auditDir))
                return [];
            return fs.readdirSync(this.auditDir)
                .filter(f => f.endsWith('.jsonl'))
                .map(f => f.replace('.jsonl', ''))
                .sort()
                .reverse();
        }
        catch {
            return [];
        }
    }
    /**
     * 清理过期日志
     */
    cleanupOldLogs() {
        try {
            if (!fs.existsSync(this.auditDir))
                return;
            const files = fs.readdirSync(this.auditDir).filter(f => f.endsWith('.jsonl'));
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - this.retentionDays);
            const cutoffStr = this.formatDate(cutoff);
            for (const file of files) {
                const dateStr = file.replace('.jsonl', '');
                if (dateStr < cutoffStr) {
                    fs.unlinkSync(path.join(this.auditDir, file));
                }
            }
        }
        catch { /* ignore */ }
    }
    getDateFilePath(date) {
        return path.join(this.auditDir, `${date}.jsonl`);
    }
    formatDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}
exports.AuditService = AuditService;
//# sourceMappingURL=audit.service.js.map