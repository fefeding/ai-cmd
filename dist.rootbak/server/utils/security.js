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
exports.isAuthDisabled = isAuthDisabled;
exports.getAccessToken = getAccessToken;
exports.getCookieName = getCookieName;
exports.parseCookies = parseCookies;
exports.timingSafeEqual = timingSafeEqual;
exports.isValidToken = isValidToken;
exports.extractTokenFromHeaders = extractTokenFromHeaders;
exports.isLocalHost = isLocalHost;
exports.isAllowedOrigin = isAllowedOrigin;
exports.requiresToken = requiresToken;
exports.getCookieHeader = getCookieHeader;
exports.normalizeUploadName = normalizeUploadName;
exports.maxUploadBytes = maxUploadBytes;
exports.safeJoinInside = safeJoinInside;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const data_dir_1 = require("./data-dir");
const TOKEN_FILE = 'access-token';
const COOKIE_NAME = 'aicmd_token';
function isAuthDisabled() {
    return process.env.AICMD_AUTH_DISABLED === '1' || process.env.AICMD_AUTH_DISABLED === 'true';
}
function getAccessToken() {
    if (process.env.AICMD_ACCESS_TOKEN)
        return process.env.AICMD_ACCESS_TOKEN;
    (0, data_dir_1.ensureDataDir)();
    const tokenPath = (0, data_dir_1.getDataPath)(TOKEN_FILE);
    try {
        if (fs.existsSync(tokenPath)) {
            const token = fs.readFileSync(tokenPath, 'utf-8').trim();
            if (token)
                return token;
        }
    }
    catch { /* ignore */ }
    const token = crypto.randomBytes(32).toString('base64url');
    fs.writeFileSync(tokenPath, token, { encoding: 'utf-8', mode: 0o600 });
    try {
        fs.chmodSync(tokenPath, 0o600);
    }
    catch { /* ignore */ }
    return token;
}
function getCookieName() {
    return COOKIE_NAME;
}
function parseCookies(cookieHeader) {
    const header = Array.isArray(cookieHeader) ? cookieHeader.join(';') : (cookieHeader || '');
    const cookies = {};
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index === -1)
            continue;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key)
            cookies[key] = decodeURIComponent(value);
    }
    return cookies;
}
function timingSafeEqual(a, b) {
    const left = Buffer.from(a || '');
    const right = Buffer.from(b || '');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function isValidToken(provided) {
    if (isAuthDisabled())
        return true;
    const token = getAccessToken();
    const value = Array.isArray(provided) ? provided[0] : provided;
    return !!value && timingSafeEqual(value, token);
}
function extractTokenFromHeaders(headers) {
    const auth = headers.authorization || headers.Authorization;
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
        return auth.slice(7).trim();
    }
    const headerToken = headers['x-aicmd-token'] || headers['X-AICmd-Token'];
    if (typeof headerToken === 'string')
        return headerToken;
    const cookies = parseCookies(headers.cookie);
    return cookies[COOKIE_NAME];
}
function isLocalHost(host) {
    if (!host)
        return true;
    const name = host.split(':')[0].toLowerCase();
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(name);
}
function isAllowedOrigin(origin, host) {
    if (!origin)
        return true;
    const value = Array.isArray(origin) ? origin[0] : origin;
    const hostValue = Array.isArray(host) ? host[0] : host;
    try {
        const originUrl = new URL(value);
        return originUrl.host === hostValue || isLocalHost(originUrl.host);
    }
    catch {
        return false;
    }
}
function requiresToken(origin, host) {
    if (isAuthDisabled())
        return false;
    const value = Array.isArray(origin) ? origin[0] : origin;
    const hostValue = Array.isArray(host) ? host[0] : host;
    if (!value)
        return !isLocalHost(hostValue);
    try {
        const originUrl = new URL(value);
        return originUrl.host !== hostValue;
    }
    catch {
        return true;
    }
}
function getCookieHeader(token, secure = false) {
    const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=2592000',
    ];
    if (secure)
        parts.push('Secure');
    return parts.join('; ');
}
function normalizeUploadName(name) {
    const normalized = String(name || '').replace(/\\/g, '/').replace(/\0/g, '');
    const isAbsolute = normalized.startsWith('/');
    const parts = normalized.split('/').filter(part => part && part !== '.' && part !== '..');
    if (!parts.length)
        throw new Error('Invalid file name');
    return `${isAbsolute ? '/' : ''}${parts.join('/')}`;
}
function maxUploadBytes() {
    const value = Number(process.env.AICMD_MAX_UPLOAD_MB || 100);
    const mb = Number.isFinite(value) && value > 0 ? value : 100;
    return Math.floor(mb * 1024 * 1024);
}
function safeJoinInside(baseDir, ...segments) {
    const target = path.resolve(baseDir, ...segments);
    const base = path.resolve(baseDir);
    if (target !== base && !target.startsWith(base + path.sep)) {
        throw new Error('Path escapes base directory');
    }
    return target;
}
//# sourceMappingURL=security.js.map