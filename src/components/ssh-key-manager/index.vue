<template>
  <div v-if="visible" class="skm-overlay" @click.self="close">
    <div class="skm-modal">
      <div class="skm-header">
        <h5 class="mb-0"><i class="bi bi-key me-2"></i>{{ t('sshKey.title') }}</h5>
        <button class="btn-close-modal" @click="close"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="skm-body">
        <ul class="nav nav-tabs mb-3">
          <li class="nav-item">
            <button class="nav-link" :class="{ active: tab === 'list' }" @click="tab = 'list'">{{ t('sshKey.tabList') }}</button>
          </li>
          <li class="nav-item">
            <button class="nav-link" :class="{ active: tab === 'generate' }" @click="tab = 'generate'">{{ t('sshKey.tabGenerate') }}</button>
          </li>
          <li class="nav-item">
            <button class="nav-link" :class="{ active: tab === 'import' }" @click="tab = 'import'">{{ t('sshKey.tabImport') }}</button>
          </li>
        </ul>

        <!-- 密钥列表 -->
        <div v-if="tab === 'list'">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <small class="text-muted">{{ t('sshKey.listHint') }}</small>
            <button class="btn btn-sm btn-outline-secondary" @click="load" :disabled="loading">
              <i class="bi bi-arrow-clockwise me-1"></i>{{ t('sshKey.refresh') }}
            </button>
          </div>
          <div v-if="loading && !keys.length" class="text-center text-muted py-4">
            <span class="spinner-border spinner-border-sm me-2"></span>{{ t('sshKey.loading') }}
          </div>
          <div v-else-if="!keys.length" class="text-center text-muted py-4">
            <i class="bi bi-key d-block fs-1 mb-2"></i>{{ t('sshKey.empty') }}
          </div>
          <div v-for="key in keys" :key="key.id" class="card mb-2">
            <div class="card-body p-2">
              <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1">
                  <div class="fw-bold">
                    <i class="bi bi-shield-lock me-1"></i>{{ key.name }}
                    <span class="badge bg-secondary ms-1">{{ key.type.toUpperCase() }}</span>
                    <span v-if="key.hasPassphrase" class="badge bg-warning text-dark ms-1">{{ t('sshKey.passphraseProtected') }}</span>
                  </div>
                  <div class="small text-muted mt-1">{{ key.fingerprint }}</div>
                  <div class="small text-muted text-truncate" style="max-width: 560px;" :title="key.publicKey">{{ key.publicKey }}</div>
                </div>
                <div class="d-flex flex-wrap gap-1 ms-2 justify-content-end">
                  <button class="btn btn-sm btn-outline-primary" @click="copyPublic(key)" :title="t('sshKey.copyPublic')">
                    <i class="bi bi-clipboard"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-success" @click="openDistribute(key)" :title="t('sshKey.distribute')">
                    <i class="bi bi-send"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-info" @click="usePrivateKey(key)" :title="t('sshKey.useInConnection')">
                    <i class="bi bi-box-arrow-in-right"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger" @click="remove(key)" :title="t('common.delete')">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 生成密钥 -->
        <form v-if="tab === 'generate'" @submit.prevent="generate">
          <div class="mb-2">
            <label class="form-label">{{ t('sshKey.name') }} <span class="text-danger">*</span></label>
            <input type="text" class="form-control form-control-sm" v-model="genForm.name" required>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-md-6">
              <label class="form-label">{{ t('sshKey.type') }}</label>
              <select class="form-select form-select-sm" v-model="genForm.type">
                <option value="ed25519">ED25519</option>
                <option value="rsa">RSA</option>
              </select>
            </div>
            <div class="col-md-6" v-if="genForm.type === 'rsa'">
              <label class="form-label">{{ t('sshKey.bits') }}</label>
              <select class="form-select form-select-sm" v-model.number="genForm.bits">
                <option :value="2048">2048</option>
                <option :value="4096">4096</option>
                <option :value="8192">8192</option>
              </select>
            </div>
          </div>
          <div class="mb-2">
            <label class="form-label">{{ t('sshKey.comment') }}</label>
            <input type="text" class="form-control form-control-sm" v-model="genForm.comment" placeholder="user@host">
          </div>
          <div class="mb-2">
            <label class="form-label">{{ t('sshKey.passphrase') }}</label>
            <input type="password" class="form-control form-control-sm" v-model="genForm.passphrase" :placeholder="t('sshKey.passphraseHint')">
          </div>
          <small class="form-text text-muted d-block mb-2"><i class="bi bi-info-circle me-1"></i>{{ t('sshKey.generateHint') }}</small>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="busy">
            <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>
            {{ t('sshKey.generate') }}
          </button>
        </form>

        <!-- 导入私钥 -->
        <form v-if="tab === 'import'" @submit.prevent="importKey">
          <div class="mb-2">
            <label class="form-label">{{ t('sshKey.name') }} <span class="text-danger">*</span></label>
            <input type="text" class="form-control form-control-sm" v-model="impForm.name" required>
          </div>
          <div class="mb-2">
            <label class="form-label">{{ t('sshKey.privateKeyContent') }} <span class="text-danger">*</span></label>
            <textarea class="form-control form-control-sm" v-model="impForm.privateKey" rows="6" required :placeholder="t('sshKey.privateKeyPlaceholder')"></textarea>
            <button type="button" class="btn btn-sm btn-outline-secondary mt-1" @click="loadPrivateFile">
              <i class="bi bi-folder-open me-1"></i>{{ t('sshKey.loadFromFile') }}
            </button>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-md-6">
              <label class="form-label">{{ t('sshKey.passphrase') }}</label>
              <input type="password" class="form-control form-control-sm" v-model="impForm.passphrase" :placeholder="t('sshKey.passphraseHint')">
            </div>
            <div class="col-md-6">
              <label class="form-label">{{ t('sshKey.publicKeyOptional') }}</label>
              <input type="text" class="form-control form-control-sm" v-model="impForm.publicKey" placeholder="ssh-ed25519 AAAA...">
            </div>
          </div>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="busy">
            <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>
            {{ t('sshKey.import') }}
          </button>
        </form>

        <!-- 分发公钥 -->
        <form v-if="tab === 'distribute' && distributeKey" @submit.prevent="distribute">
          <p class="small text-muted">{{ t('sshKey.distributeHint') }}: <strong>{{ distributeKey.name }}</strong></p>
          <div class="mb-2">
            <label class="form-label">{{ t('sshKey.targetConnection') }}</label>
            <select class="form-select form-select-sm" v-model="distForm.connectionId">
              <option value="">{{ t('sshKey.selectConnection') }}</option>
              <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }} ({{ c.host }})</option>
            </select>
            <small class="form-text text-muted">{{ t('sshKey.targetHint') }}</small>
          </div>
          <div class="mb-2" v-if="!distForm.connectionId">
            <div class="row g-2">
              <div class="col-md-5">
                <input type="text" class="form-control form-control-sm" v-model="distForm.host" :placeholder="t('connection.host')">
              </div>
              <div class="col-md-2">
                <input type="number" class="form-control form-control-sm" v-model.number="distForm.port" placeholder="22">
              </div>
              <div class="col-md-5">
                <input type="text" class="form-control form-control-sm" v-model="distForm.username" :placeholder="t('connection.username')">
              </div>
            </div>
            <input type="password" class="form-control form-control-sm mt-2" v-model="distForm.password" :placeholder="t('connection.passwordLabel')">
            <select class="form-select form-select-sm mt-2" v-model="distForm.platform">
              <option value="unix">Linux / macOS</option>
              <option value="windows">Windows</option>
            </select>
          </div>
          <div class="mb-2">
            <label class="form-label">{{ t('sshKey.remotePath') }}</label>
            <input type="text" class="form-control form-control-sm" v-model="distForm.remotePath" placeholder="~/.ssh/authorized_keys">
          </div>
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-sm btn-success" :disabled="busy">
              <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>
              {{ t('sshKey.distribute') }}
            </button>
            <button type="button" class="btn btn-sm btn-secondary" @click="tab = 'list'">{{ t('common.cancel') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { sshKeyService, type ManagedKey } from '@/service/ssh-key';
import { ConnectionService } from '@/service/connection';
import type { ConnectionEntity } from '@/typings/connection';
import { toast } from '@/utils/toast';

const { t } = useI18n();
const props = defineProps<{ embedded?: boolean }>();
const emit = defineEmits(['use-key', 'changed']);

const visible = ref(false);
const tab = ref<'list' | 'generate' | 'import' | 'distribute'>('list');
const loading = ref(false);
const busy = ref(false);
const keys = ref<ManagedKey[]>([]);
const connections = ref<ConnectionEntity[]>([]);
const distributeKey = ref<ManagedKey | null>(null);

const genForm = reactive({ name: '', type: 'ed25519' as 'ed25519' | 'rsa', bits: 4096, comment: '', passphrase: '' });
const impForm = reactive({ name: '', privateKey: '', passphrase: '', publicKey: '' });
const distForm = reactive({ connectionId: '', host: '', port: 22, username: 'root', password: '', platform: 'unix', remotePath: '' });

const connectionService = new ConnectionService();

function open() {
  visible.value = true;
  tab.value = 'list';
  load();
  connectionService.getAllConnections().then((res: any) => {
    connections.value = Array.isArray(res) ? res : (res?.data || []);
  }).catch(() => {});
}
function close() { visible.value = false; }
defineExpose({ open, close });

async function load() {
  loading.value = true;
  try {
    keys.value = await sshKeyService.list();
  } catch (e: any) {
    toast.error(e.message || t('sshKey.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function generate() {
  busy.value = true;
  try {
    const key = await sshKeyService.generate({ ...genForm });
    toast.success(t('sshKey.generated'));
    Object.assign(genForm, { name: '', comment: '', passphrase: '' });
    await load();
    emit('changed', key);
    tab.value = 'list';
  } catch (e: any) {
    toast.error(e.message || t('sshKey.generateFailed'));
  } finally {
    busy.value = false;
  }
}

async function importKey() {
  busy.value = true;
  try {
    const key = await sshKeyService.import({ ...impForm });
    toast.success(t('sshKey.imported'));
    Object.assign(impForm, { name: '', privateKey: '', passphrase: '', publicKey: '' });
    await load();
    emit('changed', key);
    tab.value = 'list';
  } catch (e: any) {
    toast.error(e.message || t('sshKey.importFailed'));
  } finally {
    busy.value = false;
  }
}

function loadPrivateFile() {
  const chooser = document.createElement('input');
  chooser.type = 'file';
  chooser.accept = '.pem,.key,.rsa,.ed25519';
  chooser.style.display = 'none';
  chooser.addEventListener('change', async () => {
    if (chooser.files?.length) {
      try {
        impForm.privateKey = await chooser.files[0].text();
        toast.success(t('connection.privateKeyLoaded'));
      } catch (e: any) {
        toast.error(e.message || t('connection.privateKeyLoadFailed'));
      }
    }
  });
  document.body.appendChild(chooser);
  chooser.click();
  setTimeout(() => { if (chooser.parentNode) document.body.removeChild(chooser); }, 0);
}

async function copyPublic(key: ManagedKey) {
  try {
    await navigator.clipboard.writeText(key.publicKey);
    toast.success(t('sshKey.copied'));
  } catch (_) {
    toast.info(key.publicKey);
  }
}

async function usePrivateKey(key: ManagedKey) {
  try {
    const result = await sshKeyService.getPrivateKey(key.id);
    emit('use-key', { privateKey: result.privateKey, name: key.name, comment: result.comment });
    toast.success(t('sshKey.useSuccess'));
    close();
  } catch (e: any) {
    toast.error(e.message || t('sshKey.loadFailed'));
  }
}

function openDistribute(key: ManagedKey) {
  distributeKey.value = key;
  distForm.connectionId = '';
  distForm.host = '';
  distForm.port = 22;
  distForm.username = 'root';
  distForm.password = '';
  distForm.platform = 'unix';
  distForm.remotePath = '';
  tab.value = 'distribute';
}

async function distribute() {
  if (!distributeKey.value) return;
  if (!distForm.connectionId && (!distForm.host || !distForm.username)) {
    toast.warning(t('sshKey.targetRequired'));
    return;
  }
  busy.value = true;
  try {
    const payload: any = {
      keyId: distributeKey.value.id,
      remotePath: distForm.remotePath || undefined,
    };
    if (distForm.connectionId) {
      payload.connectionId = distForm.connectionId;
    } else {
      payload.connection = {
        host: distForm.host,
        port: distForm.port || 22,
        username: distForm.username,
        authType: 'password',
        password: distForm.password,
        platform: distForm.platform === 'windows' ? 'windows' : 'linux',
        type: 'ssh',
        options: {},
      };
    }
    const result = await sshKeyService.distribute(payload);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    tab.value = 'list';
  } catch (e: any) {
    toast.error(e.message || t('sshKey.distributeFailed'));
  } finally {
    busy.value = false;
  }
}

async function remove(key: ManagedKey) {
  try {
    await sshKeyService.delete(key.id);
    toast.success(t('sshKey.deleted'));
    await load();
    emit('changed', key);
  } catch (e: any) {
    toast.error(e.message || t('sshKey.deleteFailed'));
  }
}
</script>

<style scoped>
.skm-overlay {
  position: fixed; inset: 0; z-index: 1060;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
}
.skm-modal {
  width: min(700px, 92vw); max-height: 85vh;
  display: flex; flex-direction: column;
  background: var(--bg-primary, #fff); color: var(--text-primary, #212529);
  border-radius: 10px; overflow: hidden;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35);
}
.skm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border-color, #dee2e6);
}
.skm-body { padding: 16px 18px; overflow-y: auto; }
.btn-close-modal {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: var(--text-secondary, #6c757d);
}
</style>
