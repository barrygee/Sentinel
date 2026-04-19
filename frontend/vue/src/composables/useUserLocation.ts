import { ref, onUnmounted } from 'vue'

export interface UserLocation {
  lat: number
  lon: number
  accuracy: number
}

export function useUserLocation() {
  const location = ref<UserLocation | null>(null)
  const error = ref<string | null>(null)
  let watchId: number | null = null

  function start() {
    if (!navigator.geolocation) { error.value = 'Geolocation not supported'; return }
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        location.value = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }
        error.value = null
      },
      (err) => { error.value = err.message },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    )
  }

  function stop() {
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null }
  }

  onUnmounted(stop)

  return { location, error, start, stop }
}
