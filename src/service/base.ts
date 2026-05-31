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
    if (isNWjs || isElectron) {
        try {
            const apiPath = url.replace(/^(http(s)?:)?\/\//, '').replace(/.*?\/api\//, '/api/');
            let server;
            try {
                server = require('../server/index.js');
            } catch (e) {
                try {
                    const path = require('path');
                    const serverFilePath = path.join(process.cwd(), 'server', 'index.js');
                    server = require(serverFilePath);
                } catch (err) {
                    server = require('./server/index.js');
                }
            }
            const res = await server.handleRoutes(apiPath, data);
            return { status: 200, statusText: 'OK', data: { ret: 0, msg: 'success', data: res } };
        } catch (error: any) {
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
