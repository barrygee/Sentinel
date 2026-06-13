<template>
  <div class="settings-location-wrap">
    <div class="settings-location-row">
      <span class="settings-location-label">LAT</span>
      <input
        v-model="latValue"
        type="text"
        class="settings-location-input"
        aria-label="Latitude"
        placeholder="0.000"
        spellcheck="false"
        @input="onInput"
        @keydown.enter="emit('commit')"
      />
    </div>
    <div class="settings-location-row">
      <span class="settings-location-label">LON</span>
      <input
        v-model="lonValue"
        type="text"
        class="settings-location-input"
        aria-label="Longitude"
        placeholder="0.000"
        spellcheck="false"
        @input="onInput"
        @keydown.enter="emit('commit')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as settingsApi from '@/services/settingsApi'
import { isValidLatLon } from '@/utils/locationUtils'

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
    const loc = JSON.parse(raw) as {
      latitude?: number
      longitude?: number
      lon?: number
      lat?: number
    }
    const lat = loc.latitude ?? loc.lat
    const lon = loc.longitude ?? loc.lon
    if (lat != null) latValue.value = lat.toFixed(5)
    if (lon != null) lonValue.value = lon.toFixed(5)
  }
} catch {}

onMounted(async () => {
  // Show whatever the config currently holds. Reconciling the marker /
  // manual-override state with the config is owned by hydrateFromConfig()
  // in App.vue, so this only prefills the input fields (and only with a
  // valid pair — the "" unset form must leave the inputs blank so it
  // doesn't render as NaN or re-pin a cleared location).
  const data = await settingsApi.getNamespace('app')
  const loc = data?.location as { latitude?: unknown; longitude?: unknown } | undefined
  if (!loc) return
  const lat = parseFloat(String(loc.latitude))
  const lon = parseFloat(String(loc.longitude))
  if (isValidLatLon(lat, lon)) {
    if (!latValue.value) latValue.value = lat.toFixed(5)
    if (!lonValue.value) lonValue.value = lon.toFixed(5)
  } else {
    // Config explicitly cleared — clear the inputs too so the panel
    // reflects the unset state rather than a stale localStorage value.
    latValue.value = ''
    lonValue.value = ''
  }
})

// True only while we are dispatching our own set, so the resulting
// settings:locationSynced echo doesn't reformat the field the user is typing
// in (e.g. "54.9" → "54.90000" with a cursor jump). The event chain is
// synchronous, so the flag is reliably set across the round-trip.
let _selfSetting = false

function onInput(): void {
  const lat = parseFloat(latValue.value)
  const lon = parseFloat(lonValue.value)
  if (isValidLatLon(lat, lon)) {
    _selfSetting = true
    try {
      window.dispatchEvent(
        new CustomEvent('sentinel:setUserLocation', { detail: { longitude: lon, latitude: lat } }),
      )
    } finally {
      _selfSetting = false
    }
  }
  emit('stage', () => {
    const latStr = latValue.value.trim()
    const lonStr = lonValue.value.trim()
    // Both blank → "unset" location (backend accepts the empty-string form).
    // The one authoritative clear signal: useUserLocation's listener wipes
    // stored/in-memory state and the maps drop the marker + overlays.
    if (latStr === '' && lonStr === '') {
      window.dispatchEvent(new CustomEvent('sentinel:userLocationCleared'))
      return settingsApi.put('app', 'location', { latitude: '', longitude: '' })
    }
    const lat = parseFloat(latStr)
    const lon = parseFloat(lonStr)
    if (isNaN(lat) || lat < -90 || lat > 90) throw new Error('INVALID LAT')
    if (isNaN(lon) || lon < -180 || lon > 180) throw new Error('INVALID LON')
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ longitude: lon, latitude: lat, ts: Date.now(), manual: true }),
      )
    } catch {}
    return settingsApi.put('app', 'location', { latitude: lat, longitude: lon })
  })
}

function onLocationSynced(e: Event): void {
  if (_selfSetting) return // ignore the echo of our own typed value
  const { longitude, latitude } = (e as CustomEvent).detail as {
    longitude: number
    latitude: number
  }
  latValue.value = latitude.toFixed(5)
  lonValue.value = longitude.toFixed(5)
}

window.addEventListener('settings:locationSynced', onLocationSynced)
onUnmounted(() => window.removeEventListener('settings:locationSynced', onLocationSynced))
</script>
