<template>
  <div class="sdr-freq-actions-row">
    <BasePillToggle
      class="sdr-mode-pill sdr-tune-btn"
      title="Tune"
      aria-label="Tune"
      :disabled="tuneDisabled"
      @click="emit('tune')"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <polygon points="2,1 11,6 2,11" fill="currentColor" />
      </svg>
    </BasePillToggle>
    <BasePillToggle
      class="sdr-mode-pill sdr-tune-btn sdr-stop-btn"
      title="Stop audio"
      aria-label="Stop audio"
      :disabled="idle"
      @click="emit('stop')"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />
      </svg>
    </BasePillToggle>
    <BasePillToggle
      class="sdr-mode-pill sdr-tune-btn sdr-rec-btn"
      :active="isRecording"
      active-class="sdr-rec-btn--active"
      :class="{ 'sdr-rec-btn--waiting': isRecording && !recSquelchOpen }"
      :title="
        isRecording
          ? recSquelchOpen
            ? 'Stop recording'
            : 'Stop recording (waiting for signal)'
          : 'Record'
      "
      :aria-label="isRecording ? 'Stop recording' : 'Record'"
      :aria-pressed="isRecording"
      :disabled="idle"
      @click="emit('toggleRecording')"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <!-- Waiting on the squelch: nothing is being captured, so it
             reads as paused rather than as a stop button. -->
        <template v-if="isRecording && !recSquelchOpen">
          <rect x="2" y="1.5" width="2.2" height="7" rx="0.6" fill="currentColor" />
          <rect x="5.8" y="1.5" width="2.2" height="7" rx="0.6" fill="currentColor" />
        </template>
        <template v-else-if="isRecording">
          <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
        </template>
        <template v-else>
          <circle cx="5" cy="5" r="4" fill="currentColor" />
        </template>
      </svg>
    </BasePillToggle>
  </div>
</template>

<script setup lang="ts">
/**
 * The transport row under the frequency readout: Tune (start listening on the
 * typed frequency), Stop audio, and Record — which pulses red while capturing
 * and shows a yellow pause while it waits for the squelch to open.
 */
import './SdrTransportButtons.css'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'

defineProps<{
  tuneDisabled: boolean
  /** Nothing is playing, scanning or searching: Stop and Record have nothing to act on. */
  idle: boolean
  isRecording: boolean
  /** The squelch is open, so a running recording is capturing rather than waiting. */
  recSquelchOpen: boolean
}>()

const emit = defineEmits<{
  tune: []
  stop: []
  toggleRecording: []
}>()
</script>
