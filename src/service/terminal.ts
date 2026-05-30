import { request } from '@/service/base';

/**
 * 解包 API 响应
 */
function unwrap<T = any>(res: any): T {
  if (res && typeof res === 'object' && 'ret' in res) {
    if (res.ret !== 0) throw new Error(res.msg || '请求失败');
    return res.data as T;
  }
  return res as T;
}

// ========== 终端 Session 管理 ==========

export function getSessions() {
  return request<any[]>('/api/terminal/getSessions', {}).then(unwrap);
}

export function renameSession(sessionId: string, name: string) {
  return request('/api/terminal/renameSession', { sessionId, name }).then(unwrap);
}

export function deleteSession(sessionId: string) {
  return request('/api/terminal/deleteSession', { sessionId }).then(unwrap);
}

export function closeSession(sessionId: string) {
  return request('/api/terminal/closeSession', { sessionId }).then(unwrap);
}

export function closeAllSessions() {
  return request('/api/terminal/closeAllSessions', {}).then(unwrap);
}
