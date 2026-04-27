import { ref } from 'vue'

export interface UserLocation {
  lat: number
  lon: number
  accuracy: number
}

const LOCATION_LS_KEY = 'sentinel_user_location'
const GPS_EXPIRY_MS   = 5 * 60 * 1000

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
let _watchId: number | null = null

function _saveToStorage(loc: UserLocation, manual: boolean): void {
  try {
    localStorage.setItem(LOCATION_LS_KEY, JSON.stringify({
      longitude: loc.lon, latitude: loc.lat,
      ts: Date.now(), manual,
    }))
  } catch {}
}

window.addEventListener('sentinel:setUserLocation', (e: Event) => {
  const { longitude, latitude } = (e as CustomEvent).detail as { longitude: number; latitude: number }
  const loc: UserLocation = { lon: longitude, lat: latitude, accuracy: 0 }
  sharedLocation.value = loc
  _saveToStorage(loc, true)
})

function _startWatch(highAccuracy: boolean): void {
  _watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const loc: UserLocation = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }
      sharedLocation.value = loc
      _saveToStorage(loc, false)
    },
    (err) => {
      if (err.code === err.TIMEOUT && highAccuracy) {
        // High-accuracy GPS timed out (common on desktop) — retry with network location.
        if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null }
        _startWatch(false)
      } else {
        console.warn('[useUserLocation] GPS error:', err.message)
      }
    },
    { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 10000 : 30000, maximumAge: 5000 },
  )
}

function startGps(): void {
  if (_watchId !== null) return
  if (!navigator.geolocation) return
  _startWatch(true)
}

export function useUserLocation() {
  return { location: sharedLocation, start: startGps }
}
