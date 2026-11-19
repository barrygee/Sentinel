<template>
  <SdrRecordingRowFrame class="sdr-recording-live">
    <SdrRecordingHeader
      :frequency-number="(recording.frequency_hz / 1e6).toFixed(4)"
      :mode="recording.mode"
    >
      <span class="sdr-recording-live-status">
        <span
          class="sdr-recording-live-dot"
          :class="{ 'sdr-recording-live-dot--waiting': !squelchOpen }"
        ></span>
        {{ squelchOpen ? 'Recording' : 'Waiting' }}
      </span>
    </SdrRecordingHeader>
    <SdrRecordingMeta
      :date="recording.startedAt"
      :duration="formatRecordingDuration(elapsedSeconds)"
      :size="formatRecordingSize(elapsedSeconds * LIVE_RECORDING_BYTES_PER_SECOND)"
    />
    <div class="sdr-recording-controls">
      <button
        class="sdr-recording-stop"
        title="Stop recording"
        aria-label="Stop recording"
        @click.stop="emit('stop')"
      >
        <svg width="11" height="11" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <rect x="1.5" y="1.5" width="7" height="7" rx="1" />
        </svg>
        STOP
      </button>
    </div>
  </SdrRecordingRowFrame>
</template>

<script setup lang="ts">
/**
 * The recording in progress, pinned above the saved ones: its frequency, a
 * pulsing "Recording" dot (amber "Waiting" while the squelch is closed), the
 * running duration and estimated size, and a red STOP.
 */
import './SdrRecordingPill.css'
import './SdrLiveRecordingRow.css'
import SdrRecordingRowFrame from './SdrRecordingRowFrame.vue'
import SdrRecordingHeader from './SdrRecordingHeader.vue'
import SdrRecordingMeta from './SdrRecordingMeta.vue'
import {
  LIVE_RECORDING_BYTES_PER_SECOND,
  formatRecordingDuration,
  formatRecordingSize,
  type LiveRecording,
} from './sdrRecordings'

defineProps<{
  recording: LiveRecording
  /** The squelch is open, so audio is actually being written. */
  squelchOpen: boolean
  elapsedSeconds: number
}>()

const emit = defineEmits<{
  stop: []
}>()
</script>
