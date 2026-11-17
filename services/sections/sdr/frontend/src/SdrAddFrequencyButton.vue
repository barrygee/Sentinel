<template>
  <BaseIconAction
    class="sdr-freq-add"
    accessible-name="Add this frequency to the Frequency Manager"
    tooltip="ADD TO FREQUENCY MANAGER"
    tooltip-side="left"
  >
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" />
    </svg>
  </BaseIconAction>
</template>

<script setup lang="ts">
/**
 * SdrAddFrequencyButton — the `+` at the right end of the tuned-frequency row,
 * offered for a frequency that isn't saved yet. The parent decides when it exists and what
 * a click does; the click falls through to the button.
 *
 * Its tooltip opens to the left: the button sits at the panel's right edge,
 * where the default (left-aligned, running right) tooltip was cut off.
 *
 * Styling lives in SdrPanel.css with the rest of the frequency readout: it stays
 * hidden until the readout is hovered or focused, a rule that belongs to the row.
 */
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
</script>
