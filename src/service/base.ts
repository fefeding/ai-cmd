import * as requestHelper from '@/utils/request';
import type { AxiosRequestConfig } from 'axios';
import config from '../base/config';
import { isElectron } from '@/base/detect';

export function getRequestUrl(api: string) {
    if (/^(http(s)?:)?\/\//.test(api)) return api;
    const apiUrl = config.apiUrl || `${location.protocol}//${location.hostname}${[80, 443].includes(Number(location.port)) ? '' : (':' + location.port)}`;
    return `${apiUrl.trim()}${config.prefix}${api}`;
}

export async function requestServer(url: string, data?: any, option?: AxiosRequestConfig) {
    // Electron 生产模式：通过 preload 暴露的 IPC API 调用主进程服务
    // Electron 开发模式 / Web 模式：走 HTTP 请求到开发服务器
    const isElectronProduction = isElectron && window.electronAPI?.isPackaged;
    if (isElectronProduction) {
        try {
            const apiPath = url.replace(/^(http(s)?:)?\/\//, '').replace(/.*?\/api\//, '/api/');
            console.log(`[requestServer] Calling API via IPC: ${apiPath}`);
            const res = await window.electronAPI?.api.request(apiPath, data);
            return { status: 200, statusText: 'OK', data: res };
        } catch (error: any) {
            console.error(`[requestServer] ERROR: ${error.message}`);
            console.error(error.stack);
            return { status: 500, statusText: 'Error', data: { ret: 500, msg: error.message || '执行失败' } };
        }
    } else {
        url = getRequestUrl(url);
        return requestHelper.request(url, data, option);
    }
}

export async function request<T = any>(url: string, data?: any, option?: AxiosRequestConfig) {
    const res = await requestServer(url, data, option);
    if (!res || res instanceof Array) return res as T;
    if (typeof res !== 'object') return res as T;
    if (res.status !== 200) {
        throw { ret: res.status, msg: res.data?.msg || res.statusText };
    }
    return res.data as T;
}
