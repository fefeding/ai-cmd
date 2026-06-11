// @ts-ignore
export const isNWjs = typeof process !== 'undefined' && process.__nwjs !== undefined;
// @ts-ignore
export const isVSCode = typeof acquireVsCodeApi !== 'undefined' || (typeof process !== 'undefined' && process.env.VSCODE_PID);
// @ts-ignore
export const isChromeExtension = !isNWjs && !isVSCode && (() => { try { return typeof chrome !== 'undefined' && Boolean(chrome?.runtime) && Boolean(chrome?.runtime?.id) } catch (e) { return false } })();
// Electron 检测：sandbox 模式下 process 不可用，通过 preload 暴露的 window.electronAPI 判断
// @ts-ignore
export const isElectron = (typeof process === 'object' && process.versions?.electron !== undefined) || Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);
export const isBrowser = typeof window !== 'undefined' && !isNWjs && !isVSCode && !isChromeExtension && !isElectron;
export const isInIframe = isBrowser && window.top !== window;

const UA = isBrowser ? navigator.userAgent : '';

export enum PLATFORM {
    UNKNOWN = 'unknown',
    WEB = 'web',
    IFRAME = 'iframe',
}

export const IS_MOBILE = /Mobile/i.test(UA);
export const IS_WINDOWS = /Windows/i.test(UA);

export { UA as platformUA };
