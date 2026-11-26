<template>
  <Modal 
    ref="connectionModal"
    :title="editingConnection ? t('connection.editTitle') : t('connection.addTitle')"
    :closeButton="{ text: t('common.cancel'), show: false }"
    :confirmButton="{ text: '', show: false }"
    :dialogStyle="{ maxWidth: '700px', width: '100%' }"
    :embedded="embedded"
    @onClose="handleModalClose"
  >
    <form @submit.prevent="saveConnection" class="connection-form">
      <!-- 基本信息 -->
      <div class="mb-3">
        <label class="form-label fw-bold"><i class="bi bi-tag me-1"></i>{{ t('connection.name') }} <span class="text-danger">*</span></label>
        <input type="text" class="form-control" v-model="form.name" :placeholder="t('connection.namePlaceholder')" required>
      </div>

      <!-- 连接类型 -->
      <div class="mb-3">
        <label class="form-label fw-bold"><i class="bi bi-diagram-3 me-1"></i>{{ t('connection.connType') }}</label>
        <div class="btn-group w-100" role="group">
          <input type="radio" class="btn-check" name="connType" id="type-ssh" value="ssh" v-model="form.type">
          <label class="btn btn-outline-primary" for="type-ssh"><i class="bi bi-terminal me-1"></i>{{ t('connection.typeSsh') }}</label>
          <input type="radio" class="btn-check" name="connType" id="type-rdp" value="rdp" v-model="form.type">
          <label class="btn btn-outline-primary" for="type-rdp"><i class="bi bi-display me-1"></i>{{ t('connection.typeRdp') }}</label>
        </div>
      </div>

      <!-- SSH / RDP 连接配置 -->
        <div class="row mb-3">
          <div class="col-8">
            <label class="form-label fw-bold"><i class="bi bi-server me-1"></i>{{ t('connection.host') }} <span class="text-danger">*</span></label>
            <input type="text" class="form-control" v-model="form.host" :placeholder="t('connection.hostPlaceholder')" :required="form.type !== 'local'">
          </div>
          <div class="col-4">
            <label class="form-label fw-bold"><i class="bi bi-door-closed me-1"></i>{{ t('connection.port') }}</label>
            <input type="number" class="form-control" v-model.number="form.port" min="1" max="65535">
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label fw-bold"><i class="bi bi-person me-1"></i>{{ t('connection.username') }} <span class="text-danger">*</span></label>
          <input type="text" class="form-control" v-model="form.username" :placeholder="t('connection.usernamePlaceholder')" :required="form.type !== 'local'">
        </div>

        <!-- 认证方式（RDP 固定用密码，此处仅 SSH 显示） -->
        <div class="mb-3" v-if="form.type === 'ssh'">
          <label class="form-label fw-bold"><i class="bi bi-shield-lock me-1"></i>{{ t('connection.authType') }}</label>
          <div class="btn-group w-100" role="group">
            <input type="radio" class="btn-check" name="authType" id="auth-auto" value="auto" v-model="form.authType">
            <label class="btn btn-outline-primary" for="auth-auto" :title="t('connection.autoHint')"><i class="bi bi-magic me-1"></i>{{ t('connection.auto') }}</label>
            <input type="radio" class="btn-check" name="authType" id="auth-password" value="password" v-model="form.authType">
            <label class="btn btn-outline-primary" for="auth-password"><i class="bi bi-key me-1"></i>{{ t('connection.password') }}</label>
            <input type="radio" class="btn-check" name="authType" id="auth-key" value="privateKey" v-model="form.authType">
            <label class="btn btn-outline-primary" for="auth-key"><i class="bi bi-file-earmark-lock me-1"></i>{{ t('connection.privateKey') }}</label>
          </div>
        </div>

        <!-- 密码认证（SSH password 模式 或 RDP 固定） -->
        <div v-if="isRdp || form.authType === 'password'" class="mb-3">
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
          <div class="mt-2 d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" @click="loadPrivateKey">
              <i class="bi bi-folder-open me-1"></i>{{ t('connection.loadFromFile') }}
            </button>
            <button type="button" class="btn btn-sm btn-outline-info" @click="openKeyManager">
              <i class="bi bi-key me-1"></i>{{ t('sshKey.title') }}
            </button>
          </div>
        </div>

      <!-- 整理与归类（可选，侧栏树使用） -->
      <div class="card mb-3">
        <div class="card-header" @click="showGroupTags = !showGroupTags" style="cursor: pointer;">
          <i class="bi bi-collection me-1"></i>{{ t('connection.groupTags') }}
          <span v-if="form.group || tagsText" class="badge bg-secondary ms-2"><i class="bi bi-check2"></i></span>
          <i :class="showGroupTags ? 'bi bi-chevron-up float-end' : 'bi bi-chevron-down float-end'"></i>
        </div>
        <div class="card-body" v-show="showGroupTags">
          <div class="row g-2">
            <div class="col-md-6">
              <label class="form-label">{{ t('connection.group') }}</label>
              <input type="text" class="form-control form-control-sm" v-model="form.group" :list="groupListId" :placeholder="t('connection.groupPlaceholder')">
              <datalist :id="groupListId">
                <option v-for="g in existingGroups" :key="g" :value="g"></option>
              </datalist>
            </div>
            <div class="col-md-6">
              <label class="form-label">{{ t('connection.tags') }}</label>
              <input type="text" class="form-control form-control-sm" v-model="tagsText" :placeholder="t('connection.tagsPlaceholder')">
            </div>
          </div>
        </div>
      </div>

      <!-- 高级选项（可选）：目标平台 / RDP 窗格等 -->
      <div class="card mb-3">
        <div class="card-header" @click="showAdvanced = !showAdvanced" style="cursor: pointer;">
          <i class="bi bi-sliders2 me-1"></i>{{ t('connection.advancedOptions') }}
          <span v-if="hasAdvanced" class="badge bg-secondary ms-2"><i class="bi bi-check2"></i></span>
          <i :class="showAdvanced ? 'bi bi-chevron-up float-end' : 'bi bi-chevron-down float-end'"></i>
        </div>
        <div class="card-body" v-show="showAdvanced">
          <div v-if="form.type === 'ssh'" class="mb-3">
            <label class="form-label"><i class="bi bi-cpu me-1"></i>{{ t('connection.platform') }}</label>
            <select class="form-select form-select-sm" v-model="form.platform">
              <option value="auto">{{ t('connection.platformAuto') }}</option>
              <option value="linux">{{ t('connection.platformLinux') }}</option>
              <option value="macos">{{ t('connection.platformMacos') }}</option>
              <option value="windows">{{ t('connection.platformWindows') }}</option>
            </select>
            <small class="form-text text-muted d-block"><i class="bi bi-info-circle me-1"></i>{{ t('connection.platformHint') }}</small>
          </div>
          <div v-if="form.type === 'rdp'">
            <div class="fw-bold mb-2"><i class="bi bi-display me-1"></i>{{ t('connection.rdpSettings') }}</div>
            <div class="row g-2">
              <div class="col-md-6">
                <label class="form-label">{{ t('connection.rdpDomain') }}</label>
                <input type="text" class="form-control form-control-sm" v-model="rdpOptions.domain" :placeholder="t('connection.rdpDomainPlaceholder')">
              </div>
              <div class="col-md-3">
                <label class="form-label">{{ t('connection.rdpWidth') }}</label>
                <input type="number" class="form-control form-control-sm" v-model.number="rdpOptions.width" min="640" max="4096">
              </div>
              <div class="col-md-3">
                <label class="form-label">{{ t('connection.rdpHeight') }}</label>
                <input type="number" class="form-control form-control-sm" v-model.number="rdpOptions.height" min="480" max="2160">
              </div>
            </div>
            <small class="form-text text-muted d-block mt-2"><i class="bi bi-info-circle me-1"></i>{{ t('connection.rdpHint') }}</small>
          </div>
        </div>
      </div>

      <!-- 连接后自动执行脚本（SSH 专用） -->
      <div class="card mb-3" v-if="form.type === 'ssh'">
        <div class="card-header" @click="showStartupScript = !showStartupScript" style="cursor: pointer;">
          <i class="bi bi-lightning-charge me-1"></i>{{ t('connection.startupScript') }}
          <i :class="showStartupScript ? 'bi bi-chevron-up float-end' : 'bi bi-chevron-down float-end'"></i>
        </div>
        <div class="card-body" v-show="showStartupScript">
          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" v-model="form.forwardAgent" id="forwardAgent">
            <label class="form-check-label" for="forwardAgent">
              <i class="bi bi-arrow-repeat me-1"></i>{{ t('connection.forwardAgent') }}
            </label>
            <small class="form-text text-muted d-block">
              <i class="bi bi-info-circle me-1"></i>{{ t('connection.forwardAgentHint') }}
            </small>
          </div>
          <textarea class="form-control" v-model="form.startupScript" rows="3" :placeholder="t('connection.startupScriptPlaceholder')"></textarea>
          <small class="form-text text-muted mt-1 d-block">
            <i class="bi bi-info-circle me-1"></i>{{ t('connection.startupScriptHint') }}
          </small>
        </div>
      </div>

      <!-- 端口转发（SSH 专用） -->
      <div class="card mb-3" v-if="form.type === 'ssh'">
        <div class="card-header" @click="showPortForwards = !showPortForwards" style="cursor: pointer;">
          <i class="bi bi-arrow-left-right me-1"></i>{{ t('connection.portForwards') }}
          <span v-if="portForwards.length" class="badge bg-secondary ms-2">{{ portForwards.length }}</span>
          <i :class="showPortForwards ? 'bi bi-chevron-up float-end' : 'bi bi-chevron-down float-end'"></i>
        </div>
        <div class="card-body" v-show="showPortForwards">
          <small class="form-text text-muted d-block mb-2">
            <i class="bi bi-info-circle me-1"></i>{{ t('connection.portForwardsHint') }}
          </small>
          <div v-if="!portForwards.length" class="text-muted small mb-2">{{ t('connection.portForwardsEmpty') }}</div>
          <div v-for="(rule, idx) in portForwards" :key="rule.id" class="border rounded p-2 mb-2">
            <div class="row g-2 align-items-end">
              <div class="col-md-3">
                <label class="form-label small mb-1">{{ t('connection.pfDirection') }}</label>
                <select class="form-select form-select-sm" v-model="rule.direction">
                  <option value="local">{{ t('connection.pfLocal') }}</option>
                  <option value="remote">{{ t('connection.pfRemote') }}</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1">{{ t('connection.pfName') }}</label>
                <input type="text" class="form-control form-control-sm" v-model="rule.name" :placeholder="t('connection.pfNamePlaceholder')">
              </div>
              <div class="col-md-2">
                <label class="form-label small mb-1">{{ t('connection.pfEnabled') }}</label>
                <div class="form-check form-switch mt-1">
                  <input class="form-check-input" type="checkbox" v-model="rule.enabled">
                </div>
              </div>
              <div class="col-md-2">
                <label class="form-label small mb-1 text-nowrap" :title="t('connection.pfAutoStartHint')">{{ t('connection.pfAutoStart') }}</label>
                <div class="form-check form-switch mt-1">
                  <input class="form-check-input" type="checkbox" v-model="rule.autoStart">
                </div>
              </div>
              <div class="col-md-1 text-end">
                <button type="button" class="btn btn-sm btn-outline-danger" @click="removePortForward(idx)" :title="t('common.delete')">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
            <div class="row g-2 mt-1">
              <div class="col-md-3">
                <label class="form-label small mb-1 text-nowrap">{{ pfFieldLabel(rule.direction, 'listenHost') }}</label>
                <input type="text" class="form-control form-control-sm" v-model="rule.listenHost" placeholder="127.0.0.1">
              </div>
              <div class="col-md-3">
                <label class="form-label small mb-1 text-nowrap">{{ pfFieldLabel(rule.direction, 'listenPort') }}</label>
                <input type="number" class="form-control form-control-sm" v-model.number="rule.listenPort" min="1" max="65535">
              </div>
              <div class="col-md-3">
                <label class="form-label small mb-1 text-nowrap">{{ pfFieldLabel(rule.direction, 'targetHost') }}</label>
                <input type="text" class="form-control form-control-sm" v-model="rule.targetHost" placeholder="127.0.0.1">
              </div>
              <div class="col-md-3">
                <label class="form-label small mb-1 text-nowrap">{{ pfFieldLabel(rule.direction, 'targetPort') }}</label>
                <input type="number" class="form-control form-control-sm" v-model.number="rule.targetPort" min="1" max="65535">
              </div>
            </div>
            <div class="form-text small mt-1">
              <i class="bi bi-arrow-right me-1"></i>
              {{ t('connection.pfMapping', {
                from: rule.direction === 'remote'
                  ? `${rule.listenHost || '127.0.0.1'}:${rule.listenPort}`
                  : `${t('connection.pfLocalShort')} ${rule.listenHost || '127.0.0.1'}:${rule.listenPort}`,
                to: rule.direction === 'remote'
                  ? `${t('connection.pfLocalShort')} ${rule.targetHost || '127.0.0.1'}:${rule.targetPort}`
                  : `${t('connection.pfRemoteShort')} ${rule.targetHost || '127.0.0.1'}:${rule.targetPort}`
              }) }}
            </div>
            <div v-if="rule.direction === 'remote' && (!rule.listenHost || rule.listenHost === '127.0.0.1')" class="small text-warning mt-1">
              <i class="bi bi-exclamation-triangle me-1"></i>{{ t('connection.pfRemoteBindWarning') }}
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-outline-primary mt-1" @click="addPortForward">
            <i class="bi bi-plus me-1"></i>{{ t('connection.pfAdd') }}
          </button>
        </div>
      </div>

      <!-- 保活配置（SSH 专用） -->
      <div class="card mb-3" v-if="form.type === 'ssh'">
        <div class="card-header" @click="showKeepaliveConfig = !showKeepaliveConfig" style="cursor: pointer;">
          <i class="bi bi-heart-pulse me-1"></i>{{ t('connection.keepaliveConfig') }}
          <i :class="showKeepaliveConfig ? 'bi bi-chevron-up float-end' : 'bi bi-chevron-down float-end'"></i>
        </div>
        <div class="card-body" v-show="showKeepaliveConfig">
          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" v-model="keepaliveEnabled" id="keepaliveEnabled">
            <label class="form-check-label" for="keepaliveEnabled">
              <i class="bi bi-toggle-on me-1"></i>{{ t('connection.keepaliveEnabled') }}
            </label>
            <small class="form-text text-muted d-block">
              <i class="bi bi-info-circle me-1"></i>{{ t('connection.keepaliveEnabledHint') }}
            </small>
          </div>
          <div v-if="keepaliveEnabled" class="row mb-2">
            <div class="col-6">
              <label class="form-label">{{ t('connection.keepaliveInterval') }}</label>
              <input type="number" class="form-control form-control-sm" v-model.number="keepaliveInterval" min="1000" max="300000" :placeholder="t('connection.keepaliveIntervalPlaceholder')">
              <small class="form-text text-muted">{{ t('connection.keepaliveIntervalHint') }}</small>
            </div>
            <div class="col-6">
              <label class="form-label">{{ t('connection.keepaliveCountMax') }}</label>
              <input type="number" class="form-control form-control-sm" v-model.number="keepaliveCountMax" min="1" max="10" :placeholder="t('connection.keepaliveCountMaxPlaceholder')">
              <small class="form-text text-muted">{{ t('connection.keepaliveCountMaxHint') }}</small>
            </div>
          </div>
        </div>
      </div>

      <!-- 终端配置（SSH 专用） -->
      <div class="card mb-3" v-if="form.type === 'ssh'">
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

      <!-- 代理配置（SSH / RDP 通用），默认收起 -->
      <div class="card mb-3">
        <div class="card-header" @click="showProxyConfig = !showProxyConfig" style="cursor: pointer;">
          <i class="bi bi-shuffle me-1"></i>{{ t('connection.proxyConfig') }}
          <span v-if="proxyOptions.mode !== 'direct'" class="badge bg-secondary ms-2">{{ proxyModeLabel }}</span>
          <i :class="showProxyConfig ? 'bi bi-chevron-up float-end' : 'bi bi-chevron-down float-end'"></i>
        </div>
        <div class="card-body" v-show="showProxyConfig">
          <label class="form-label">{{ t('connection.proxyMode') }}</label>
          <select class="form-select form-select-sm" v-model="proxyOptions.mode">
            <option value="direct">{{ t('connection.proxyModeDirect') }}</option>
            <option value="system">{{ t('connection.proxyModeSystem') }}</option>
            <option value="custom">{{ t('connection.proxyModeCustom') }}</option>
          </select>
          <small class="form-text text-muted d-block">
            <i class="bi bi-info-circle me-1"></i>{{ t('connection.proxyModeHint') }}
          </small>

          <template v-if="proxyOptions.mode === 'custom'">
            <div class="row g-2 mt-2">
              <div class="col-md-8">
                <label class="form-label">{{ t('connection.proxyHost') }} <span class="text-danger">*</span></label>
                <input type="text" class="form-control form-control-sm" v-model="proxyOptions.host" :placeholder="t('connection.proxyHostPlaceholder')">
              </div>
              <div class="col-md-4">
                <label class="form-label">{{ t('connection.proxyPort') }}</label>
                <input type="number" class="form-control form-control-sm" v-model.number="proxyOptions.port" min="1" max="65535">
              </div>
            </div>
            <div class="row g-2 mt-2">
              <div class="col-md-6">
                <label class="form-label">{{ t('connection.proxyType') }}</label>
                <select class="form-select form-select-sm" v-model="proxyOptions.type">
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="socks4">SOCKS4</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">{{ t('connection.proxyUsername') }}</label>
                <input type="text" class="form-control form-control-sm" v-model="proxyOptions.username" autocomplete="off">
              </div>
            </div>
            <div class="mt-2" v-if="proxyOptions.type !== 'socks4'">
              <label class="form-label">{{ t('connection.proxyPassword') }}</label>
              <input type="password" class="form-control form-control-sm" v-model="proxyOptions.password" autocomplete="new-password">
            </div>
            <small class="form-text text-muted d-block mt-2">
              <i class="bi bi-info-circle me-1"></i>{{ t('connection.proxyCustomHint') }}
            </small>
          </template>
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
          <button type="button" class="btn btn-secondary me-2" @click="cancel">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
            {{ saving ? t('connection.saving') : t('common.save') }}
          </button>
        </div>
      </div>
    </form>
  </Modal>

  <SshKeyManager ref="keyManagerRef" @use-key="handleKeySelected" />
</template>

<script lang="ts" setup>
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import Modal from '@/components/modal/index.vue';
import SshKeyManager from '@/components/ssh-key-manager/index.vue';
import { ConnectionService } from '@/service/connection';
import { toast } from '@/utils/toast';

const { t } = useI18n();

const keyManagerRef = ref<InstanceType<typeof SshKeyManager>>();
function openKeyManager() {
  keyManagerRef.value?.open();
}
function handleKeySelected(payload: { privateKey: string; name: string; comment?: string }) {
  applyKey(payload.privateKey, payload.name);
}

const props = defineProps({
  embedded: { type: Boolean, default: false },
});

const connectionModal = ref();
const editingConnection = ref<string | null>(null);
const showTerminalConfig = ref(false);
const showStartupScript = ref(false);
const showPortForwards = ref(false);
const showKeepaliveConfig = ref(false);
const showProxyConfig = ref(false);
const showGroupTags = ref(false);
const showAdvanced = ref(false);
const testing = ref(false);
const saving = ref(false);

// 保活配置（从 form.options 中提取）
const keepaliveEnabled = ref(true);
const keepaliveInterval = ref(10000);
const keepaliveCountMax = ref(3);

const defaultForm = () => ({
  name: '',
  group: '',
  tags: [] as string[],
  type: 'ssh' as 'ssh' | 'rdp' | 'local',
  host: '',
  port: 22,
  username: 'root',
  platform: 'auto' as 'auto' | 'linux' | 'macos' | 'windows',
  authType: 'auto' as 'auto' | 'password' | 'privateKey',
  password: '',
  privateKey: '',
  passphrase: '',
  startupScript: '',
  forwardAgent: false,
  portForwards: [] as Array<{
    id: string;
    name: string;
    direction: 'local' | 'remote';
    listenHost: string;
    listenPort: number;
    targetHost: string;
    targetPort: number;
    autoStart: boolean;
    enabled?: boolean;
  }>,
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

/** 标签输入框：逗号 / 空格分隔，保存为字符串数组 */
const tagsText = computed({
  get: () => form.tags.join(', '),
  set: (value: string) => {
    form.tags = value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
  },
});

type ProxyMode = 'direct' | 'system' | 'custom';
type ProxyType = 'http' | 'https' | 'socks4' | 'socks5';

const defaultProxy = () => ({
  mode: 'system' as ProxyMode,
  type: 'http' as ProxyType,
  host: '',
  port: 8080,
  username: '',
  password: '',
});
const proxyOptions = reactive(defaultProxy());
const proxyModeLabel = computed(() => {
  if (proxyOptions.mode === 'system') return t('connection.proxyModeSystem');
  if (proxyOptions.mode === 'custom') return t('connection.proxyModeCustom');
  return '';
});

// 端口转发规则（独立于 form，保存时写回）
const portForwards = ref<Array<{
  id: string;
  name: string;
  direction: 'local' | 'remote';
  listenHost: string;
  listenPort: number;
  targetHost: string;
  targetPort: number;
  autoStart: boolean;
  enabled?: boolean;
}>>([]);

function normalizePortForwards(rules: any): typeof portForwards.value {
  if (!Array.isArray(rules)) return [];
  return rules.map(r => ({
    id: String(r.id || `pf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
    name: String(r.name || ''),
    direction: r.direction === 'remote' ? 'remote' as const : 'local' as const,
    listenHost: String(r.listenHost || '127.0.0.1'),
    listenPort: Number(r.listenPort) || 0,
    targetHost: String(r.targetHost || '127.0.0.1'),
    targetPort: Number(r.targetPort) || 0,
    autoStart: r.autoStart !== false,
    enabled: r.enabled !== false,
  }));
}

function addPortForward() {
  portForwards.value.push({
    id: `pf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    direction: 'local',
    listenHost: '127.0.0.1',
    listenPort: 0,
    targetHost: '127.0.0.1',
    targetPort: 0,
    autoStart: true,
    enabled: true,
  });
}

function removePortForward(idx: number) {
  portForwards.value.splice(idx, 1);
}

type PfField = 'listenHost' | 'listenPort' | 'targetHost' | 'targetPort';

/** -L 是本机监听 / 远端目标，-R 是远端监听 / 本机目标，标签必须随方向变化。 */
function pfFieldLabel(direction: string, field: PfField): string {
  const keys: Record<PfField, string> =
    direction === 'local'
      ? {
          listenHost: 'connection.pfLocalListenHost',
          listenPort: 'connection.pfLocalListenPort',
          targetHost: 'connection.pfRemoteTargetHost',
          targetPort: 'connection.pfRemoteTargetPort',
        }
      : {
          listenHost: 'connection.pfRemoteListenHost',
          listenPort: 'connection.pfRemoteListenPort',
          targetHost: 'connection.pfLocalTargetHost',
          targetPort: 'connection.pfLocalTargetPort',
        };
  return t(keys[field]);
}

function syncProxyToForm() {
  (form as any).proxy = { ...proxyOptions };
}

function proxyValid(): boolean {
  if (proxyOptions.mode !== 'custom' || proxyOptions.host.trim()) return true;
  toast.warning(t('connection.proxyHostRequired'));
  return false;
}

// 回填/初始化期间跳过类型联动，避免覆盖已保存连接的端口与用户名
let skipTypeWatch = false;

// 连接类型切换时，端口和用户名改为该类型的默认值：
// SSH = 22/root，RDP = 3389/空（Windows 账户名因人而异，不预填 root）。
// 仅当用户尚未手动改过这两个字段时覆盖，避免误改用户输入。
watch(() => form.type, (newType, oldType) => {
  if (skipTypeWatch || newType === oldType) return;
  if (newType === 'rdp') {
    if (form.port === 22) form.port = 3389;
    if (form.username === 'root') form.username = '';
    form.authType = 'password';
  } else if (newType === 'ssh') {
    if (form.port === 3389) form.port = 22;
    if (form.username === '') form.username = 'root';
    if (form.authType === 'password' && !form.password) form.authType = 'auto';
  }
});

const isRdp = computed(() => (form.type as string) === 'rdp');

// RDP 专用配置（保存时写入 options.rdp / options.guacd）
const rdpOptions = reactive({ domain: '', width: 1280, height: 800 });
const hasAdvanced = computed(() =>
  form.platform !== 'auto' ||
  !!rdpOptions.domain ||
  rdpOptions.width !== 1280 ||
  rdpOptions.height !== 800
);

const connectionService = new ConnectionService();

/** 分组输入框的 datalist id（每个组件实例唯一，避免多实例冲突） */
let editorSeq = 0;
const groupListId = `conn-group-list-${++editorSeq}`;
const existingGroups = ref<string[]>([]);

/** 加载已有分组作为建议；不阻塞弹窗打开，失败时仍可自由输入 */
function loadGroupSuggestions() {
  connectionService.getAllConnections().then((res: any) => {
    const list: any[] = Array.isArray(res) ? res : (res?.data || []);
    const groups = new Set<string>();
    for (const c of list) {
      if (typeof c?.group === 'string' && c.group.trim()) groups.add(c.group.trim());
    }
    existingGroups.value = Array.from(groups).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }).catch(() => {});
}

function open(connection?: any) {
  skipTypeWatch = true;
  loadGroupSuggestions();
  if (connection) {
    editingConnection.value = connection.id;
    Object.assign(form, defaultForm(), connection);
    Object.assign(proxyOptions, defaultProxy(), connection.proxy || {});
    // 老连接可能没有 platform 字段，确保下拉框有合法默认值
    if (!form.platform) form.platform = 'auto';
    if (!Array.isArray(form.tags)) form.tags = [];
    if (typeof form.group !== 'string') form.group = '';
    showGroupTags.value = !!form.group || form.tags.length > 0;
    showStartupScript.value = !!connection.startupScript || !!connection.forwardAgent;
    portForwards.value = normalizePortForwards(connection.portForwards);
    showPortForwards.value = portForwards.value.length > 0;
    // 从 options 中提取保活配置
    if (connection.options?.keepaliveInterval !== undefined) {
      keepaliveInterval.value = connection.options.keepaliveInterval;
    } else {
      keepaliveInterval.value = 10000;
    }
    if (connection.options?.keepaliveCountMax !== undefined) {
      keepaliveCountMax.value = connection.options.keepaliveCountMax;
    } else {
      keepaliveCountMax.value = 3;
    }
    // 保活启用状态：如果 options 中有保活配置，则认为已启用
    keepaliveEnabled.value = connection.options?.keepaliveInterval !== undefined || connection.options?.keepaliveCountMax !== undefined;
    showKeepaliveConfig.value = keepaliveEnabled.value;
    // RDP 配置回填
    const rOpts = connection.options?.rdp || {};
    rdpOptions.domain = rOpts.domain || '';
    rdpOptions.width = rOpts.width || 1280;
    rdpOptions.height = rOpts.height || 800;
    // RDP 连接默认端口 3389
    if (connection.type === 'rdp' && !connection.port) form.port = 3389;
    showAdvanced.value = hasAdvanced.value;
  } else {
    editingConnection.value = null;
    Object.assign(form, defaultForm());
    Object.assign(proxyOptions, defaultProxy());
    showGroupTags.value = false;
    showAdvanced.value = false;
    showStartupScript.value = false;
    portForwards.value = [];
    showPortForwards.value = false;
    showKeepaliveConfig.value = false;
    keepaliveEnabled.value = true;
    keepaliveInterval.value = 10000;
    keepaliveCountMax.value = 3;
    rdpOptions.domain = '';
    rdpOptions.width = 1280;
    rdpOptions.height = 800;
  }
  // 代理配置默认收起，即使编辑已有代理的连接
  showProxyConfig.value = false;
  //  watch 是异步 flush，等本次同步回填完成后再恢复
  nextTick(() => { skipTypeWatch = false; });
  if (!props.embedded) connectionModal.value?.show();
}

function close() {
  if (!props.embedded) connectionModal.value?.hide();
}

// 取消 / 关闭：内嵌模式需通知宿主关闭面板
function cancel() {
  if (props.embedded) {
    emit('close');
    return;
  }
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
  for (const rule of portForwards.value) {
    if (!rule.listenPort || !rule.targetPort || rule.listenPort < 1 || rule.listenPort > 65535 || rule.targetPort < 1 || rule.targetPort > 65535) {
      toast.warning(t('connection.pfInvalidPort'));
      return;
    }
  }
  if (!proxyValid()) return;
  syncProxyToForm();
  (form as any).portForwards = portForwards.value.map(r => ({ ...r, enabled: r.enabled !== false }));
  saving.value = true;
  try {
    // RDP 连接：写入 rdp 配置（IronRDP-WASM 直连，无需 guacd），固定密码认证，默认端口 3389
    if (form.type === 'rdp') {
      form.port = form.port || 3389;
      form.authType = 'password';
      form.options = {
        ...form.options,
        rdp: { ...rdpOptions },
      };
    }
    // 将保活配置写入 options（仅 SSH 有意义）
    if (keepaliveEnabled.value) {
      form.options = {
        ...form.options,
        keepaliveInterval: keepaliveInterval.value,
        keepaliveCountMax: keepaliveCountMax.value,
      };
    } else {
      // 禁用保活：设置 keepaliveInterval 为 0 表示不发送心跳
      form.options = {
        ...form.options,
        keepaliveInterval: 0,
        keepaliveCountMax: 0,
      };
    }
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
  if (!proxyValid()) return;
  syncProxyToForm();
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

/** 由密钥管理器填充已生成的私钥（先 open() 再调用） */
function applyKey(privateKey: string, name?: string) {
  form.authType = 'privateKey';
  form.privateKey = privateKey;
  if (name && !form.name) form.name = name;
}

const emit = defineEmits(['saved', 'close']);

defineExpose({ open, close, applyKey });
</script>

<style scoped>
.connection-form { padding: 0.5rem; }
.card-header { user-select: none; }
</style>
