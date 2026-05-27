<template>
  <Modal 
    ref="connectionModal"
    :title="editingConnection ? t('connection.editTitle') : t('connection.addTitle')"
    :closeButton="{ text: t('common.cancel'), show: false }"
    :confirmButton="{ text: '', show: false }"
    :style="{ maxWidth: '700px', width: '100%' }"
    @onClose="handleModalClose"
  >
    <form @submit.prevent="saveConnection" class="connection-form">
      <!-- 基本信息 -->
      <div class="mb-3">
        <label class="form-label fw-bold"><i class="bi bi-tag me-1"></i>{{ t('connection.name') }} <span class="text-danger">*</span></label>
        <input type="text" class="form-control" v-model="form.name" :placeholder="t('connection.namePlaceholder')" required>
      </div>

      <!-- SSH 连接配置 -->
        <div class="row mb-3">
          <div class="col-8">
            <label class="form-label fw-bold"><i class="bi bi-server me-1"></i>{{ t('connection.host') }} <span class="text-danger">*</span></label>
            <input type="text" class="form-control" v-model="form.host" :placeholder="t('connection.hostPlaceholder')" :required="form.type === 'ssh'">
          </div>
          <div class="col-4">
            <label class="form-label fw-bold"><i class="bi bi-door-closed me-1"></i>{{ t('connection.port') }}</label>
            <input type="number" class="form-control" v-model.number="form.port" min="1" max="65535">
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label fw-bold"><i class="bi bi-person me-1"></i>{{ t('connection.username') }} <span class="text-danger">*</span></label>
          <input type="text" class="form-control" v-model="form.username" :placeholder="t('connection.usernamePlaceholder')" :required="form.type === 'ssh'">
        </div>

        <!-- 认证方式 -->
        <div class="mb-3">
          <label class="form-label fw-bold"><i class="bi bi-shield-lock me-1"></i>{{ t('connection.authType') }}</label>
          <div class="btn-group w-100" role="group">
            <input type="radio" class="btn-check" name="authType" id="auth-auto" value="auto" v-model="form.authType">
            <label class="btn btn-outline-primary" for="auth-auto"><i class="bi bi-magic me-1"></i>{{ t('connection.auto') }}</label>
            <input type="radio" class="btn-check" name="authType" id="auth-password" value="password" v-model="form.authType">
            <label class="btn btn-outline-primary" for="auth-password"><i class="bi bi-key me-1"></i>{{ t('connection.password') }}</label>
            <input type="radio" class="btn-check" name="authType" id="auth-key" value="privateKey" v-model="form.authType">
            <label class="btn btn-outline-primary" for="auth-key"><i class="bi bi-file-earmark-lock me-1"></i>{{ t('connection.privateKey') }}</label>
          </div>
          <small v-if="form.authType === 'auto'" class="form-text text-muted">
            <i class="bi bi-info-circle me-1"></i>{{ t('connection.autoHint') }}
          </small>
        </div>

        <!-- 密码认证 -->
        <div v-if="form.authType === 'password'" class="mb-3">
          <label class="form-label fw-bold">{{ t('connection.passwordLabel') }}</label>
          <input type="password" class="form-control" v-model="form.password" :placeholder="t('connection.passwordPlaceholder')">
        </div>

        <!-- 私钥认证 -->
        <div v-if="form.authType === 'privateKey'" class="mb-3">
          <label class="form-label fw-bold">{{ t('connection.privateKeyContent') }}</label>
          <textarea class="form-control" v-model="form.privateKey" rows="5" :placeholder="t('connection.privateKeyPlaceholder')"></textarea>
          <div class="mt-2">
            <label class="form-label">{{ t('connection.passphrase') }}</label>
            <input type="password" class="form-control" v-model="form.passphrase" :placeholder="t('connection.passphrasePlaceholder')">
          </div>
          <div class="mt-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" @click="loadPrivateKey">
              <i class="bi bi-folder-open me-1"></i>{{ t('connection.loadFromFile') }}
            </button>
          </div>
        </div>

      <!-- 终端配置 -->
      <div class="card mb-3">
        <div class="card-header" @click="showTerminalConfig = !showTerminalConfig" style="cursor: pointer;">
          <i class="bi bi-terminal me-1"></i>{{ t('connection.terminalConfig') }}
          <i :class="showTerminalConfig ? 'bi bi-chevron-up float-end' : 'bi bi-chevron-down float-end'"></i>
        </div>
        <div class="card-body" v-show="showTerminalConfig">
          <div class="row mb-2">
            <div class="col-6">
              <label class="form-label">{{ t('connection.fontSize') }}</label>
              <input type="number" class="form-control form-control-sm" v-model.number="form.terminal.fontSize" min="8" max="32">
            </div>
            <div class="col-6">
              <label class="form-label">{{ t('connection.cursorStyle') }}</label>
              <select class="form-select form-select-sm" v-model="form.terminal.cursorStyle">
                <option value="block">{{ t('connection.cursorBlock') }}</option>
                <option value="underline">{{ t('connection.cursorUnderline') }}</option>
                <option value="bar">{{ t('connection.cursorBar') }}</option>
              </select>
            </div>
          </div>
          <div class="row mb-2">
            <div class="col-6">
              <label class="form-label">{{ t('connection.theme') }}</label>
              <select class="form-select form-select-sm" v-model="form.terminal.theme">
                <option value="dark">{{ t('connection.themeDark') }}</option>
                <option value="light">{{ t('connection.themeLight') }}</option>
              </select>
            </div>
            <div class="col-6">
              <label class="form-label">{{ t('connection.fontFamily') }}</label>
              <input type="text" class="form-control form-control-sm" v-model="form.terminal.fontFamily" placeholder="字体">
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="d-flex justify-content-between">
        <button type="button" class="btn btn-outline-secondary" @click="testConn" :disabled="testing">
          <span v-if="testing" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="bi bi-plug me-1"></i>
          {{ testing ? t('connection.testing') : t('connection.testConnection') }}
        </button>
        <div>
          <button type="button" class="btn btn-secondary me-2" @click="close">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
            {{ saving ? t('connection.saving') : t('common.save') }}
          </button>
        </div>
      </div>
    </form>
  </Modal>
</template>

<script lang="ts" setup>
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import Modal from '@/components/modal/index.vue';
import { ConnectionService } from '@/service/connection';
import { toast } from '@/utils/toast';

const { t } = useI18n();

const connectionModal = ref();
const editingConnection = ref<string | null>(null);
const showTerminalConfig = ref(false);
const testing = ref(false);
const saving = ref(false);

const defaultForm = () => ({
  name: '',
  type: 'ssh' as 'ssh',
  host: '',
  port: 22,
  username: 'root',
  authType: 'auto' as 'auto' | 'password' | 'privateKey',
  password: '',
  privateKey: '',
  passphrase: '',
  terminal: {
    cols: 80, rows: 24, fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: 'dark',
    cursorStyle: 'block' as 'block' | 'underline' | 'bar',
  },
  options: {},
  enabled: true,
});

const form = reactive(defaultForm());

const connectionService = new ConnectionService();

function open(connection?: any) {
  if (connection) {
    editingConnection.value = connection.id;
    Object.assign(form, defaultForm(), connection);
  } else {
    editingConnection.value = null;
    Object.assign(form, defaultForm());
  }
  connectionModal.value?.show();
}

function close() {
  connectionModal.value?.hide();
}

function handleModalClose() {
  editingConnection.value = null;
}

async function saveConnection() {
  if (!form.name) {
    toast.warning(t('connection.nameRequired'));
    return;
  }
  if (!form.host || !form.username) {
    toast.warning(t('connection.hostUsernameRequired'));
    return;
  }
  saving.value = true;
  try {
    if (editingConnection.value) {
      await connectionService.updateConnection(editingConnection.value, { ...form });
    } else {
      await connectionService.addConnection({ ...form } as any);
    }
    toast.success(t('connection.saveSuccess'));
    close();
    emit('saved');
  } catch (e: any) {
    toast.error(e.message || t('connection.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function testConn() {
  if (!form.host || !form.username) {
    toast.warning(t('connection.hostUsernameTestRequired'));
    return;
  }
  testing.value = true;
  try {
    const result = await connectionService.testConnection({ ...form } as any);
    if (result) toast.success(t('connection.testSuccess'));
    else toast.error(t('connection.testFailed'));
  } catch (e: any) {
    toast.error(e.message || t('connection.testError'));
  } finally {
    testing.value = false;
  }
}

async function loadPrivateKey() {
  // 浏览器环境：创建隐藏的 file input 触发文件选择
  const chooser = document.createElement('input');
  chooser.type = 'file';
  chooser.accept = '.pem,.key,.pub,.rsa';
  chooser.style.display = 'none';
  chooser.addEventListener('change', async () => {
    if (chooser.files?.length) {
      try {
        const text = await (chooser.files[0] as File).text();
        form.privateKey = text;
        toast.success(t('connection.privateKeyLoaded'));
      } catch (e: any) {
        toast.error(e.message || t('connection.privateKeyLoadFailed'));
      }
    }
  });
  document.body.appendChild(chooser);
  chooser.click();
  // 清理 DOM
  setTimeout(() => {
    if (chooser.parentNode) document.body.removeChild(chooser);
  }, 0);
}

const emit = defineEmits(['saved']);

defineExpose({ open, close });
</script>

<style scoped>
.connection-form { padding: 0.5rem; }
.card-header { user-select: none; }
</style>
