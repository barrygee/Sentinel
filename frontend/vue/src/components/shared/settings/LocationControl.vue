<template>
  <div class="settings-location-wrap">
    <div class="settings-location-row">
      <span class="settings-location-label">LAT</span>
      <input
        v-model="latValue"
        type="text"
        class="settings-location-input"
        placeholder="0.000"
        spellcheck="false"
        @input="onInput"
        @keydown.enter="emit('commit')"
      >
    </div>
    <div class="settings-location-row">
      <span class="settings-location-label">LON</span>
      <input
        v-model="lonValue"
        type="text"
        class="settings-location-input"
        placeholder="0.000"
        spellcheck="false"
        @input="onInput"
        @keydown.enter="emit('commit')"
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as settingsApi from '@/services/settingsApi'

const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const STORAGE_KEY = 'sentinel_user_location'
const latValue = ref('')
const lonValue = ref('')

try {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    const loc = JSON.parse(raw) as { latitude?: number; longitude?: number; lon?: number; lat?: number }
    const lat = loc.latitude ?? loc.lat
    const lon = loc.longitude ?? loc.lon
    if (lat != null) latValue.value = lat.toFixed(5)
    if (lon != null) lonValue.value = lon.toFixed(5)
  }
} catch {}

onMounted(async () => {
  // If localStorage already has a manually-set location, that's the source of truth —
  // don't overwrite it with a stale server value (right-click set-location bypasses the backend).
  let hasManual = false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { manual?: boolean }
      hasManual = saved.manual === true
    }
  } catch {}
  if (hasManual) return

  const data = await settingsApi.getNamespace('app')
  if (data?.location) {
    const loc = data.location as { latitude?: number; longitude?: number }
    if (!latValue.value && loc.latitude != null) latValue.value = loc.latitude.toFixed(5)
    if (!lonValue.value && loc.longitude != null) lonValue.value = loc.longitude.toFixed(5)
    if (loc.latitude != null && loc.longitude != null) {
      window.dispatchEvent(new CustomEvent('sentinel:setUserLocation', {
        detail: { longitude: loc.longitude, latitude: loc.latitude, persist: false },
      }))
    }
  }
})

function onInput(): void {
  const lat = parseFloat(latValue.value)
  const lon = parseFloat(lonValue.value)
  if (!isNaN(lat) && lat >= -90 && lat <= 90 && !isNaN(lon) && lon >= -180 && lon <= 180) {
    window.dispatchEvent(new CustomEvent('sentinel:setUserLocation', { detail: { longitude: lon, latitude: lat } }))
  }
  emit('stage', () => {
    const lat = parseFloat(latValue.value)
    const lon = parseFloat(lonValue.value)
    if (isNaN(lat) || lat < -90 || lat > 90) throw new Error('INVALID LAT')
    if (isNaN(lon) || lon < -180 || lon > 180) throw new Error('INVALID LON')
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ longitude: lon, latitude: lat, ts: Date.now(), manual: true })) } catch {}
    settingsApi.put('app', 'location', { latitude: lat, longitude: lon })
  })
}

function onLocationSynced(e: Event): void {
  const { longitude, latitude } = (e as CustomEvent).detail as { longitude: number; latitude: number }
  latValue.value = latitude.toFixed(5)
  lonValue.value = longitude.toFixed(5)
}

window.addEventListener('settings:locationSynced', onLocationSynced)
onUnmounted(() => window.removeEventListener('settings:locationSynced', onLocationSynced))
</script>
