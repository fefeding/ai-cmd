import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getDataPath, ensureDataDir } from '../utils/data-dir';

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
  date?: string;       // YYYY-MM-DD
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
export class AuditService {
  private auditDir: string;
  private retentionDays: number = 30;

  constructor() {
    this.auditDir = getDataPath('audit');
    try {
      if (!fs.existsSync(this.auditDir)) {
        fs.mkdirSync(this.auditDir, { recursive: true });
      }
    } catch { /* ignore */ }
    this.cleanupOldLogs();
  }

  /**
   * 记录审计日志
   */
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const fullEntry: AuditEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    try {
      const filePath = this.getDateFilePath(this.formatDate(new Date()));
      const line = JSON.stringify(fullEntry) + '\n';
      fs.appendFileSync(filePath, line, 'utf-8');
    } catch (e: any) {
      console.error('[AuditService] Failed to write log:', e.message);
    }

    return fullEntry;
  }

  /**
   * 查询审计日志
   */
  getLogs(query: AuditQuery = {}): { entries: AuditEntry[]; total: number } {
    const date = query.date || this.formatDate(new Date());
    const filePath = this.getDateFilePath(date);

    if (!fs.existsSync(filePath)) {
      return { entries: [], total: 0 };
    }

    let entries: AuditEntry[] = [];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      entries = lines.map(line => {
        try { return JSON.parse(line) as AuditEntry; }
        catch { return null; }
      }).filter(Boolean) as AuditEntry[];
    } catch {
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
      entries = entries.filter(e =>
        e.command.toLowerCase().includes(kw) ||
        e.result.toLowerCase().includes(kw) ||
        e.userMessage.toLowerCase().includes(kw)
      );
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
  getLogsRange(startDate: string, endDate: string): AuditEntry[] {
    const allEntries: AuditEntry[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = this.formatDate(d);
      const filePath = this.getDateFilePath(dateStr);
      if (!fs.existsSync(filePath)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try { allEntries.push(JSON.parse(line)); } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    allEntries.sort((a, b) => b.timestamp - a.timestamp);
    return allEntries;
  }

  /**
   * 导出审计日志
   */
  exportLogs(startDate: string, endDate: string, format: 'json' | 'csv' = 'json'): string {
    const entries = this.getLogsRange(startDate, endDate);

    if (format === 'csv') {
      const header = 'id,timestamp,datetime,sessionId,sessionName,connectionId,userMessage,tool,command,status,duration,rewrittenFrom';
      const rows = entries.map(e => {
        const dt = new Date(e.timestamp).toISOString();
        const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
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
  getStats(date?: string): AuditStats {
    const targetDate = date || this.formatDate(new Date());
    const { entries } = this.getLogs({ date: targetDate, limit: 99999 });

    const stats: AuditStats = {
      total: entries.length,
      success: 0,
      error: 0,
      blocked: 0,
      rewritten: 0,
      today: 0,
    };

    const todayStr = this.formatDate(new Date());
    for (const e of entries) {
      if (e.status === 'success') stats.success++;
      else if (e.status === 'error') stats.error++;
      else if (e.status === 'blocked') stats.blocked++;
      else if (e.status === 'rewritten') stats.rewritten++;

      if (targetDate === todayStr) stats.today = stats.total;
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
  getAvailableDates(): string[] {
    try {
      if (!fs.existsSync(this.auditDir)) return [];
      return fs.readdirSync(this.auditDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => f.replace('.jsonl', ''))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /**
   * 清理过期日志
   */
  private cleanupOldLogs(): void {
    try {
      if (!fs.existsSync(this.auditDir)) return;
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
    } catch { /* ignore */ }
  }

  private getDateFilePath(date: string): string {
    return path.join(this.auditDir, `${date}.jsonl`);
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
