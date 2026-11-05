<template>
  <BaseIconAction
    class="sdr-freq-add"
    accessible-name="Add this frequency to the Frequency Manager"
    tooltip="ADD TO FREQUENCY MANAGER"
  >
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <line x1="6" y1="1.5" x2="6" y2="10.5" stroke="currentColor" stroke-width="1.2" />
      <line x1="1.5" y1="6" x2="10.5" y2="6" stroke="currentColor" stroke-width="1.2" />
    </svg>
  </BaseIconAction>
</template>

<script setup lang="ts">
/**
 * SdrAddFrequencyButton — the small `+` beside the tuned frequency, offered for
 * a frequency that isn't saved yet. The parent decides when it exists and what
 * a click does; the click falls through to the button.
 *
 * Styling lives in SdrPanel.css with the rest of the frequency readout: it stays
 * hidden until the readout is hovered or focused, a rule that belongs to the row.
 */
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
</script>
