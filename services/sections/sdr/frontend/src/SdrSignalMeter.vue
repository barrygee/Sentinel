<template>
  <div class="sdr-radio-section">
    <span class="sdr-field-label">SIGNAL</span>
    <div class="sdr-signal-segments" :class="{ 'sdr-signal-segments--muted': !audible }">
      <div
        v-for="segment in segmentCount"
        :key="segment"
        class="sdr-signal-seg"
        :class="{ 'sdr-signal-seg--on': segment <= litSegments }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The segmented SIGNAL meter under the transport buttons. It sits outside the
 * CONTROLS accordion so it stays visible when that is collapsed; the lit
 * segments turn grey while the audio is squelched or stopped.
 */
import './SdrSignalMeter.css'

defineProps<{
  segmentCount: number
  litSegments: number
  /** Audio is playing and the squelch is open (or off). */
  audible: boolean
}>()
</script>
