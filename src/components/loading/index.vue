<template>
    <div class="loading-overlay" v-if="isLoading">
      <div class="loading-spinner">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
      <p v-if="message" class="m-3 text-primary">{{ message }}</p>
    </div>
</template>

<script setup lang="ts">
defineProps({
    isLoading: { type: Boolean, default: false },
    message: { type: String, default: '加载中...' }
});
</script>

<style scoped>
.loading-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background-color: var(--bg-recess-strong);
    display: flex; justify-content: center; align-items: center; z-index: 1050;
}
.loading-spinner { text-align: center; }
</style>
