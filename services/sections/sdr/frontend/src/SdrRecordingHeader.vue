<template>
  <div class="sdr-recording-head">
    <div class="sdr-recording-freq">
      <span class="sdr-recording-freq-num">{{ frequencyNumber }}</span>
      <span class="sdr-recording-freq-unit">MHz</span>
      <span v-if="mode" class="sdr-recording-freq-mode">- {{ mode }}</span>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * A recording row's title line: the frequency in the radio's big readout style
 * (number + small unit, mirroring `.sdr-freq-input-large` + `.sdr-freq-unit`)
 * with the mode after it, and whatever the row puts on the right in the
 * default slot (the live status, or the edit/delete glyphs).
 */
import './SdrRecordingHeader.css'

defineProps<{
  /** The MHz number, already formatted. */
  frequencyNumber: string
  mode: string
}>()
</script>
