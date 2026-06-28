<template>
  <div class="oar-wrap">
    <input
      v-model="radiusInput"
      type="text"
      inputmode="numeric"
      class="oar-input"
      aria-label="Overhead alert radius in nautical miles"
      :class="{ 'oar-input--invalid': !isValid }"
      spellcheck="false"
      autocomplete="off"
      @input="onInput"
      @keydown.enter="emit('commit')"
    />
    <span class="oar-label">NM</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAirStore } from '@/stores/air'
import * as settingsApi from '@/services/settingsApi'

const airStore = useAirStore()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const radiusInput = ref<string>(String(airStore.overheadAlertRadiusNm))

const isValid = computed(() => {
  const v = radiusInput.value.trim()
  if (!v) return false
  if (!/^\d+(\.\d+)?$/.test(v)) return false
  const n = Number(v)
  return Number.isFinite(n) && n > 0
})

interface OverheadAlertsConfig {
  civil?: boolean
  mil?: boolean
  radiusNm?: number
}

function readOverhead(data: Record<string, unknown> | null): OverheadAlertsConfig {
  const v = data?.overheadAlerts
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as OverheadAlertsConfig) : {}
}

onMounted(async () => {
  const data = await settingsApi.getNamespace('air')
  const oa = readOverhead(data)
  const n = typeof oa.radiusNm === 'number' ? oa.radiusNm : Number(oa.radiusNm)
  if (Number.isFinite(n) && n > 0 && n !== airStore.overheadAlertRadiusNm) {
    airStore.setOverheadAlertRadiusNm(n)
    radiusInput.value = String(n)
  }
})

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement
  const filtered = target.value.replace(/[^0-9.]/g, '')
  if (filtered !== target.value) {
    target.value = filtered
    radiusInput.value = filtered
  }
  if (!isValid.value) return
  const n = Number(radiusInput.value)
  airStore.setOverheadAlertRadiusNm(n)
  emit('stage', () => {
    return settingsApi.put('air', 'overheadAlerts', {
      civil: airStore.overlayStates.overheadAlertsCivil,
      mil: airStore.overlayStates.overheadAlertsMil,
      radiusNm: airStore.overheadAlertRadiusNm,
    })
  })
}
</script>

<style scoped>
.oar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.oar-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(16, 19, 29, 0.5);
}
.oar-input {
  width: 74px;
  padding: 10px 12px;
  background: #eeece7;
  border: none;
  border-radius: 6px;
  color: rgba(16, 19, 29, 0.9);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-align: center;
  outline: none;
  transition: box-shadow 0.15s;
}
.oar-input:focus {
  box-shadow: inset 0 -2px 0 var(--color-accent);
}
.oar-input--invalid {
  box-shadow: inset 0 -2px 0 #d94436;
}
</style>
