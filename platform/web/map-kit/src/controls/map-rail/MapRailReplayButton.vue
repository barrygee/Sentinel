<template>
  <BaseIconButton
    v-if="section.historyEnabled"
    class="sm-btn"
    style="--ba-rail-transition: color 0.15s ease"
    :class="{ active: replaying }"
    :active="replaying"
    tooltip-side="left"
    :tooltip="replaying ? 'BACK TO LIVE' : 'REPLAY'"
    accessible-name="Replay"
    :aria-pressed="replaying"
    @click="toggleReplay"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <!-- A clock face with an anticlockwise arrow: going back in time. -->
      <path
        d="M4 12a8 8 0 1 0 2.3-5.6"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        fill="none"
      />
      <path
        d="M3.5 3.5v4h4"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        fill="none"
      />
      <path
        d="M12 8v4l3 2"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        fill="none"
      />
    </svg>
  </BaseIconButton>
</template>

<script setup lang="ts">
/**
 * The map rail's REPLAY button: enters the section's replay mode (an hour
 * back, paused) or returns it to live. Shown only while the section records
 * history (Settings › <section> › History & Replay).
 */
import { computed } from 'vue'
import BaseIconButton from '@sentinel/ui/base/BaseIconButton.vue'
import type { PlaybackSectionId } from '@sentinel/shell-api/playback/playbackSections'
import { usePlaybackStore } from '@sentinel/shell-api/stores/playback'

const props = defineProps<{ sectionId: PlaybackSectionId }>()

const playback = usePlaybackStore()
const section = computed(() => playback.sections[props.sectionId])
const replaying = computed(() => section.value.mode === 'replay')

function toggleReplay(): void {
  if (replaying.value) playback.exitReplay(props.sectionId)
  else playback.enterReplay(props.sectionId)
}
</script>
