<template>
  <div v-show="active" class="sdr-scan-state-row">
    <span class="sdr-scan-state-label">{{ paused ? pausedLabel : runningLabel }}</span>
    <div
      class="sdr-scan-indicator"
      :class="{
        'sdr-scan-running': active && !paused,
        'sdr-scan-holding': paused,
      }"
    ></div>
  </div>
</template>

<script setup lang="ts">
/**
 * The activity readout in the SCANNER / SEARCH accordion bar: "SCANNING" with a
 * pulsing accent dot while the sweep steps, "SCANNING PAUSED" with a steady
 * amber dot while it holds on a signal. Hidden while the sweep is stopped.
 */
import './SdrSweepStateIndicator.css'

defineProps<{
  active: boolean
  /** Holding on a frequency with signal. */
  paused: boolean
  runningLabel: string
  pausedLabel: string
}>()
</script>
