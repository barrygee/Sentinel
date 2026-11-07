<template>
  <MapRailLayerButton tooltip="RANGE RINGS" accessible-name="Range rings" :active="active">
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.5" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  </MapRailLayerButton>
</template>

<script setup lang="ts">
/** `MapRailRangeRingsButton` — the range rings switch. The click falls through to the button. */
import MapRailLayerButton from '@sentinel/map-kit/controls/map-rail/MapRailLayerButton.vue'

defineProps<{
  /** The rings are on. */
  active: boolean
}>()
</script>
