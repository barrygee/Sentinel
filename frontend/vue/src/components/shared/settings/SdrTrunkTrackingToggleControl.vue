<template>
  <div class="ac-wrap">
    <div class="ac-row">
      <span class="ac-label">ENABLE TRUNK TRACKING</span>
      <button
        class="ac-track"
        :class="{ 'is-on': on }"
        role="switch"
        :aria-checked="on"
        aria-label="Toggle trunk tracking"
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

const sdrStore = useSdrStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
const on = ref<boolean>(sdrStore.trunkTrackingEnabled)

async function syncFromDb(): Promise<void> {
  const data = await settingsApi.getNamespace('sdr')
  const value = data?.trunkTrackingEnabled
  if (typeof value === 'boolean') {
    sdrStore.setTrunkTrackingEnabled(value)
    on.value = value
  }
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
  // Only reflect the local switch position now; the live store change (which
  // shows/hides the TRUNK SYSTEM section in the SDR panel and the Trunk Channel
  // Maps config row) and the DB write are deferred until APPLY CHANGES.
  const next = on.value
  emit('stage', () => {
    sdrStore.setTrunkTrackingEnabled(next)
    return settingsApi.put('sdr', 'trunkTrackingEnabled', next)
  })
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
