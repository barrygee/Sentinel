<template>
  <div class="ac-wrap">
    <div class="ac-row">
      <span class="ac-label">SHOW BAND PLAN</span>
      <button
        class="ac-track"
        :class="{ 'is-on': on }"
        role="switch"
        :aria-checked="on"
        aria-label="Toggle band-plan strip on the waterfall"
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

const sdr = useSdrStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
const on = ref<boolean>(sdr.showBandPlan)

async function syncFromDb(): Promise<void> {
  await sdr.hydrateShowBandPlanFromDb()
  on.value = sdr.showBandPlan
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
  sdr.setShowBandPlan(on.value)
  emit('stage', () => settingsApi.put('sdr', 'showBandPlan', on.value))
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
  gap: 10px;
}
.ac-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--sp-text-dim, #6b7789);
}
.ac-track {
  position: relative;
  width: 36px;
  height: 18px;
  border-radius: 9px;
  border: 1.5px solid #8a95a3;
  background: #f0f2f5;
  cursor: pointer;
  padding: 0;
  transition:
    background 0.15s,
    border-color 0.15s;
}
@media (prefers-reduced-motion: reduce) {
  .ac-track {
    transition: none;
  }
}
.ac-track.is-on {
  background: #c8ff00;
  border-color: #4d6800;
}
.ac-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #6b7785;
  transition:
    left 0.15s,
    background 0.15s;
}
@media (prefers-reduced-motion: reduce) {
  .ac-thumb {
    transition: none;
  }
}
.ac-track.is-on .ac-thumb {
  background: #2d3a00;
  left: 20px;
}
</style>
