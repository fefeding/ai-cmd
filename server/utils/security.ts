import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getDataPath, ensureDataDir } from './data-dir';

const TOKEN_FILE = 'access-token';
const COOKIE_NAME = 'aicmd_token';

export function isAuthDisabled(): boolean {
  return process.env.AICMD_AUTH_DISABLED === '1' || process.env.AICMD_AUTH_DISABLED === 'true';
}

export function getAccessToken(): string {
  if (process.env.AICMD_ACCESS_TOKEN) return process.env.AICMD_ACCESS_TOKEN;
  ensureDataDir();
  const tokenPath = getDataPath(TOKEN_FILE);
  try {
    if (fs.existsSync(tokenPath)) {
      const token = fs.readFileSync(tokenPath, 'utf-8').trim();
      if (token) return token;
    }
  } catch { /* ignore */ }
  const token = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(tokenPath, token, { encoding: 'utf-8', mode: 0o600 });
  try { fs.chmodSync(tokenPath, 0o600); } catch { /* ignore */ }
  return token;
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

export function parseCookies(cookieHeader?: string | string[]): Record<string, string> {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join(';') : (cookieHeader || '');
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function isValidToken(provided?: string | string[]): boolean {
  if (isAuthDisabled()) return true;
  const token = getAccessToken();
  const value = Array.isArray(provided) ? provided[0] : provided;
  return !!value && timingSafeEqual(value, token);
}

export function extractTokenFromHeaders(headers: Record<string, any>): string | undefined {
  const auth = headers.authorization || headers.Authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const headerToken = headers['x-aicmd-token'] || headers['X-AICmd-Token'];
  if (typeof headerToken === 'string') return headerToken;
  const cookies = parseCookies(headers.cookie);
  return cookies[COOKIE_NAME];
}

export function isLocalHost(host?: string | null): boolean {
  if (!host) return true;
  const name = host.split(':')[0].toLowerCase();
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(name);
}

export function isAllowedOrigin(origin?: string | string[], host?: string | string[]): boolean {
  if (!origin) return true;
  const value = Array.isArray(origin) ? origin[0] : origin;
  const hostValue = Array.isArray(host) ? host[0] : host;
  try {
    const originUrl = new URL(value);
    return originUrl.host === hostValue || isLocalHost(originUrl.host);
  } catch {
    return false;
  }
}

export function requiresToken(origin?: string | string[], host?: string | string[]): boolean {
  if (isAuthDisabled()) return false;
  const value = Array.isArray(origin) ? origin[0] : origin;
  const hostValue = Array.isArray(host) ? host[0] : host;
  if (!value) return !isLocalHost(hostValue);
  try {
    const originUrl = new URL(value);
    return originUrl.host !== hostValue;
  } catch {
    return true;
  }
}

export function getCookieHeader(token: string, secure = false): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=2592000',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function normalizeUploadName(name: string): string {
  const normalized = String(name || '').replace(/\\/g, '/').replace(/\0/g, '');
  const parts = normalized.split('/').filter(part => part && part !== '.' && part !== '..');
  if (!parts.length) throw new Error('Invalid file name');
  return parts.join('/');
}

export function maxUploadBytes(): number {
  const value = Number(process.env.AICMD_MAX_UPLOAD_MB || 100);
  const mb = Number.isFinite(value) && value > 0 ? value : 100;
  return Math.floor(mb * 1024 * 1024);
}

export function safeJoinInside(baseDir: string, ...segments: string[]): string {
  const target = path.resolve(baseDir, ...segments);
  const base = path.resolve(baseDir);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('Path escapes base directory');
  }
  return target;
}
