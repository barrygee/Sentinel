<template>
  <div class="oar-wrap">
    <input
      v-model="radiusInput"
      type="text"
      inputmode="numeric"
      class="oar-input"
      :class="{ 'oar-input--invalid': !isValid }"
      spellcheck="false"
      autocomplete="off"
      @input="onInput"
      @keydown.enter="emit('commit')"
    >
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
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v as OverheadAlertsConfig : {}
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
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}
.oar-input {
  width: 70px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #fff;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-align: right;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}
.oar-input:focus {
  border-color: rgba(200, 255, 0, 0.6);
  background: rgba(255, 255, 255, 0.06);
}
.oar-input--invalid {
  border-color: rgba(255, 80, 80, 0.6);
}
</style>
