<script setup lang="ts">
import { useTemplateRef } from 'vue'

const root = useTemplateRef('root')

defineExpose({ root })
</script>

<template>
  <div ref="root" class="stage" />
</template>

<style scoped>
.stage {
  position: absolute;
  inset: 0;
  touch-action: none;
}

.stage :deep(.view) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
