<template>
  <BasePillToggle
    class="playback-pill playback-pill--live"
    aria-label="Back to live"
    title="Back to live (Esc)"
    @click="emit('goLive')"
  >
    <span class="playback-live-dot" aria-hidden="true" />LIVE
  </BasePillToggle>
</template>

<script setup lang="ts">
/** Leaves replay and returns the section to its live feed. */
import '@sentinel/ui/playback/playbackControls.css'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'

const emit = defineEmits<{ goLive: [] }>()
</script>

<style scoped>
.playback-live-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 5px;
  border-radius: 50%;
  background: var(--sev-live);
}
</style>
