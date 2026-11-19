<template>
  <div class="sdr-recording-row" :class="{ 'sdr-recording-playing': playing }">
    <div class="sdr-recording-content">
      <slot />
    </div>
    <slot name="after-content" />
  </div>
</template>

<script setup lang="ts">
/**
 * The frame every RECORDINGS row shares, live or saved: the hover/playing
 * background and the padded content column. Anything that must sit outside
 * the padding (a saved row's hidden `<audio>`) goes in `after-content`.
 */
import './SdrRecordingRowFrame.css'

defineProps<{
  /** The row's recording is playing: tints the whole row. */
  playing?: boolean
}>()
</script>
