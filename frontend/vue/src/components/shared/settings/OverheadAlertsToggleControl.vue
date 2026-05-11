<template>
  <div class="settings-connectivity-wrap">
    <div class="settings-connectivity-switch">
      <span class="settings-connectivity-label">{{ enabled ? 'ENABLED' : 'DISABLED' }}</span>
      <button
        class="settings-connectivity-track"
        :class="{ 'is-online': enabled }"
        role="switch"
        :aria-checked="enabled"
        aria-label="Toggle overhead aircraft alerts"
        @click="toggle"
      ><span class="settings-connectivity-thumb"></span></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAirStore } from '@/stores/air'

const airStore = useAirStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const enabled = ref<boolean>(airStore.overlayStates.overheadAlerts)

function toggle(): void {
  enabled.value = !enabled.value
  const next = enabled.value
  emit('stage', () => {
    airStore.setOverlay('overheadAlerts', next)
  })
}
</script>
