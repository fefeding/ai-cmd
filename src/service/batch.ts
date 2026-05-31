import { request } from '@/service/base';

function unwrap<T = any>(res: any): T {
  if (res && typeof res === 'object' && 'ret' in res) {
    if (res.ret !== 0) throw new Error(res.msg || '请求失败');
    return res.data as T;
  }
  return res as T;
}

// ========== 批量操作 ==========

export interface BatchResult {
  sessionId: string;
  connectionId: string;
  sessionName: string;
  success: boolean;
  output: string;
  duration: number;
  error?: string;
}

export interface BatchTask {
  id: string;
  command: string;
  sessionIds: string[];
  results: BatchResult[];
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
}

export function executeBatch(sessionIds: string[], command: string, timeout?: number) {
  return request('/api/batch/execute', { sessionIds, command, timeout }).then(unwrap<BatchTask>);
}

export function getBatchResult(taskId: string) {
  return request('/api/batch/result', { taskId }).then(unwrap<BatchTask>);
}

export function getBatchTasks() {
  return request('/api/batch/tasks', {}).then(unwrap<BatchTask[]>);
}
