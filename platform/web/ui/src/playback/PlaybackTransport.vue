<template>
  <div class="playback-transport" role="group" aria-label="Replay transport">
    <BasePillToggle
      class="playback-pill"
      :aria-label="`Back ${stepLabel}`"
      :title="`Back ${stepLabel}`"
      @click="emit('stepBack')"
    >
      <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
        <polygon points="6,0 0,5 6,10" fill="currentColor" />
        <polygon points="12,0 6,5 12,10" fill="currentColor" />
      </svg>
    </BasePillToggle>
    <BasePillToggle
      class="playback-pill playback-pill--primary"
      :aria-label="playing ? 'Pause replay' : 'Play replay'"
      :title="playing ? 'Pause' : 'Play'"
      @click="emit('togglePlaying')"
    >
      <PlayStopIcon :pause="playing" />
    </BasePillToggle>
    <BasePillToggle
      class="playback-pill"
      :aria-label="`Forward ${stepLabel}`"
      :title="`Forward ${stepLabel}`"
      @click="emit('stepForward')"
    >
      <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
        <polygon points="0,0 6,5 0,10" fill="currentColor" />
        <polygon points="6,0 12,5 6,10" fill="currentColor" />
      </svg>
    </BasePillToggle>
  </div>
</template>

<script setup lang="ts">
/**
 * Replay's transport: step back, play/pause, step forward. Momentary pills,
 * so they carry their names but no pressed state (the play button's name
 * says what pressing it will do).
 */
import '@sentinel/ui/playback/playbackControls.css'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'
import PlayStopIcon from '@sentinel/ui/icons/PlayStopIcon.vue'

defineProps<{
  playing: boolean
  /** How far a step moves, as words for the names (`1 minute`). */
  stepLabel: string
}>()

const emit = defineEmits<{
  togglePlaying: []
  stepBack: []
  stepForward: []
}>()
</script>

<style scoped>
.playback-transport {
  display: flex;
  gap: 4px;
}
</style>
