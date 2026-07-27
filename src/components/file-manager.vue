<template>
  <div class="fm-panel">
      <div class="fm-header">
        <div class="fm-title">
          <span class="fm-icon">🗂</span> {{ t('fileManager.title') }}
        </div>
        <div class="fm-header-actions">
          <button class="fm-btn fm-close" :title="t('common.close')" @click="emit('close')">✕</button>
        </div>
      </div>

      <div class="fm-toolbar">
        <button class="fm-btn" :disabled="!canGoUp" @click="goUp">⬆ {{ t('fileManager.up') }}</button>
        <button class="fm-btn" @click="refresh">⟳ {{ t('fileManager.refresh') }}</button>
        <button class="fm-btn" @click="requestNewFolder">＋ {{ t('fileManager.newFolder') }}</button>
        <button class="fm-btn" @click="onUploadClick">⬆ {{ t('fileManager.upload') }}</button>
        <button class="fm-btn fm-danger" :disabled="!selectedItems.length" @click="removeSelected">
          🗑 {{ t('fileManager.deleteSelected') }} ({{ selectedItems.length }})
        </button>
        <span class="fm-cwd" :title="currentPath">{{ currentPath }}</span>
      </div>

      <div class="fm-breadcrumbs">
        <span class="fm-crumb" @click="navigateTo(0)">/</span>
        <template v-for="(seg, i) in breadcrumbSegments" :key="i">
          <span class="fm-sep">/</span>
          <span class="fm-crumb" @click="navigateTo(i + 1)">{{ seg.name }}</span>
        </template>
      </div>

      <div class="fm-list" @dragover.prevent @drop.prevent="onDrop">
        <table class="fm-table">
          <thead>
            <tr>
              <th class="fm-col-check">
                <input type="checkbox" :checked="allSelected" @change="toggleAll" />
              </th>
              <th>{{ t('fileManager.name') }}</th>
              <th class="fm-col-size">{{ t('fileManager.size') }}</th>
              <th class="fm-col-time">{{ t('fileManager.modified') }}</th>
              <th class="fm-col-perm">{{ t('fileManager.permissions') }}</th>
              <th class="fm-col-actions">{{ t('fileManager.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in items"
              :key="item.path"
              :class="{ 'fm-selected': isSelected(item) }"
              @click="toggleSelect(item)"
              @dblclick.stop="openItem(item)"
            >
              <td class="fm-col-check">
                <input type="checkbox" :checked="isSelected(item)" @click.stop="toggleSelect(item)" />
              </td>
              <td class="fm-col-name">
                <span class="fm-file-icon">{{ iconFor(item) }}</span>
                <span class="fm-file-name">{{ item.name }}</span>
              </td>
              <td class="fm-col-size">{{ item.isDirectory ? '—' : formatSize(item.size) }}</td>
              <td class="fm-col-time">{{ formatTime(item.mtime) }}</td>
              <td class="fm-col-perm">{{ item.permissions }}</td>
              <td class="fm-col-actions">
                <button v-if="!item.isDirectory" class="fm-link" @click.stop="downloadItem(item)">{{ t('fileManager.download') }}</button>
                <button class="fm-link" @click.stop="requestRename(item)">{{ t('fileManager.rename') }}</button>
                <button class="fm-link fm-link-danger" @click.stop="removeItem(item)">{{ t('fileManager.delete') }}</button>
              </td>
            </tr>
            <tr v-if="!loading && !items.length">
              <td colspan="6" class="fm-empty">{{ t('fileManager.empty') }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="fm-loading">{{ t('fileManager.loading') }}</div>
        <div v-if="uploading" class="fm-loading">
          {{ t('fileManager.uploading', { current: uploadProgress.current, total: uploadProgress.total }) }}
        </div>
        <div v-if="downloading" class="fm-loading">{{ t('fileManager.downloading') }}</div>
      </div>

      <input ref="fileInput" type="file" multiple hidden @change="onFileSelected" />

      <div v-if="promptState" class="fm-prompt-mask" @click.self="promptState = null">
        <div class="fm-prompt">
          <div class="fm-prompt-title">
            {{ promptState.mode === 'mkdir' ? t('fileManager.newFolderPrompt') : t('fileManager.renamePrompt') }}
          </div>
          <input
            ref="promptInput"
            v-model="promptState.value"
            class="fm-prompt-input"
            @keyup.enter="confirmPrompt"
            @keyup.esc="promptState = null"
          />
          <div class="fm-prompt-actions">
            <button class="fm-btn" @click="confirmPrompt">{{ t('common.confirm') }}</button>
            <button class="fm-btn" @click="promptState = null">{{ t('common.cancel') }}</button>
          </div>
        </div>
      </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  listDirectory,
  makeDirectory,
  removePath,
  renamePath,
  getDefaultDir,
  uploadFile,
  downloadFile,
  type RemoteFileInfo,
} from '@/service/file';
import { modal } from '@/utils/modal';
import { toast } from '@/utils/toast';

const props = defineProps<{
  sessionId: string;
  initialPath?: string;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { t } = useI18n();

const currentPath = ref('');
const items = ref<RemoteFileInfo[]>([]);
const loading = ref(false);
const uploading = ref(false);
const uploadProgress = ref({ current: 0, total: 0 });
const downloading = ref(false);
const selectedItems = ref<RemoteFileInfo[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const promptState = ref<{ mode: 'mkdir' | 'rename'; value: string; target?: RemoteFileInfo } | null>(null);
const promptInput = ref<HTMLInputElement | null>(null);

let loadSeq = 0;

const canGoUp = computed(() => currentPath.value !== '/' && currentPath.value !== '');

const breadcrumbSegments = computed(() => {
  const p = currentPath.value.replace(/\/$/, '');
  if (!p) return [];
  return p.split('/').filter(Boolean).map((name) => ({ name }));
});

const allSelected = computed(
  () => items.value.length > 0 && selectedItems.value.length === items.value.length,
);

function pathOf(index: number): string {
  const parts = currentPath.value.replace(/\/$/, '').split('/').filter(Boolean);
  if (index <= 0) return '/';
  return '/' + parts.slice(0, index).join('/');
}

function navigateTo(index: number) {
  currentPath.value = pathOf(index);
  load();
}

function goUp() {
  if (!canGoUp.value) return;
  const p = currentPath.value.replace(/\/$/, '');
  const idx = p.lastIndexOf('/');
  currentPath.value = idx <= 0 ? '/' : p.substring(0, idx);
  load();
}

async function load(path?: string) {
  if (!props.sessionId) {
    toast.error(t('fileManager.noSession'));
    return;
  }
  const target = path ?? currentPath.value;
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const list = await listDirectory(props.sessionId, target);
    if (seq !== loadSeq) return; // 过期响应，丢弃
    items.value = list;
    selectedItems.value = [];
  } catch (e: any) {
    if (seq !== loadSeq) return;
    items.value = [];
    toast.error(t('fileManager.loadFailed', { msg: e?.message || String(e) }));
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function isSelected(item: RemoteFileInfo): boolean {
  return selectedItems.value.some((i) => i.path === item.path);
}

function toggleSelect(item: RemoteFileInfo) {
  const idx = selectedItems.value.findIndex((i) => i.path === item.path);
  if (idx >= 0) selectedItems.value.splice(idx, 1);
  else selectedItems.value.push(item);
}

function toggleAll() {
  if (allSelected.value) selectedItems.value = [];
  else selectedItems.value = [...items.value];
}

function openItem(item: RemoteFileInfo) {
  if (item.isDirectory) {
    currentPath.value = item.path;
    load();
  } else {
    downloadItem(item);
  }
}

function refresh() {
  load();
}

function onUploadClick() {
  fileInput.value?.click();
}

async function uploadFiles(files: FileList | File[]) {
  if (!props.sessionId) return;
  const list = Array.from(files);
  if (!list.length) return;
  uploading.value = true;
  uploadProgress.value = { current: 0, total: list.length };
  let ok = 0;
  for (const file of list) {
    const remotePath = currentPath.value.replace(/\/$/, '') + '/' + file.name;
    try {
      await uploadFile(props.sessionId, remotePath, file);
      ok++;
    } catch (e: any) {
      toast.error(t('fileManager.uploadFailed', { msg: e?.message || String(e) }));
    }
    uploadProgress.value.current++;
  }
  uploading.value = false;
  if (ok > 0) {
    toast.success(t('fileManager.uploadSuccess', { count: ok }));
    await load();
  }
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files) uploadFiles(input.files);
  input.value = '';
}

function onDrop(e: DragEvent) {
  if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
}

async function downloadItem(item: RemoteFileInfo) {
  downloading.value = true;
  try {
    await downloadFile(props.sessionId, item.path, item.name);
  } catch (e: any) {
    toast.error(e?.message || String(e));
  } finally {
    downloading.value = false;
  }
}

function requestNewFolder() {
  promptState.value = { mode: 'mkdir', value: '' };
  nextTick(() => promptInput.value?.focus());
}

function requestRename(item: RemoteFileInfo) {
  promptState.value = { mode: 'rename', value: item.name, target: item };
  nextTick(() => promptInput.value?.focus());
}

async function confirmPrompt() {
  const ps = promptState.value;
  if (!ps) return;
  const name = ps.value.trim();
  if (!name) {
    promptState.value = null;
    return;
  }
  if (name.includes('/')) {
    toast.error(t('fileManager.invalidName'));
    return;
  }
  try {
    if (ps.mode === 'mkdir') {
      const remotePath = currentPath.value.replace(/\/$/, '') + '/' + name;
      await makeDirectory(props.sessionId, remotePath);
      toast.success(t('fileManager.created'));
    } else if (ps.target) {
      const parent = ps.target.path.replace(/\/$/, '');
      const idx = parent.lastIndexOf('/');
      const base = idx <= 0 ? '' : parent.substring(0, idx);
      const newPath = base + '/' + name;
      await renamePath(props.sessionId, ps.target.path, newPath);
      toast.success(t('fileManager.renamed'));
    }
    promptState.value = null;
    await load();
  } catch (e: any) {
    toast.error(e?.message || String(e));
  }
}

async function removeItem(item: RemoteFileInfo) {
  const confirmed = await modal.confirm(t('fileManager.confirmDelete', { name: item.name }));
  if (!confirmed) return;
  try {
    await removePath(props.sessionId, item.path);
    toast.success(t('fileManager.deleted'));
    await load();
  } catch (e: any) {
    toast.error(e?.message || String(e));
  }
}

async function removeSelected() {
  if (!selectedItems.value.length) return;
  const confirmed = await modal.confirm(
    t('fileManager.confirmDeleteMulti', { count: selectedItems.value.length }),
  );
  if (!confirmed) return;
  for (const item of selectedItems.value) {
    try {
      await removePath(props.sessionId, item.path);
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  }
  toast.success(t('fileManager.deleted'));
  await load();
}

function close() {
  emit('close');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function iconFor(item: RemoteFileInfo): string {
  if (item.isDirectory) return '📁';
  if (item.isSymbolicLink) return '🔗';
  return '📄';
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (promptState.value) promptState.value = null;
    else close();
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  selectedItems.value = [];
  if (props.initialPath) {
    currentPath.value = props.initialPath;
    await load();
  } else {
    try {
      const dir = await getDefaultDir(props.sessionId);
      currentPath.value = dir || '/';
    } catch {
      currentPath.value = '/';
    }
    await load();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.fm-panel {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.fm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border-color);
}
.fm-title {
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.fm-header-actions {
  display: flex;
  gap: 6px;
}
.fm-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}
.fm-btn {
  background: var(--bg-dark);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}
.fm-btn:hover:not(:disabled) {
  border-color: var(--accent);
}
.fm-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.fm-btn.fm-danger {
  color: var(--danger);
}
.fm-close {
  color: var(--text-secondary);
}
.fm-cwd {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 12px;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fm-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}
.fm-crumb {
  cursor: pointer;
  color: var(--accent);
}
.fm-crumb:hover {
  text-decoration: underline;
}
.fm-sep {
  opacity: 0.6;
}
.fm-list {
  flex: 1;
  overflow: auto;
  position: relative;
}
.fm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.fm-table th,
.fm-table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
}
.fm-table thead th {
  position: sticky;
  top: 0;
  background: var(--bg-toolbar);
  color: var(--text-secondary);
  z-index: 1;
}
.fm-col-check {
  width: 32px;
  text-align: center;
}
.fm-col-size,
.fm-col-time,
.fm-col-perm {
  width: 120px;
}
.fm-col-actions {
  width: 170px;
}
.fm-table tbody tr {
  cursor: pointer;
}
.fm-table tbody tr:hover {
  background: rgba(137, 180, 250, 0.08);
}
.fm-selected {
  background: rgba(137, 180, 250, 0.15) !important;
}
.fm-file-icon {
  margin-right: 6px;
}
.fm-link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  margin-right: 8px;
  padding: 0;
}
.fm-link:hover {
  text-decoration: underline;
}
.fm-link-danger {
  color: var(--danger);
}
.fm-empty,
.fm-loading {
  padding: 30px;
  text-align: center;
  color: var(--text-secondary);
}
.fm-loading {
  position: absolute;
  top: 40%;
  left: 0;
  right: 0;
}
.fm-prompt-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.fm-prompt {
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 16px;
  width: 320px;
}
.fm-prompt-title {
  margin-bottom: 10px;
  color: var(--text-primary);
}
.fm-prompt-input {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  margin-bottom: 12px;
}
.fm-prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
