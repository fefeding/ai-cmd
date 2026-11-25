/**
 * RDP 文件传输（CLIPRDR Extension）相关状态与回调。
 *
 * 从 rdp-tab.vue 拆出：上传（本地 File → 远程拉取）与下载（远程通告 → 本地保存）
 * 共用同一份 RDP 剪贴板，因此 fileCopyMode 与流表必须放在一起管理，
 * 避免外部散落的状态与 WASM 回调时序不一致。
 */
import { ref } from 'vue';
import { Extension } from 'ironrdp-wasm';
import type { Session } from 'ironrdp-wasm';
import { toast } from '@/utils/toast';

export interface RdpTransferItem {
  name: string;
  status: string;
}

export interface RdpPendingDownload {
  name: string;
  fileSize: number;
  index: number;
  clipDataId: any;
}

export interface RdpStreamInfo {
  name: string;
  clipDataId: any;
  _chunks?: Uint8Array[];
  _totalSize?: number;
  _expectedSize?: number;
  _sizeReceived?: boolean;
  _fileIndex?: number;
  _sizeStreamId?: number;
  _uiIndex?: number;
}

function formatError(e: any): string {
  if (e == null) return '未知错误';
  if (typeof e === 'string') return e;
  if (typeof e === 'object') {
    const msg = e.message || e.msg || e.reason || e.description;
    if (typeof msg === 'string' && msg) return msg;
    try {
      const json = JSON.stringify(e);
      if (json && json !== '{}') return json;
    } catch { /* ignore */ }
  }
  return String(e);
}

export function useRdpFileTransfer(
  getSession: () => Session | null,
  onError: (message: string) => void
) {
  const transferItems = ref<RdpTransferItem[]>([]);
  const pendingDownloads = ref<RdpPendingDownload[]>([]);
  const uploadedFiles = new Map<number, File>();
  /** key: streamId；size 响应用 i+1，数据响应用 i+1+1000，二者指向同一 info */
  const streamToFileInfo = new Map<number, RdpStreamInfo>();
  /** 当前 RDP 剪贴板承载的是待粘贴文件，不能再推送文本覆盖格式列表 */
  let fileCopyMode = false;

  function addTransferItem(name: string, state: string): number {
    transferItems.value.push({ name, status: state });
    return transferItems.value.length - 1;
  }

  function updateTransferItem(index: number, state: string): void {
    if (transferItems.value[index]) transferItems.value[index].status = state;
  }

  /** 向 SessionBuilder 注册三个文件传输 Extension 回调 */
  function registerFileExtensions(builder: InstanceType<typeof import('ironrdp-wasm').SessionBuilder>) {
    builder.extension(new Extension('files_available_callback', (files: any[], clipDataId: any) => {
      pendingDownloads.value = [];
      streamToFileInfo.clear();
      files.forEach((f, i) => {
        const name = f.name || `file_${i}`;
        pendingDownloads.value.push({ name, fileSize: f.fileSize || 0, index: i, clipDataId });
        const uiIndex = addTransferItem(name, '可下载');
        // size 响应与数据响应共用 info，靠 _sizeStreamId 区分（不能靠 data.length===8）
        streamToFileInfo.set(i + 1, {
          name, clipDataId, _fileIndex: i, _sizeStreamId: i + 1, _uiIndex: uiIndex,
        });
      });
    }));

    builder.extension(new Extension('file_contents_request_callback', async (request: any) => {
      const file = uploadedFiles.get(request.index);
      const send = (isError: boolean, data: Uint8Array) => {
        try {
          getSession()?.invokeExtension(new Extension('submit_file_contents', {
            stream_id: request.streamId, is_error: isError, data,
          }));
        } catch { /* ignore */ }
      };
      if (!file) { send(true, new Uint8Array(0)); return; }
      try {
        if (request.flags & 0x00000001) {
          const sizeBytes = new Uint8Array(8);
          new DataView(sizeBytes.buffer).setBigUint64(0, BigInt(file.size), true);
          send(false, sizeBytes);
        } else if (request.flags & 0x00000002) {
          const blob = file.slice(request.position, request.position + request.size);
          send(false, new Uint8Array(await blob.arrayBuffer()));
        }
      } catch { send(true, new Uint8Array(0)); }
    }));

    builder.extension(new Extension('file_contents_response_callback', (response: any) => {
      const info = streamToFileInfo.get(response.streamId);
      if (!info) return;
      if (response.isError) {
        if (info._uiIndex !== undefined) updateTransferItem(info._uiIndex, '失败');
        return;
      }
      if (!info._chunks) { info._chunks = []; info._totalSize = 0; }
      if (response.streamId === info._sizeStreamId && !info._sizeReceived) {
        info._sizeReceived = true;
        const dv = new DataView(response.data.buffer, response.data.byteOffset, response.data.byteLength);
        info._expectedSize = Number(dv.getBigUint64(0, true));
        const dataStreamId = response.streamId + 1000;
        streamToFileInfo.set(dataStreamId, info);
        getSession()?.invokeExtension(new Extension('request_file_contents', {
          stream_id: dataStreamId,
          file_index: info._fileIndex,
          flags: 0x00000002,
          position: 0,
          size: info._expectedSize,
          clip_data_id: info.clipDataId,
        }));
      } else {
        info._chunks.push(new Uint8Array(response.data));
        info._totalSize = (info._totalSize || 0) + response.data.length;
        if (info._expectedSize != null && info._totalSize >= info._expectedSize) {
          const blob = new Blob(info._chunks as BlobPart[]);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = info.name;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          // 立即 revoke 会让部分浏览器拿到空文件
          setTimeout(() => URL.revokeObjectURL(url), 30_000);
          if (info._uiIndex !== undefined) updateTransferItem(info._uiIndex, '已下载');
        }
      }
    }));
  }

  /** 把本地文件列表通告到 RDP 剪贴板（上传按钮 / 原生 paste / 拖拽共用） */
  function initiateFilesUpload(files: File[]): void {
    const session = getSession();
    if (!files.length || !session) return;
    uploadedFiles.clear();
    files.forEach((file, index) => {
      uploadedFiles.set(index, file);
      addTransferItem(file.name, '等待远程粘贴');
    });
    try {
      fileCopyMode = true;
      session.invokeExtension(new Extension('initiate_file_copy', files.map((file) => ({
        name: file.name, size: file.size, lastModified: file.lastModified,
      }))));
      toast.info(`已选择 ${files.length} 个文件，请在远程桌面按 Ctrl+V 粘贴`);
    } catch (err: any) {
      fileCopyMode = false;
      onError(`上传失败: ${formatError(err)}`);
    }
  }

  /** 用户点「下载」时，对每个通告过的远程文件先请求 8 字节 size */
  function downloadFiles(): void {
    const session = getSession();
    if (!session) return;
    pendingDownloads.value.forEach((f) => {
      const streamId = f.index + 1;
      if (!streamToFileInfo.has(streamId)) return;
      session.invokeExtension(new Extension('request_file_contents', {
        stream_id: streamId, file_index: f.index, flags: 0x00000001,
        position: 0, size: 8, clip_data_id: f.clipDataId,
      }));
    });
  }

  function reset(): void {
    uploadedFiles.clear();
    pendingDownloads.value = [];
    streamToFileInfo.clear();
    transferItems.value = [];
    fileCopyMode = false;
  }

  return {
    transferItems,
    pendingDownloads,
    registerFileExtensions,
    initiateFilesUpload,
    downloadFiles,
    reset,
    isFileCopyMode: () => fileCopyMode,
    setFileCopyMode: (value: boolean) => { fileCopyMode = value; },
  };
}
