<template>
  <div class="vscode-edit-root" style="height: 100vh; overflow: auto;">
    <ConnectionEditor ref="editorRef" :embedded="true" @saved="onSaved" @close="onClose" />
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import ConnectionEditor from '@/components/connection-editor/index.vue';
import { ConnectionService } from '@/service/connection';

const props = defineProps<{ id?: string }>();

const editorRef = ref<InstanceType<typeof ConnectionEditor>>();

onMounted(async () => {
  let conn: any = undefined;
  if (props.id) {
    try {
      const service = new ConnectionService();
      const res: any = await service.getConnectionById(props.id);
      // request() 返回服务端信封 {ret, data, msg}，与桌面端 store 的解包方式一致
      if (res && typeof res === 'object' && 'ret' in res) {
        conn = res.ret === 0 ? res.data : undefined;
        if (res.ret !== 0) {
          console.error('[vscode-edit] 加载连接失败:', res.msg || res.ret);
        }
      } else {
        conn = res || undefined;
      }
    } catch (e) {
      console.error('[vscode-edit] 加载连接失败:', e);
    }
    if (!conn) {
      console.warn('[vscode-edit] 未找到连接:', props.id);
    }
  }
  // 等待 Modal 组件就绪
  requestAnimationFrame(() => editorRef.value?.open(conn));
});

// 保存成功后通知扩展刷新树并关闭编辑面板
function onSaved() {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'aicmd-edit-saved' }, '*');
  }
}

// 取消 / 关闭：通知扩展关闭编辑面板（树无需刷新）
function onClose() {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'aicmd-edit-close' }, '*');
  }
}
</script>
