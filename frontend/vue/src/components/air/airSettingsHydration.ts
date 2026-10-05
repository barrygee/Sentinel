import { useAirStore, type AdsbTagFields } from '@/stores/air'
import type { AllSettings } from '@sentinel/shell-api/shell/settingsHydration'

/** The aircraft label fields a fresh install starts with. */
const DEFAULT_LABEL_DATA_POINTS = {
  civil: {
    callsign: true,
    altitude: false,
    speed: false,
    heading: false,
    aircraftType: false,
    registration: false,
    squawk: false,
    category: false,
  },
  mil: {
    callsign: true,
    altitude: false,
    speed: false,
    heading: false,
    aircraftType: true,
    registration: false,
    squawk: false,
    category: false,
  },
}

/**
 * Air's boot hydration (moved out of `main.ts`, F1): the map overlays
 * (Settings › AIR › Map Layers) and the aircraft label fields, adopted from
 * the config so a choice made in the app-config JSON or on another device is
 * what the map draws from the first frame.
 */
export function hydrateAirFromSettings(settings: AllSettings): void {
  const airStore = useAirStore()
  airStore.hydrateMapLayers(settings.air?.mapLayers)

  const remote = settings.air?.labelDataPoints as AdsbTagFields | undefined
  if (
    remote &&
    typeof remote === 'object' &&
    !Array.isArray(remote) &&
    typeof remote.civil === 'object' &&
    typeof remote.mil === 'object'
  ) {
    airStore.setAdsbTagFields({
      civil: { ...DEFAULT_LABEL_DATA_POINTS.civil, ...(remote.civil as object) },
      mil: { ...DEFAULT_LABEL_DATA_POINTS.mil, ...(remote.mil as object) },
    })
  } else {
    // Seed labelDataPoints into the DB if not yet stored.
    fetch('/api/settings/air/labelDataPoints', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: DEFAULT_LABEL_DATA_POINTS }),
    }).catch(() => {})
  }
}
