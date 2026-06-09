import * as requestHelper from '@/utils/request';
import type { AxiosRequestConfig } from 'axios';
import config from '../base/config';
import { isNWjs, isElectron } from '@/base/detect';

export function getRequestUrl(api: string) {
    if (/^(http(s)?:)?\/\//.test(api)) return api;
    const apiUrl = config.apiUrl || `${location.protocol}//${location.hostname}${[80, 443].includes(Number(location.port)) ? '' : (':' + location.port)}`;
    return `${apiUrl.trim()}${config.prefix}${api}`;
}

export async function requestServer(url: string, data?: any, option?: AxiosRequestConfig) {
    // Electron 生产模式：直接 require 服务端模块（避免 HTTP 开销）
    // Electron 开发模式 / Web 模式：走 HTTP 请求到开发服务器
    const isElectronProduction = isElectron && window.electronAPI?.isPackaged;
    if (isNWjs || isElectronProduction) {
        try {
            const apiPath = url.replace(/^(http(s)?:)?\/\//, '').replace(/.*?\/api\//, '/api/');
            console.log(`[requestServer] Calling API: ${apiPath}`);
            let server;
            // 使用 preload 提供的绝对路径加载 server 模块
            const serverPath = window.electronAPI?.serverModulePath;
            if (serverPath) {
                console.log(`[requestServer] Loading server from preload path: ${serverPath}`);
                server = require(serverPath);
            } else {
                // fallback: 开发模式或未配置 serverModulePath 时
                console.log(`[requestServer] No serverModulePath, trying relative require`);
                server = require('../server/index.js');
            }
            console.log(`[requestServer] Server loaded, calling handleRoutes`);
            const res = await server.handleRoutes(apiPath, data);
            console.log(`[requestServer] handleRoutes returned for ${apiPath}`);
            return { status: 200, statusText: 'OK', data: { ret: 0, msg: 'success', data: res } };
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
