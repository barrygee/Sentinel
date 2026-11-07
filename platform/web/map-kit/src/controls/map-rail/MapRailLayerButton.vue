<template>
  <BaseIconButton
    class="sm-btn sm-sub-btn"
    style="
      --ba-rail-hover-bg: rgba(var(--rail-ink-rgb), 0.2);
      --ba-rail-transition: color 0.15s ease;
    "
    :class="{ active }"
    :active="active"
    tooltip-side="left"
    :tooltip="tooltip"
    :accessible-name="accessibleName"
  >
    <slot />
  </BaseIconButton>
</template>

<script setup lang="ts">
/**
 * `MapRailLayerButton` — one overlay switch in a map rail's MAP LAYERS panel.
 * The hover fill is stronger than a top-level rail button's, to read against the
 * panel's grey. `id`, `disabled` and the click fall through to the button.
 */
import BaseIconButton from '@sentinel/ui/base/BaseIconButton.vue'

defineProps<{
  /** Uppercase hover label. */
  tooltip: string
  accessibleName: string
  /** The overlay is on. */
  active: boolean
}>()
</script>
