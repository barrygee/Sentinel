<template>
  <h3 class="settings-group-heading" :class="{ 'settings-group-heading--spaced': spaced }">
    <button
      type="button"
      class="settings-group-label"
      :aria-expanded="expanded"
      :aria-controls="controlsId"
      @click="emit('toggle')"
    >
      <span class="settings-group-label-text">{{ label }}</span>
      <ChevronIcon :open="expanded" />
    </button>
  </h3>
</template>

<script setup lang="ts">
/**
 * `SettingsGroupToggle` — a Settings group's heading (DATA SOURCES, MAP,
 * LABELS…) as the button that folds and unfolds the group's cards. The title
 * keeps the group-label look; the chevron sits at the right edge and turns the
 * way every other accordion's in the app does (down folded, up open).
 */
import ChevronIcon from '@sentinel/ui/icons/ChevronIcon.vue'

defineProps<{
  /** The group's title. */
  label: string
  /** Whether the group's cards are showing. */
  expanded: boolean
  /** The id of the element holding the group's cards. */
  controlsId: string
  /** Space it off from the group above (every group but the first). */
  spaced: boolean
}>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<style scoped>
.settings-group-heading {
  grid-column: 1 / -1;
  margin: 0;
  padding: 4px 0 0;
}

.settings-group-heading--spaced {
  padding-top: 30px;
}

.settings-group-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-title);
  font-weight: 600;
  letter-spacing: 0.22em;
  color: var(--ink-secondary);
  text-align: left;
  text-transform: uppercase;
  cursor: pointer;
}

.settings-group-label:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .settings-group-label :deep(.chevron-icon) {
    transition: none;
  }
}
</style>
