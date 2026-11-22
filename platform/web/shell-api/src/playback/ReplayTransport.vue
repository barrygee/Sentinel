<template>
  <div class="replay-transport" role="group" aria-label="Replay transport">
    <BaseChip
      :aria-label="`Back ${stepLabel}`"
      :title="`Back ${stepLabel}`"
      @click="emit('stepBack')"
    >
      <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
        <polygon points="6,0 0,5 6,10" fill="currentColor" />
        <polygon points="12,0 6,5 12,10" fill="currentColor" />
      </svg>
    </BaseChip>
    <BaseChip
      :active="playing"
      :aria-label="playing ? 'Pause replay' : 'Play replay'"
      :title="playing ? 'Pause' : 'Play'"
      @click="emit('togglePlaying')"
    >
      <PlayStopIcon :pause="playing" />
    </BaseChip>
    <BaseChip
      :aria-label="`Forward ${stepLabel}`"
      :title="`Forward ${stepLabel}`"
      @click="emit('stepForward')"
    >
      <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
        <polygon points="0,0 6,5 0,10" fill="currentColor" />
        <polygon points="6,0 12,5 6,10" fill="currentColor" />
      </svg>
    </BaseChip>
    <BaseChip
      class="replay-transport-live"
      :disabled="!replaying"
      aria-label="Back to live"
      title="Back to live"
      @click="emit('goLive')"
    >
      LIVE
    </BaseChip>
  </div>
</template>

<script setup lang="ts">
/**
 * Replay transport in the app's chip style: back, play/pause, forward, and a
 * LIVE chip (disabled while already live). The play chip lights while playing.
 */
import BaseChip from '@sentinel/ui/base/BaseChip.vue'
import PlayStopIcon from '@sentinel/ui/icons/PlayStopIcon.vue'

defineProps<{
  playing: boolean
  replaying: boolean
  /** How far a step moves, as words for the names (`1 minute`). */
  stepLabel: string
}>()

const emit = defineEmits<{
  togglePlaying: []
  stepBack: []
  stepForward: []
  goLive: []
}>()
</script>

<style scoped>
.replay-transport {
  display: flex;
  align-items: center;
  gap: 4px;
}
.replay-transport-live {
  margin-left: auto;
}
</style>
