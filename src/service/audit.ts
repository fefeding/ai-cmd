import { request } from '@/service/base';

function unwrap<T = any>(res: any): T {
  if (res && typeof res === 'object' && 'ret' in res) {
    if (res.ret !== 0) throw new Error(res.msg || '请求失败');
    return res.data as T;
  }
  return res as T;
}

// ========== 审计日志 ==========

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

export interface AuditQuery {
  date?: string;
  sessionId?: string;
  keyword?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  total: number;
  success: number;
  error: number;
  blocked: number;
  rewritten: number;
  today: number;
}

export function getAuditLogs(query: AuditQuery = {}) {
  return request('/api/audit/list', query).then(unwrap<{ entries: AuditEntry[]; total: number }>);
}

export function getAuditStats(date?: string) {
  return request('/api/audit/stats', { date }).then(unwrap<AuditStats>);
}

export function exportAuditLogs(startDate: string, endDate: string, format: 'json' | 'csv' = 'json') {
  return request('/api/audit/export', { startDate, endDate, format }).then(unwrap<string>);
}

export function getAuditDates() {
  return request('/api/audit/dates', {}).then(unwrap<string[]>);
}
