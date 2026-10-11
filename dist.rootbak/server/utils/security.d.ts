export declare function isAuthDisabled(): boolean;
export declare function getAccessToken(): string;
export declare function getCookieName(): string;
export declare function parseCookies(cookieHeader?: string | string[]): Record<string, string>;
export declare function timingSafeEqual(a: string, b: string): boolean;
export declare function isValidToken(provided?: string | string[]): boolean;
export declare function extractTokenFromHeaders(headers: Record<string, any>): string | undefined;
export declare function isLocalHost(host?: string | null): boolean;
export declare function isAllowedOrigin(origin?: string | string[], host?: string | string[]): boolean;
export declare function requiresToken(origin?: string | string[], host?: string | string[]): boolean;
export declare function getCookieHeader(token: string, secure?: boolean): string;
export declare function normalizeUploadName(name: string): string;
export declare function maxUploadBytes(): number;
export declare function safeJoinInside(baseDir: string, ...segments: string[]): string;
//# sourceMappingURL=security.d.ts.map