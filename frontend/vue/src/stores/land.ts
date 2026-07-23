import { defineStore } from 'pinia'
import { ref } from 'vue'

/** One APRS station's latest fix, as returned by GET /api/land/aprs/stations. */
export interface AprsStation {
  callsign: string
  latitude: number
  longitude: number
  symbol: string | null
  comment: string | null
  course: number | null
  speed: number | null
  altitude: number | null
  path: string | null
  raw: string | null
  last_heard_ms: number
}

/** How often the Land map refreshes the APRS station snapshot (ms). APRS is a
 *  low-rate beacon mode, so a few-second poll is ample and cheap. */
const APRS_POLL_INTERVAL_MS = 5000

/**
 * Land domain store — holds the APRS stations plotted on the Land map.
 *
 * Stations are populated server-side by the APRS decode ingest path and exposed
 * as a snapshot the map polls (mirroring the ADS-B cache→REST delivery model);
 * the live waterfall panels use the SDR decode WebSocket separately. Polling is
 * ref-counted so the map view can start it on mount and stop it on unmount
 * without clobbering another consumer.
 */
export const useLandStore = defineStore('land', () => {
  const aprsStations = ref<AprsStation[]>([])

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollers = 0

  /** Fetch the current station snapshot, replacing the held list. Silent on
   *  transient/offline failures — the last-known list simply persists. */
  async function fetchAprsStations(): Promise<void> {
    try {
      const res = await fetch('/api/land/aprs/stations')
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data?.stations)) aprsStations.value = data.stations as AprsStation[]
    } catch {
      /* offline / transient — keep the current list */
    }
  }

  /** Begin polling the station snapshot (ref-counted). The first caller fetches
   *  immediately and starts the interval; later callers just increment the count. */
  function startAprsPolling(): void {
    pollers += 1
    if (pollTimer !== null) return
    void fetchAprsStations()
    pollTimer = setInterval(() => void fetchAprsStations(), APRS_POLL_INTERVAL_MS)
  }

  /** Stop polling when the last consumer leaves (ref-counted). */
  function stopAprsPolling(): void {
    pollers = Math.max(0, pollers - 1)
    if (pollers > 0 || pollTimer === null) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  return {
    aprsStations,
    fetchAprsStations,
    startAprsPolling,
    stopAprsPolling,
  }
})
