import { ref, type Ref } from 'vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import type { SkyPoint } from '../spacePassesUtils'

/** Formatted live fields of the expanded satellite, keyed lat / lon / hdg / alt / vel. */
export type SatelliteTelemetry = Record<string, string>

/** The position SatelliteControl reports on each poll ('sat-position-update'). */
interface SatellitePositionUpdate {
  noradId: string
  position: {
    alt_km: number
    velocity_kms: number
    track_deg: number
    lat: number
    lon: number
    az?: number
    el?: number
  }
}

/** What `useLiveSatelliteTelemetry` returns. */
export interface LiveSatelliteTelemetry {
  /** The expanded satellite's live fields; empty until its first update. */
  telemetry: Ref<SatelliteTelemetry>
  /** Its observer-relative look-angles, or null when the update carried none. */
  liveAzEl: Ref<SkyPoint | null>
  /** Forgets both, for an accordion that has just opened on another satellite. */
  reset: () => void
}

/**
 * Feeds an expanded satellite accordion from SatelliteControl's
 * 'sat-position-update' document events, which carry every selected
 * satellite's position. Updates for any other satellite are ignored.
 *
 * @param isExpandedSatellite whether an update's NORAD id belongs to the
 *   accordion that is open now (false while none is).
 */
export function useLiveSatelliteTelemetry(
  isExpandedSatellite: (noradId: string) => boolean,
): LiveSatelliteTelemetry {
  const telemetry = ref<SatelliteTelemetry>({})
  // Exact observer-relative look-angles for the live satellite, supplied by the
  // backend on each position poll. Null until the first annotated update arrives.
  const liveAzEl = ref<SkyPoint | null>(null)

  function onSatPositionUpdate(event: Event): void {
    const { noradId, position } = (event as CustomEvent<SatellitePositionUpdate>).detail
    if (!isExpandedSatellite(noradId)) return
    telemetry.value = {
      alt: `${position.alt_km} km`,
      vel: `${position.velocity_kms} km/s`,
      hdg: `${position.track_deg}°`,
      lat: `${position.lat}°`,
      lon: `${position.lon}°`,
    }
    // Use the backend-computed look-angles when present (exact); otherwise leave
    // the live marker off rather than guessing.
    liveAzEl.value =
      position.az != null && position.el != null ? { az: position.az, el: position.el } : null
  }

  function reset(): void {
    telemetry.value = {}
    liveAzEl.value = null
  }

  useDocumentEvent('sat-position-update', onSatPositionUpdate)

  return { telemetry, liveAzEl, reset }
}
