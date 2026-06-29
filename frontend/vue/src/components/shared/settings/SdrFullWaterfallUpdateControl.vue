<template>
  <div class="ac-wrap">
    <div class="ac-row">
      <span class="ac-label">FULL WATERFALL UPDATE</span>
      <button
        class="ac-track"
        :class="{ 'is-on': on }"
        role="switch"
        :aria-checked="on"
        aria-label="Toggle full waterfall update on zoom change"
        @click="toggle"
      >
        <span class="ac-thumb"></span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useSdrStore } from '@/stores/sdr'
import * as settingsApi from '@/services/settingsApi'

// "Full waterfall update" toggle — matches SDR++ User Guide v1.1 p. 34. ON
// resets the waterfall history each time Zoom changes so new rows fill the
// narrower viewport cleanly. Persistence and DB hydration mirror
// SdrAutoCenterControl exactly.
const sdr = useSdrStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
const on = ref<boolean>(sdr.fullWaterfallUpdate)

async function syncFromDb(): Promise<void> {
  await sdr.hydrateFullWaterfallUpdateFromDb()
  on.value = sdr.fullWaterfallUpdate
}

onMounted(() => {
  void syncFromDb()
  document.addEventListener('sentinel:config-uploaded', syncFromDb)
})

onBeforeUnmount(() => {
  document.removeEventListener('sentinel:config-uploaded', syncFromDb)
})

function toggle(): void {
  on.value = !on.value
  sdr.setFullWaterfallUpdate(on.value)
  emit('stage', () => settingsApi.put('sdr', 'fullWaterfallUpdate', on.value))
}
</script>

<style scoped>
.ac-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.ac-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ac-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(16, 19, 29, 0.6);
}
.ac-track {
  position: relative;
  width: 46px;
  height: 25px;
  border-radius: 999px;
  border: none;
  background: rgba(16, 19, 29, 0.14);
  cursor: pointer;
  padding: 0;
  transition: background 0.18s;
}
.ac-track.is-on {
  background: #c8ff00;
}
.ac-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  background: #ffffff;
  transition:
    left 0.18s,
    background 0.18s;
}
.ac-track.is-on .ac-thumb {
  background: #0a0c10;
  left: 24px;
}
</style>
