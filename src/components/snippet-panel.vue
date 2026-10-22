<template>
  <div class="snippet-panel-inner">
    <div class="snippet-header">
      <span class="snippet-title"><i class="bi bi-lightning-charge-fill"></i> {{ t('snippet.title') }}</span>
      <div class="snippet-header-actions">
        <button class="snippet-icon-btn" :title="t('snippet.add')" @click="openAdd">
          <i class="bi bi-plus-lg"></i>
        </button>
        <button class="snippet-icon-btn" :title="t('common.close')" @click="emit('close')">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </div>

    <!-- 新增/编辑表单 -->
    <div v-if="showForm" class="snippet-form">
      <input
        v-model="form.name"
        class="snippet-input"
        type="text"
        :placeholder="t('snippet.namePlaceholder')"
        @keydown.enter.prevent="saveSnippet"
      />
      <textarea
        v-model="form.command"
        class="snippet-input snippet-cmd-input"
        rows="3"
        :placeholder="t('snippet.cmdPlaceholder')"
      ></textarea>
      <div class="snippet-form-actions">
        <button class="snippet-text-btn snippet-save-btn" :disabled="!canSave" @click="saveSnippet">
          {{ editingId ? t('snippet.save') : t('snippet.add') }}
        </button>
        <button class="snippet-text-btn" @click="cancelForm">{{ t('snippet.cancel') }}</button>
      </div>
    </div>

    <!-- 片段列表 -->
    <div class="snippet-list">
      <div v-for="s in snippets" :key="s.id" class="snippet-item">
        <div class="snippet-item-main" :title="t('snippet.run')" @click="emit('run', s.command)">
          <div class="snippet-item-name">{{ s.name }}</div>
          <div class="snippet-item-cmd">{{ s.command }}</div>
        </div>
        <div class="snippet-item-actions">
          <button class="snippet-icon-btn" :title="t('snippet.copy')" @click.stop="copySnippet(s)">
            <i class="bi bi-copy"></i>
          </button>
          <button class="snippet-icon-btn" :title="t('snippet.edit')" @click.stop="editSnippet(s)">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="snippet-icon-btn snippet-del-btn" :title="t('snippet.delete')" @click.stop="removeSnippet(s.id)">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
      <div v-if="snippets.length === 0 && !showForm" class="snippet-empty">
        {{ t('snippet.empty') }}
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const emit = defineEmits<{
  (e: 'run', command: string): void;
  (e: 'close'): void;
}>();

interface Snippet {
  id: string;
  name: string;
  command: string;
}

const STORAGE_KEY = 'aicmd-snippets-v1';

function loadFromStorage(): Snippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(s => s?.name && s?.command) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets.value));
  } catch {
    /* 存储失败忽略 */
  }
}

const snippets = ref<Snippet[]>(loadFromStorage());
const showForm = ref(false);
const editingId = ref<string | null>(null);
const form = ref({ name: '', command: '' });

const canSave = computed(() => form.value.name.trim() !== '' && form.value.command.trim() !== '');

function genId(): string {
  return (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function openAdd() {
  editingId.value = null;
  form.value = { name: '', command: '' };
  showForm.value = true;
}

function editSnippet(s: Snippet) {
  editingId.value = s.id;
  form.value = { name: s.name, command: s.command };
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
  form.value = { name: '', command: '' };
}

function saveSnippet() {
  const name = form.value.name.trim();
  const command = form.value.command.trim();
  if (!name || !command) return;
  if (editingId.value) {
    const target = snippets.value.find(s => s.id === editingId.value);
    if (target) {
      target.name = name;
      target.command = command;
    }
  } else {
    snippets.value.unshift({ id: genId(), name, command });
  }
  persist();
  cancelForm();
}

function removeSnippet(id: string) {
  snippets.value = snippets.value.filter(s => s.id !== id);
  persist();
}

async function copySnippet(s: Snippet) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s.command);
    }
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
.snippet-panel-inner {
  display: flex;
  flex-direction: column;
  max-height: 100%;
  overflow: hidden;
}

.snippet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.snippet-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}
.snippet-title i { color: var(--accent); font-size: 12px; }

.snippet-header-actions,
.snippet-item-actions,
.snippet-form-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.snippet-icon-btn {
  background: none;
  border: none;
  padding: 4px 7px;
  border-radius: 5px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.snippet-icon-btn:hover {
  background: rgb(var(--overlay-rgb) / 10%);
  color: var(--text-primary);
}
.snippet-del-btn:hover {
  color: var(--danger);
  background: rgb(var(--danger-rgb) / 10%);
}

.snippet-form {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.snippet-input {
  width: 100%;
  background: var(--bg-input, rgb(var(--bg-input-rgb)));
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}
.snippet-input:focus { border-color: var(--accent); }
.snippet-cmd-input {
  font-family: 'JetBrains Mono', monospace;
  resize: vertical;
}

.snippet-form-actions {
  justify-content: flex-end;
  gap: 8px;
}

.snippet-text-btn {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.snippet-text-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.snippet-text-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.snippet-save-btn {
  border-color: var(--accent);
  color: var(--accent);
  background: rgb(var(--accent-rgb) / 8%);
}

.snippet-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.snippet-item {
  display: flex;
  align-items: stretch;
  gap: 4px;
  border-radius: 8px;
  transition: background 0.15s;
}
.snippet-item:hover { background: rgb(var(--overlay-rgb) / 6%); }

.snippet-item-main {
  flex: 1;
  min-width: 0;
  padding: 7px 8px;
  cursor: pointer;
  border-radius: 8px;
}
.snippet-item-main:hover { background: rgb(var(--overlay-rgb) / 8%); }

.snippet-item-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snippet-item-cmd {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.snippet-item-actions {
  align-self: center;
  flex-shrink: 0;
}

.snippet-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
