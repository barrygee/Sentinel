/**
 * Live telemetry for the expanded aircraft row in the Air FILTER pane.
 *
 * The formatted values are held apart from the raw feed so that when the
 * aircraft drops out of coverage the accordion keeps its last-known values
 * (dimmed) and flags SIGNAL LOST, rather than blanking. After a grace window
 * with no return the row is closed, so a permanently lost aircraft doesn't
 * linger at the top of the list forever.
 *
 * SIGNAL LOST is only raised for an aircraft that has been seen live since it
 * was expanded. A selection restored from the store (on opening Air) is absent
 * until the first feed update lands, which is loading, not a lost signal — so
 * it reports `awaitingData` instead, and there are no last-known values to show.
 */
import { onUnmounted, ref, type Ref, type WritableComputedRef } from 'vue'
import { formatAircraftLiveData } from './aircraftTelemetryFormat'
import {
  EMPTY_AIRCRAFT_DATA,
  type AircraftFeature,
  type AircraftLiveData,
  type PlaneResult,
} from './airFilterTypes'

/** Long enough to ride out a brief dropout. */
export const SIGNAL_LOST_GRACE_MS = 15000

/**
 * @param expandedPlane         Hex of the expanded aircraft, null when none.
 * @param expandedPlaneSnapshot Its last-known row, cleared when nothing is expanded.
 * @param aircraftFeatures      The live ADS-B features.
 */
export function useExpandedAircraftTelemetry(
  expandedPlane: WritableComputedRef<string | null>,
  expandedPlaneSnapshot: WritableComputedRef<PlaneResult | null>,
  aircraftFeatures: Ref<AircraftFeature[]>,
) {
  /** Always a full object (placeholder when nothing is expanded) so the
   *  accordion reads fields directly without null-guards. */
  const liveAircraftData = ref<AircraftLiveData>({ ...EMPTY_AIRCRAFT_DATA })
  /** True when the expanded aircraft has dropped out of the live feed after
   *  being seen in it. */
  const signalLost = ref(false)
  /** True while the expanded aircraft has not yet been seen in the feed. */
  const awaitingData = ref(false)
  /** Hex of the expanded aircraft once it has appeared in the feed; tells a
   *  real dropout apart from a restored selection whose data hasn't loaded. */
  let liveSightedHex: string | null = null
  let signalLostTimer: ReturnType<typeof setTimeout> | null = null

  function clearSignalLostTimer() {
    if (signalLostTimer !== null) {
      clearTimeout(signalLostTimer)
      signalLostTimer = null
    }
  }

  /** Refresh from the latest feed: keep the last-known values and flag SIGNAL
   *  LOST when the aircraft is no longer present. */
  function refreshExpandedPlane() {
    const hex = expandedPlane.value
    if (!hex) {
      liveAircraftData.value = { ...EMPTY_AIRCRAFT_DATA }
      expandedPlaneSnapshot.value = null
      signalLost.value = false
      awaitingData.value = false
      liveSightedHex = null
      clearSignalLostTimer()
      return
    }
    const feature = aircraftFeatures.value.find((candidate) => candidate.properties.hex === hex)
    if (feature) liveSightedHex = hex
    const seenLive = liveSightedHex === hex
    signalLost.value = !feature && seenLive
    awaitingData.value = !feature && !seenLive
    if (feature) {
      // Live again: refresh values and cancel any pending removal.
      liveAircraftData.value = formatAircraftLiveData(feature)
      clearSignalLostTimer()
    } else if (signalLostTimer === null) {
      // Absent: keep any last-known values, and schedule removal of the row if
      // the aircraft doesn't (re)appear within the grace window. This also
      // closes a restored selection that never shows up once data loads.
      signalLostTimer = setTimeout(() => {
        signalLostTimer = null
        expandedPlane.value = null
        refreshExpandedPlane()
      }, SIGNAL_LOST_GRACE_MS)
    }
  }

  onUnmounted(clearSignalLostTimer)

  return { liveAircraftData, signalLost, awaitingData, refreshExpandedPlane }
}
