<template>
  <div v-if="visible" class="tunnel-overlay" @click.self="close">
    <div class="tunnel-modal">
      <div class="tunnel-header">
        <h5 class="mb-0"><i class="bi bi-arrow-left-right me-2"></i>{{ t('tunnel.title') }}</h5>
        <button class="btn-close-modal" @click="close"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="tunnel-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <small class="text-muted">{{ t('tunnel.hint') }}</small>
          <button class="btn btn-sm btn-outline-secondary" @click="refresh" :disabled="loading">
            <i class="bi bi-arrow-clockwise me-1"></i>{{ t('tunnel.refresh') }}
          </button>
        </div>

        <div v-if="loading && !sessions.length" class="text-center text-muted py-4">
          <span class="spinner-border spinner-border-sm me-2"></span>{{ t('tunnel.loading') }}
        </div>
        <div v-else-if="!sessions.length" class="text-center text-muted py-4">
          <i class="bi bi-diagram-3 d-block fs-1 mb-2"></i>
          {{ t('tunnel.noSessions') }}
        </div>

        <div v-for="s in sessions" :key="s.sessionId" class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><i class="bi bi-terminal me-1"></i>{{ s.name }}</span>
            <small class="text-muted">{{ t('tunnel.ruleCount', { n: s.rules.length }) }}</small>
          </div>
          <div class="card-body p-2">
            <div v-if="!s.rules.length" class="text-muted small">{{ t('tunnel.noRules') }}</div>
            <div v-for="r in s.rules" :key="r.rule.id" class="d-flex align-items-center justify-content-between border-bottom py-2 px-1">
              <div class="flex-grow-1">
                <div class="fw-bold small">
                  <span class="badge bg-info text-dark me-1">{{ r.rule.direction === 'remote' ? t('connection.pfRemote') : t('connection.pfLocal') }}</span>
                  {{ r.rule.name || t('tunnel.unnamed') }}
                </div>
                <div class="text-muted small">
                  {{ r.rule.listenHost }}:{{ r.rule.listenPort }} → {{ r.rule.targetHost }}:{{ r.rule.targetPort }}
                </div>
                <div v-if="r.status?.error" class="text-danger small">{{ r.status.error }}</div>
              </div>
              <div class="d-flex align-items-center gap-2 ms-2">
                <span class="badge" :class="statusClass(r.status?.status)">{{ statusLabel(r.status?.status) }}</span>
                <button v-if="r.status?.status === 'active'" class="btn btn-sm btn-outline-danger" @click="stop(s, r.rule.id)">
                  <i class="bi bi-stop-circle"></i>
                </button>
                <button v-else class="btn btn-sm btn-outline-success" @click="start(s, r.rule)">
                  <i class="bi bi-play-circle"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTerminalStore } from '@/stores/terminal';
import { tunnelService } from '@/service/tunnel';
import type { PortForwardRule, PortForwardStatus } from '@/typings/connection';
import { toast } from '@/utils/toast';

const { t } = useI18n();
const store = useTerminalStore();

const visible = ref(false);
const loading = ref(false);

interface SessionRules {
  sessionId: string;
  name: string;
  rules: Array<{ rule: PortForwardRule; status?: PortForwardStatus }>;
}
const sessions = ref<SessionRules[]>([]);

function open() {
  visible.value = true;
  refresh();
}
function close() { visible.value = false; }
defineExpose({ open, close });

async function refresh() {
  loading.value = true;
  try {
    const sshTabs = store.tabs.filter(tab =>
      tab.sessionId && (tab.status === 'connected' || tab.status === 'reconnecting') &&
      store.connections.find(c => c.id === tab.connectionId)?.type !== 'rdp'
    );
    const result: SessionRules[] = [];
    for (const tab of sshTabs) {
      const connection = store.connections.find(c => c.id === tab.connectionId);
      const rules = (connection?.portForwards || []).filter(r => r.enabled !== false);
      if (!rules.length) continue;
      let statuses: PortForwardStatus[] = [];
      try { statuses = await tunnelService.list(tab.sessionId!); } catch (_) {}
      result.push({
        sessionId: tab.sessionId!,
        name: tab.connectionName,
        rules: rules.map(rule => ({
          rule,
          status: statuses.find(s => s.ruleId === rule.id),
        })),
      });
    }
    sessions.value = result;
  } catch (e: any) {
    toast.error(e.message || t('tunnel.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function start(s: SessionRules, rule: PortForwardRule) {
  try {
    await tunnelService.start(s.sessionId, rule);
    toast.success(t('tunnel.started'));
    await refresh();
  } catch (e: any) {
    toast.error(e.message || t('tunnel.startFailed'));
    await refresh();
  }
}

async function stop(s: SessionRules, ruleId: string) {
  try {
    await tunnelService.stop(s.sessionId, ruleId);
    toast.success(t('tunnel.stopped'));
    await refresh();
  } catch (e: any) {
    toast.error(e.message || t('tunnel.stopFailed'));
    await refresh();
  }
}

function statusClass(status?: string) {
  if (status === 'active') return 'bg-success';
  if (status === 'starting') return 'bg-warning';
  if (status === 'error') return 'bg-danger';
  return 'bg-secondary';
}
function statusLabel(status?: string) {
  if (status === 'active') return t('tunnel.statusActive');
  if (status === 'starting') return t('tunnel.statusStarting');
  if (status === 'error') return t('tunnel.statusError');
  return t('tunnel.statusStopped');
}
</script>

<style scoped>
.tunnel-overlay {
  position: fixed; inset: 0; z-index: 1060;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
}
.tunnel-modal {
  width: min(720px, 92vw); max-height: 85vh;
  display: flex; flex-direction: column;
  background: var(--bg-primary, #fff); color: var(--text-primary, #212529);
  border-radius: 10px; overflow: hidden;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35);
}
.tunnel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border-color, #dee2e6);
}
.tunnel-body { padding: 16px 18px; overflow-y: auto; }
.btn-close-modal {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: var(--text-secondary, #6c757d);
}
</style>
