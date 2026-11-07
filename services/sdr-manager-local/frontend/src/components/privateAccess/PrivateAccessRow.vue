<template>
  <li class="private-access-row">
    <span class="private-access-address">{{ address }}</span>
    <BaseIconAction
      class="private-access-remove"
      :accessible-name="`Remove ${address}`"
      :disabled="disabled"
      @click="emit('remove')"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.4" />
      </svg>
    </BaseIconAction>
  </li>
</template>

<script setup lang="ts">
/** `PrivateAccessRow` — one allowed address, with the cross that removes it. */
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'

defineProps<{
  address: string
  /** True while a change is being saved. */
  disabled: boolean
}>()
const emit = defineEmits<{ remove: [] }>()
</script>

<style scoped>
.private-access-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
}

.private-access-address {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
}

.private-access-remove {
  flex-shrink: 0;
  /* 24x24 target (WCAG 2.5.8) around the 12px glyph. */
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ink-secondary);
}

.private-access-remove:hover {
  color: var(--ink-strong);
}
</style>
