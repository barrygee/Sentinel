import { ref } from 'vue'
import * as settingsApi from '@/services/settingsApi'
import { isValidLatLon } from '@/utils/locationUtils'

export interface UserLocation {
  lat: number
  lon: number
  accuracy: number
}

const LOCATION_LS_KEY = 'sentinel_user_location'
const GPS_EXPIRY_MS   = 5 * 60 * 1000
// watchPosition fires every few seconds; persist the GPS fix to the config
// DB at most once per minute (the fields still update live every tick).
const GPS_PERSIST_INTERVAL_MS = 60 * 1000
let _lastGpsPersistMs = 0

function _loadFromStorage(): UserLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_LS_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as { longitude: number; latitude: number; ts: number; manual?: boolean }
    if (!saved.longitude || !saved.latitude) return null
    if (!saved.manual && Date.now() - (saved.ts || 0) > GPS_EXPIRY_MS) return null
    return { lon: saved.longitude, lat: saved.latitude, accuracy: 0 }
  } catch { return null }
}

// Module-level shared state — all callers see the same location.
const sharedLocation = ref<UserLocation | null>(_loadFromStorage())
// True when we have no location AND browser geolocation can't provide one
// (permission denied / position unavailable). Drives the App-level hint so
// the silent "no marker" state is explained rather than mysterious.
const locationUnavailable = ref(false)
let _watchId: number | null = null
let _manualOverride = (() => {
  try {
    const raw = localStorage.getItem(LOCATION_LS_KEY)
    if (!raw) return false
    return (JSON.parse(raw) as { manual?: boolean }).manual === true
  } catch { return false }
})()

function _saveToStorage(loc: UserLocation, manual: boolean): void {
  try {
    localStorage.setItem(LOCATION_LS_KEY, JSON.stringify({
      longitude: loc.lon, latitude: loc.lat,
      ts: Date.now(), manual,
    }))
  } catch {}
}

/** Drop any stored/in-memory location so the GPS watch can take over.
 * State only — visual teardown is driven by the sentinel:userLocationCleared
 * event (maps listen for it). Dispatch that event to trigger a clear; this
 * function is the listener's effect and must not re-dispatch (would loop). */
function _clearStoredLocation(): void {
  try { localStorage.removeItem(LOCATION_LS_KEY) } catch {}
  _manualOverride = false
  sharedLocation.value = null
}

// Single authoritative "location is gone" signal. Anything that clears the
// location (config-textarea clear, Settings input clear, hydrateFromConfig)
// dispatches sentinel:userLocationCleared; this updates composable state
// while AirMap/SpaceMap drop the marker + overlays off the same event. One
// event keeps state and visuals from diverging regardless of fire ordering.
window.addEventListener('sentinel:userLocationCleared', () => {
  _clearStoredLocation()
})

window.addEventListener('sentinel:setUserLocation', (e: Event) => {
  const { longitude, latitude, persist, manual } = (e as CustomEvent).detail as { longitude: number; latitude: number; persist?: boolean; manual?: boolean }
  // Config hydration passes manual:false so a later GPS fix can still update;
  // UI/right-click sets (the default) are a manual override that wins over GPS.
  const isManual = manual !== false
  const loc: UserLocation = { lon: longitude, lat: latitude, accuracy: 0 }
  sharedLocation.value = loc
  locationUnavailable.value = false // we now have a location
  _saveToStorage(loc, isManual)
  if (isManual) _manualOverride = true
  // Keep the Settings > My Location LAT/LON inputs in sync with any set
  // (right-click, config hydration, etc.) — LocationControl listens for this.
  window.dispatchEvent(new CustomEvent('settings:locationSynced', {
    detail: { longitude, latitude },
  }))
  if (persist !== false) {
    // Persist to backend so opening Settings later doesn't overwrite with stale server value.
    fetch('/api/settings/app/location', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: { latitude, longitude } }),
    }).catch(() => {})
  }
})

function _startWatch(highAccuracy: boolean): void {
  _watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (_manualOverride) return
      const loc: UserLocation = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }
      sharedLocation.value = loc
      locationUnavailable.value = false
      _saveToStorage(loc, false)
      // Keep the Settings > My Location LAT/LON inputs in sync on every tick
      // (cheap, local — LocationControl listens for this).
      window.dispatchEvent(new CustomEvent('settings:locationSynced', {
        detail: { longitude: loc.lon, latitude: loc.lat },
      }))
      // Persist the GPS fix to the config DB, throttled to once per minute so
      // watchPosition's frequent ticks don't spam the backend.
      const nowMs = Date.now()
      if (nowMs - _lastGpsPersistMs >= GPS_PERSIST_INTERVAL_MS) {
        _lastGpsPersistMs = nowMs
        fetch('/api/settings/app/location', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: { latitude: loc.lat, longitude: loc.lon } }),
        }).catch(() => {})
      }
    },
    (err) => {
      if (err.code === err.TIMEOUT && highAccuracy) {
        // High-accuracy GPS timed out (common on desktop) — retry with network location.
        if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null }
        _startWatch(false)
        return
      }
      // Permission denied, position unavailable, or the network-location
      // retry also failed. If we still have no location, flag it so the
      // App-level hint can explain the empty map.
      if (!sharedLocation.value) locationUnavailable.value = true
    },
    { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 10000 : 30000, maximumAge: 5000 },
  )
}

function startGps(): void {
  if (_watchId !== null) return
  if (!navigator.geolocation) {
    // No geolocation API (insecure context / unsupported). Nothing can
    // provide a fix — surface the hint if we have no location.
    if (!sharedLocation.value) locationUnavailable.value = true
    return
  }
  _startWatch(true)
}

/**
 * Reconcile the marker with the config-provided `app.location` setting on
 * startup. The config is authoritative for whether a fixed location exists:
 *
 *  - Valid config location → seed the marker (saved `manual: false` so a
 *    later GPS fix may still update it — "config initial, GPS can update").
 *  - Config location explicitly empty/unset → clear any stale stored
 *    location (including a previous right-click manual override) so the
 *    browser geolocation watch takes over. This is what makes "clear the
 *    config, reload" fall back to GPS instead of pinning the old marker.
 *  - Config missing entirely / unreachable → leave stored state untouched
 *    (offline-friendly; preserves a genuine manual override).
 */
async function hydrateFromConfig(): Promise<void> {
  const data = await settingsApi.getNamespace('app')
  if (!data || !('location' in data)) return // no config key — don't disturb stored state
  const loc = data.location as { latitude?: unknown; longitude?: unknown } | null | undefined

  const lat = parseFloat(String(loc?.latitude))
  const lon = parseFloat(String(loc?.longitude))

  if (isValidLatLon(lat, lon)) {
    if (_manualOverride) return // a genuine in-session manual set wins over config
    window.dispatchEvent(new CustomEvent('sentinel:setUserLocation', {
      detail: { longitude: lon, latitude: lat, persist: false, manual: false },
    }))
    return
  }

  // Config location is present but empty/invalid → it has been explicitly
  // cleared. Fire the one authoritative clear signal: the composable listener
  // discards stored/in-memory state and the maps drop the marker + overlays,
  // regardless of watcher-fire ordering on reload.
  window.dispatchEvent(new CustomEvent('sentinel:userLocationCleared'))
}

export function useUserLocation() {
  return { location: sharedLocation, locationUnavailable, start: startGps, hydrateFromConfig }
}
