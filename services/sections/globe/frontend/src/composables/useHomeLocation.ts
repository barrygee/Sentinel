import { onMounted, ref, type Ref } from 'vue'
import { getNamespace } from '@sentinel/shell-api/services/settingsApi'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import { useWindowEvent } from '@sentinel/ui/composables/useWindowEvent'
import type { LatLon } from '../globe/geo'

/**
 * Where the operator is, for the globe's start view and home marker.
 *
 * The flat maps keep the live location in map-kit's `useUserLocation`, which a
 * remote without MapLibre (this one) may not import. So the globe reads the
 * same sources directly, read-only:
 *   1. the `app.location` setting (Settings › My Location), re-read when
 *      settings are applied (`sentinel:config-uploaded`);
 *   2. otherwise the location the maps last saved in this browser
 *      (`sentinel_user_location`, a GPS fix or a right-click "set location");
 * and follows `sentinel:setUserLocation`, which the maps fire on every change.
 */

/** The maps' saved-location key (map-kit `useUserLocation`). */
const SAVED_LOCATION_KEY = 'sentinel_user_location'

function validLocation(lat: unknown, lon: unknown): LatLon | null {
  const latitude = Number.parseFloat(String(lat))
  const longitude = Number.parseFloat(String(lon))
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { lat: latitude, lon: longitude }
}

function savedLocation(): LatLon | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SAVED_LOCATION_KEY) ?? 'null')
    if (typeof saved !== 'object' || saved === null) return null
    const { latitude, longitude } = saved as { latitude?: unknown; longitude?: unknown }
    return validLocation(latitude, longitude)
  } catch {
    return null
  }
}

async function configuredLocation(): Promise<LatLon | null> {
  const app = await getNamespace('app')
  const location = app?.location as { latitude?: unknown; longitude?: unknown } | null | undefined
  return location ? validLocation(location.latitude, location.longitude) : null
}

/**
 * The operator's location, or null while none is known. Call from a
 * component's setup.
 */
export function useHomeLocation(): Ref<LatLon | null> {
  const home = ref<LatLon | null>(savedLocation())

  const refresh = async (): Promise<void> => {
    const configured = await configuredLocation()
    if (configured) home.value = configured
  }

  onMounted(() => void refresh())
  useDocumentEvent('sentinel:config-uploaded', () => void refresh())
  useWindowEvent('sentinel:setUserLocation', (event: CustomEvent) => {
    const detail = (event.detail ?? {}) as { latitude?: unknown; longitude?: unknown }
    const moved = validLocation(detail.latitude, detail.longitude)
    if (moved) home.value = moved
  })
  return home
}
