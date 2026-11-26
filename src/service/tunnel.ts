import { request } from '@/service/base';
import type { PortForwardRule, PortForwardStatus } from '@/typings/connection';

function unwrap<T = any>(res: any): T {
  if (res && typeof res === 'object' && 'ret' in res) {
    if (res.ret !== 0) throw new Error(res.msg || '请求失败');
    return res.data as T;
  }
  return res as T;
}

/**
 * SSH 端口转发 / 隧道管理（前端）
 */
export class TunnelService {
  async list(sessionId: string): Promise<PortForwardStatus[]> {
    return request('/api/tunnel/list', { sessionId }).then(unwrap<PortForwardStatus[]>);
  }

  async start(sessionId: string, rule: PortForwardRule): Promise<PortForwardStatus[]> {
    return request('/api/tunnel/start', { sessionId, rule }).then(unwrap<PortForwardStatus[]>);
  }

  async stop(sessionId: string, ruleId: string): Promise<PortForwardStatus[]> {
    return request('/api/tunnel/stop', { sessionId, ruleId }).then(unwrap<PortForwardStatus[]>);
  }

  async stopAll(sessionId: string): Promise<boolean> {
    return request('/api/tunnel/stopAll', { sessionId }).then(unwrap<boolean>);
  }
}

export const tunnelService = new TunnelService();
