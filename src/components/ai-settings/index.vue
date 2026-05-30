<template>
  <Modal 
    ref="aiSettingsModal"
    :title="t('ai.settings')"
    :closeButton="{ text: t('common.cancel'), show: false }"
    :confirmButton="{ text: '', show: false }"
    :dialogStyle="{ maxWidth: '500px', width: '100%' }"
    @onHidden="handleModalClose"
  >
    <form @submit.prevent="saveSettings" class="ai-settings-form">
      <!-- API 配置 -->
      <div class="mb-3">
          <label class="form-label fw-bold">
            <i class="bi bi-key me-1"></i>{{ t('ai.apiKey') }} <span class="text-danger">*</span>
          </label>
          <div class="input-group">
            <input 
              :type="showApiKey ? 'text' : 'password'" 
              class="form-control" 
              v-model="form.apiKey"
              :placeholder="t('ai.apiKeyPlaceholder')"
              required
            >
            <button type="button" class="btn btn-outline-secondary" @click="showApiKey = !showApiKey">
              <i :class="showApiKey ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
            </button>
          </div>
          <small class="form-text text-muted">{{ t('ai.apiKeyHint') }}</small>
        </div>

        <div class="mb-3">
          <label class="form-label fw-bold">
            <i class="bi bi-globe me-1"></i>{{ t('ai.baseUrl') }}
          </label>
          <input 
            type="text" 
            class="form-control" 
            v-model="form.baseUrl"
            :placeholder="t('ai.baseUrlPlaceholder')"
          >
          <small class="form-text text-muted">{{ t('ai.baseUrlHint') }}</small>
        </div>

        <div class="mb-3">
          <label class="form-label fw-bold">
            <i class="bi bi-cpu me-1"></i>{{ t('ai.model') }}
          </label>
          <input 
            type="text" 
            class="form-control" 
            v-model="form.model"
            :placeholder="t('ai.modelPlaceholder')"
          >
          <small class="form-text text-muted">{{ t('ai.modelHint') }}</small>
        </div>

        <div class="row mb-3">
          <div class="col-6">
            <label class="form-label">{{ t('ai.maxTokens') }}</label>
            <input type="number" class="form-control form-control-sm" v-model.number="form.maxTokens" min="100" max="8000">
          </div>
          <div class="col-6">
            <label class="form-label">{{ t('ai.temperature') }}</label>
            <input type="number" class="form-control form-control-sm" v-model.number="form.temperature" min="0" max="2" step="0.1">
          </div>
        </div>
      <!-- /API 配置 -->

      <!-- 操作按钮 -->
      <div class="d-flex justify-content-between">
        <!-- <button 
          type="button" 
          class="btn btn-outline-info" 
          @click="testConnection" 
          :disabled="testing || !form.enabled"
        >
          <span v-if="testing" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="bi bi-lightning me-1"></i>
          {{ testing ? t('ai.testing') : t('ai.testConnection') }}
        </button> -->
        <div class="ms-auto">
          <button type="button" class="btn btn-secondary me-2" @click="close">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
            {{ saving ? t('common.processing') : t('common.save') }}
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
import * as aiService from '@/service/ai';
import { toast } from '@/utils/toast';

const { t } = useI18n();

const aiSettingsModal = ref();
const showApiKey = ref(false);
const testing = ref(false);
const saving = ref(false);

interface AIConfigForm {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

const defaultForm = (): AIConfigForm => ({
  enabled: true,
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  maxTokens: 2000,
  temperature: 0.7,
});

const form = reactive<AIConfigForm>(defaultForm());

async function open() {
  try {
    const config = await aiService.getAIConfig();
    if (config) {
      Object.assign(form, defaultForm(), config as any);
    }
  } catch (e) {
    console.error('Failed to load AI config:', e);
  }
  aiSettingsModal.value?.show();
}

function close() {
  aiSettingsModal.value?.hide();
}

function handleModalClose() {
  // Reset form on close
}

async function saveSettings() {
  if (!form.apiKey) {
    toast.warning(t('ai.apiKeyRequired'));
    return;
  }
  
  saving.value = true;
  try {
    await aiService.updateAIConfig({ ...form });
    toast.success(t('ai.saveSuccess'));
    close();
    emit('saved');
  } catch (e: any) {
    toast.error(e.message || t('ai.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function testConnection() {
  testing.value = true;
  try {
    const result = await aiService.testAIConfig({ ...form });
    if (result?.success) {
      toast.success(t('ai.testSuccess'));
    } else {
      toast.error(result?.message || t('ai.testFailed'));
    }
  } catch (e: any) {
    toast.error(e.message || t('ai.testFailed'));
  } finally {
    testing.value = false;
  }
}

const emit = defineEmits(['saved']);

defineExpose({ open, close });
</script>

<style scoped>
.ai-settings-form {
  padding: 0.5rem;
}

.form-check-input:checked {
  background-color: var(--accent);
  border-color: var(--accent);
}

.form-text {
  font-size: 12px;
  display: block;
  margin-top: 4px;
}
</style>
