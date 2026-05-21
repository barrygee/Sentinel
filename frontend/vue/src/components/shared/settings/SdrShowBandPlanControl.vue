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
      ><span class="ac-thumb"></span></button>
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
.ac-wrap { display: flex; flex-direction: row; align-items: center; gap: 20px; flex-wrap: wrap; }
.ac-row { display: flex; align-items: center; gap: 10px; }
.ac-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}
.ac-track {
  position: relative;
  width: 36px;
  height: 18px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, border-color 0.15s;
}
.ac-track.is-on { background: rgba(200, 255, 0, 0.2); border-color: rgba(200, 255, 0, 0.6); }
.ac-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  transition: left 0.15s, background 0.15s;
}
.ac-track.is-on .ac-thumb { background: #c8ff00; left: 20px; }
</style>
