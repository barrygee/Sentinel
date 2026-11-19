<template>
  <div class="sdr-recording-progress">
    <div class="sdr-recording-segments" @click.stop="seek" @mousedown.stop>
      <div
        v-for="segment in RECORDING_PROGRESS_SEGMENTS"
        :key="segment"
        class="sdr-recording-seg"
        :class="{ 'sdr-recording-seg--on': segment <= litSegments }"
      ></div>
    </div>
    <span class="sdr-recording-time"
      >{{ formatPlaybackClock(currentTimeSeconds) }} /
      {{ formatPlaybackClock(durationSeconds) }}</span
    >
  </div>
</template>

<script setup lang="ts">
/**
 * The SIGNAL-style block progress bar shown under the playing recording. Each
 * block lights up as playback passes it (a CSS transition fades the colour, so
 * it animates block-by-block); a click anywhere on it seeks there.
 */
import './SdrRecordingProgressBar.css'
import { computed } from 'vue'
import { formatPlaybackClock } from './sdrRecordings'

// Number of blocks in the bar (matches the radio meter feel).
const RECORDING_PROGRESS_SEGMENTS = 28

const props = defineProps<{
  currentTimeSeconds: number
  durationSeconds: number
}>()

const emit = defineEmits<{
  /** A click on the bar: the fraction (0–1) of the recording to seek to. */
  seek: [fraction: number]
}>()

const litSegments = computed(() => {
  const progressPercent =
    props.durationSeconds > 0
      ? Math.min(100, Math.max(0, (props.currentTimeSeconds / props.durationSeconds) * 100))
      : 0
  return Math.round((progressPercent / 100) * RECORDING_PROGRESS_SEGMENTS)
})

function seek(event: MouseEvent): void {
  const bar = (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('seek', Math.min(1, Math.max(0, (event.clientX - bar.left) / bar.width)))
}
</script>
