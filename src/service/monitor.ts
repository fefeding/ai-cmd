import { request } from '@/service/base';

function unwrap<T = any>(res: any): T {
  if (res && typeof res === 'object' && 'ret' in res) {
    if (res.ret !== 0) throw new Error(res.msg || '请求失败');
    return res.data as T;
  }
  return res as T;
}

// ========== 日志监控 ==========

export interface MonitorAlert {
  id: string;
  timestamp: number;
  monitorId: string;
  level: 'error' | 'warning' | 'critical';
  message: string;
  lines: string[];
  aiAnalysis?: string;
}

export interface MonitorInfo {
  monitorId: string;
  sessionId: string;
  connectionId: string;
  logPath: string;
  lineCount: number;
  alertCount: number;
  running: boolean;
}

export function startMonitor(sessionId: string, connectionId: string, logPath: string, pattern?: string) {
  return request('/api/monitor/start', { sessionId, connectionId, logPath, pattern }).then(unwrap<{ monitorId: string }>);
}

export function stopMonitor(monitorId: string) {
  return request('/api/monitor/stop', { monitorId }).then(unwrap<boolean>);
}

export function listMonitors(sessionId?: string) {
  return request('/api/monitor/list', { sessionId }).then(unwrap<MonitorInfo[]>);
}

export function getMonitorAlerts(monitorId: string, limit = 50) {
  return request('/api/monitor/alerts', { monitorId, limit }).then(unwrap<MonitorAlert[]>);
}

export function getMonitorLines(monitorId: string, limit = 100) {
  return request('/api/monitor/lines', { monitorId, limit }).then(unwrap<string[]>);
}

export function getMonitorBatch(monitorId: string) {
  return request('/api/monitor/analyze', { monitorId }).then(unwrap<string[]>);
}
