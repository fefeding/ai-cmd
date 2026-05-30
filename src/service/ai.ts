import { request } from '@/service/base';

/**
 * 解包 API 响应
 * base.request 返回 {ret, msg, data}，此函数提取 data 字段
 * 若 ret !== 0 则抛出异常
 */
function unwrap<T = any>(res: any): T {
  if (res && typeof res === 'object' && 'ret' in res) {
    if (res.ret !== 0) throw new Error(res.msg || '请求失败');
    return res.data as T;
  }
  return res as T;
}

// ========== AI 配置 ==========

export function getAIConfig() {
  return request('/api/ai/getConfig', {}).then(unwrap);
}

export function updateAIConfig(config: any) {
  return request('/api/ai/updateConfig', config).then(unwrap);
}

export function testAIConfig(config: any) {
  return request('/api/ai/testConfig', config).then(unwrap);
}

// ========== AI 对话 ==========

export function chat(sessionId: string, message: string, context?: string) {
  return request('/api/ai/chat', { sessionId, message, context }).then(unwrap);
}

export function clearHistory(sessionId: string) {
  return request('/api/ai/clearHistory', { sessionId }).then(unwrap);
}

// ========== 对话历史 ==========

export function getDisplayHistory(sessionId: string) {
  return request<any[]>('/api/ai/getDisplayHistory', { sessionId }).then(unwrap);
}

export function saveDisplayHistory(sessionId: string, messages: any[], sessionName?: string) {
  return request('/api/ai/saveDisplayHistory', { sessionId, messages, sessionName }).then(unwrap);
}

export function listHistories() {
  return request<any[]>('/api/ai/listHistories', {}).then(unwrap);
}

export function loadHistory(sessionId: string) {
  return request<any[]>('/api/ai/loadHistory', { sessionId }).then(unwrap);
}

export function deleteHistory(sessionId: string) {
  return request('/api/ai/deleteHistory', { sessionId }).then(unwrap);
}

// ========== 系统环境 ==========

export function getSystemContext(sessionId: string) {
  return request<string>('/api/ai/getSystemContext', { sessionId }).then(unwrap);
}

// ========== Skills ==========

export function getSkills() {
  return request<any[]>('/api/ai/getSkills', {}).then(unwrap);
}

export function getSkill(id: string) {
  return request('/api/ai/getSkill', { id }).then(unwrap);
}
