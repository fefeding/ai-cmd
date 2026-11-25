import { isAllowedOrigin, isValidToken, extractTokenFromHeaders, requiresToken } from './security';

export interface RdpWsAuthResult {
  ok: boolean;
  connectionId?: string;
  reason?: string;
}

/**
 * 统一校验 /ws/rdp 升级请求并取 connectionId。
 * server.js 与 vite.config.ts 共用此实现，避免两处鉴权规则漂移；
 * 畸形 URL 在这里被吞掉并返回失败，不能冒泡成未捕获异常。
 */
export function validateRdpWsRequest(req: {
  url?: string;
  headers: Record<string, any>;
}): RdpWsAuthResult {
  let requestUrl: URL;
  try {
    requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    return { ok: false, reason: 'Bad request' };
  }
  const wsToken = requestUrl.searchParams.get('token') || extractTokenFromHeaders(req.headers);
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)
    || (requiresToken(req.headers.origin, req.headers.host) && !isValidToken(wsToken))) {
    return { ok: false, reason: 'Unauthorized' };
  }
  const connectionId = requestUrl.searchParams.get('connectionId');
  if (!connectionId) return { ok: false, reason: 'Missing connectionId' };
  return { ok: true, connectionId };
}
