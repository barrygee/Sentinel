<template>
  <button
    type="button"
    class="settings-item-toggle"
    :aria-expanded="expanded"
    :aria-controls="controlsId"
    @click="emit('toggle')"
  >
    <span class="settings-item-label">{{ label }}</span>
    <ChevronIcon :open="expanded" />
  </button>
</template>

<script setup lang="ts">
/**
 * `SettingItemToggle` — a collapsible settings card's title, as the button
 * that opens and folds its control. It keeps the title's look, so a folded
 * card reads like any other card's heading.
 */
import ChevronIcon from '@sentinel/ui/icons/ChevronIcon.vue'

defineProps<{
  /** The card's title. */
  label: string
  /** Whether the card's control is showing. */
  expanded: boolean
  /** The id of the element the button shows and hides. */
  controlsId: string
}>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<style scoped>
.settings-item-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 10px;
  min-height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  cursor: pointer;
}

.settings-item-toggle:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .settings-item-toggle :deep(.chevron-icon) {
    transition: none;
  }
}
</style>
