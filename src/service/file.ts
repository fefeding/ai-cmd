import { request, getRequestUrl } from '@/service/base';

export interface RemoteFileInfo {
  name: string;
  path: string;
  size: number;
  mtime: number;
  atime: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  mode: number;
  permissions: string;
  owner: string;
  group: string;
}

function unwrap<T = any>(res: any): T {
  if (res && typeof res === 'object' && 'ret' in res) {
    if (res.ret !== 0) throw new Error(res.msg || '请求失败');
    return res.data as T;
  }
  return res as T;
}

export function listDirectory(sessionId: string, remotePath: string): Promise<RemoteFileInfo[]> {
  return request<RemoteFileInfo[]>('/api/file/list', { sessionId, path: remotePath }).then(unwrap);
}

export function makeDirectory(sessionId: string, remotePath: string): Promise<void> {
  return request('/api/file/mkdir', { sessionId, path: remotePath }).then(unwrap);
}

export function removePath(sessionId: string, remotePath: string): Promise<void> {
  return request('/api/file/remove', { sessionId, path: remotePath }).then(unwrap);
}

export function renamePath(sessionId: string, oldPath: string, newPath: string): Promise<void> {
  return request('/api/file/rename', { sessionId, oldPath, newPath }).then(unwrap);
}

export function getDefaultDir(sessionId: string): Promise<string> {
  return request<string>('/api/file/defaultDir', { sessionId }).then(unwrap);
}

/** 判断当前是否处于 Electron 生产模式（文件二进制走主进程 IPC） */
function isElectronProduction(): boolean {
  const api = (window as any).electronAPI;
  return !!(api && api.isElectron && api.isPackaged && api.api);
}

/** 上传本地文件到远程指定路径 */
export async function uploadFile(
  sessionId: string,
  remotePath: string,
  file: File,
): Promise<void> {
  if (isElectronProduction()) {
    const api = (window as any).electronAPI.api;
    const buf = await file.arrayBuffer();
    const res = await api.uploadFile(sessionId, remotePath, buf);
    if (!res || !res.success) throw new Error(res?.error || '上传失败');
    return;
  }
  const url = getRequestUrl('/api/file-upload');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Session-Id': sessionId,
      'X-File-Name': remotePath,
      'Content-Type': 'application/octet-stream',
    },
    body: file,
    credentials: 'include',
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || '上传失败');
  }
}

/** 下载远程文件到本地 */
export async function downloadFile(
  sessionId: string,
  remotePath: string,
  fileName: string,
): Promise<void> {
  if (isElectronProduction()) {
    const api = (window as any).electronAPI.api;
    const res = await api.downloadFile(sessionId, remotePath, fileName);
    if (res && res.canceled) return;
    if (!res || !res.success) throw new Error(res?.error || '下载失败');
    return;
  }
  // Web 模式：使用 fetch + Blob 下载，确保携带认证 cookie
  const params = new URLSearchParams({ sessionId, path: remotePath });
  const url = getRequestUrl('/api/file/download') + '?' + params.toString();
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || errData.msg || `下载失败 (${resp.status})`);
  }
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName || remotePath.split('/').pop() || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
