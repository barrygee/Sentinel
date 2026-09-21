import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { usePersistedObject, usePersistedRef } from './_persist'
import * as settingsApi from '@/services/settingsApi'

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

/**
 * Which fields a station's map label shows. Every field an APRS position report
 * can carry is switchable, mirroring the Air domain's per-aircraft label fields
 * — the map stays readable at density because the operator decides what matters.
 */
export interface AprsLabelFieldMap {
  time: boolean
  callsign: boolean
  /** The station's icon in the label's leading well (symbol glyph, or the
   *  course arrow when the station reports one). */
  symbol: boolean
  /** The symbol's name as a text chip, e.g. "CAR" — independent of the icon. */
  symbolText: boolean
  latitude: boolean
  longitude: boolean
  course: boolean
  speed: boolean
  altitude: boolean
  path: boolean
  comment: boolean
}

/** A valid key of {@link AprsLabelFieldMap}. */
export type AprsLabelField = keyof AprsLabelFieldMap

/**
 * The Land map's data layers. Exactly one is drawn at a time — chosen from the
 * sidebar's tabs beneath FILTER, or Settings › LAND › Map Layers — because each
 * layer is hundreds to thousands of DOM markers and stacking them buries the
 * map. Order is the fallback priority when a saved config lists several.
 */
export const LAND_LAYERS = ['aprs', 'trafficCameras', 'repeaters'] as const
export type LandLayer = (typeof LAND_LAYERS)[number]

export function isLandLayer(value: unknown): value is LandLayer {
  return (LAND_LAYERS as readonly unknown[]).includes(value)
}

const LS_APRS_LABEL_FIELDS_KEY = 'aprsLabelFields_v1'

/** Icon + callsign only, matching what the map showed before the fields were
 *  switchable — an upgrade never changes what an existing user sees. */
const DEFAULT_APRS_LABEL_FIELDS: AprsLabelFieldMap = {
  time: false,
  callsign: true,
  symbol: true,
  symbolText: false,
  latitude: false,
  longitude: false,
  course: false,
  speed: false,
  altitude: false,
  path: false,
  comment: false,
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
/** Fallback retention shown in Settings until the DB value hydrates (minutes). */
const DEFAULT_APRS_RETENTION_MINUTES = 5
/**
 * Fallback APRS channel shown in Settings until the DB value hydrates (MHz).
 * 144.800 is the 2 m APRS channel in Europe/UK; mirrors the backend's
 * `aprs_channel_hz` default.
 */
const DEFAULT_APRS_CHANNEL_MHZ = 144.8

export const useLandStore = defineStore('land', () => {
  const aprsStations = ref<AprsStation[]>([])

  // How long a heard station is retained on the map (minutes). Backend-enforced;
  // this mirror exists only so the Settings control can read/edit it.
  const aprsRetentionMinutes = ref<number>(DEFAULT_APRS_RETENTION_MINUTES)
  function setAprsRetentionMinutes(minutes: number): void {
    aprsRetentionMinutes.value = minutes
  }

  // The APRS channel the decode bridge keeps its radio on (MHz). Backend-owned
  // (`land/aprsChannelHz`, tuned by the bridge itself); this mirror exists only
  // so the Settings control can read/edit it.
  const aprsChannelMhz = ref<number>(DEFAULT_APRS_CHANNEL_MHZ)
  function setAprsChannelMhz(megahertz: number): void {
    aprsChannelMhz.value = megahertz
  }

  // Which data fields appear on APRS map labels. Persisted locally for instant
  // restore and mirrored to the backend by the Settings control, so the choice
  // follows the user across devices (see main.ts for the startup hydrate).
  const aprsLabelFields = usePersistedObject<AprsLabelFieldMap>(
    LS_APRS_LABEL_FIELDS_KEY,
    DEFAULT_APRS_LABEL_FIELDS,
  )
  function setAprsLabelFields(fields: AprsLabelFieldMap): void {
    aprsLabelFields.value = fields
  }

  // Whether each layer is currently shown. Held here rather than inside the map
  // controls so the side panel can show exactly what the map shows: hiding a
  // layer empties its list too, instead of leaving it listing things that are
  // no longer plotted. Only one is ever true (see `selectLayer`); the flags
  // stay separate because each map control owns one of them. They start off
  // and `hydrateDefaultLayers` lights whichever the persisted config names.
  const aprsLayerVisible = ref(false)
  function setAprsLayerVisible(visible: boolean): void {
    aprsLayerVisible.value = visible
  }

  const trafficCamerasLayerVisible = ref(false)
  function setTrafficCamerasLayerVisible(visible: boolean): void {
    trafficCamerasLayerVisible.value = visible
  }

  // The UK repeater directory itself lives in the `repeaters` store.
  const repeatersLayerVisible = ref(false)
  function setRepeatersLayerVisible(visible: boolean): void {
    repeatersLayerVisible.value = visible
  }

  /** The layer currently drawn, or null when none is (e.g. APRS with no receiver). */
  const activeLayer = computed<LandLayer | null>(() => {
    if (aprsLayerVisible.value) return 'aprs'
    if (trafficCamerasLayerVisible.value) return 'trafficCameras'
    if (repeatersLayerVisible.value) return 'repeaters'
    return null
  })

  /** Show exactly this layer (the others go off) — the sidebar tabs and the
   *  Settings picker both come through here. */
  function selectLayer(layer: LandLayer): void {
    aprsLayerVisible.value = layer === 'aprs'
    trafficCamerasLayerVisible.value = layer === 'trafficCameras'
    repeatersLayerVisible.value = layer === 'repeaters'
  }

  // SEARCH pane (LandFilter). Held on the store rather than in the teleported
  // pane, whose mount timing is fragile — this way the pane resumes exactly as
  // left when returning to Land, and a map click can expand a row before the
  // pane has even rendered.
  const searchQuery = usePersistedRef<string>('sentinel_land_filterQuery', '')
  const searchExpandedCallsign = usePersistedRef<string>('sentinel_land_filterExpanded', '')
  function setSearchQuery(query: string): void {
    searchQuery.value = query
  }
  function setSearchExpandedCallsign(callsign: string): void {
    searchExpandedCallsign.value = callsign
  }

  // Which map layer is shown by default (from the `land.defaultLayers` config —
  // a list for compatibility with the other domains, but at most one entry).
  const defaultLayers = ref<string[]>(['repeaters'])
  async function hydrateDefaultLayers(): Promise<void> {
    try {
      const res = await fetch('/api/settings/land')
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data?.defaultLayers)) {
        defaultLayers.value = narrowToOneLayer(data.defaultLayers as unknown[])
      }
    } catch {
      /* offline / transient — keep the default */
    }
  }

  /**
   * A saved list may name several layers (older configs did); keep only the
   * first known one, in `LAND_LAYERS` priority order, so the map never draws
   * more than one layer whatever the file says.
   */
  function narrowToOneLayer(layers: unknown[]): string[] {
    const chosen = LAND_LAYERS.find((layer) => layers.includes(layer))
    return chosen ? [chosen] : []
  }

  /**
   * The `land.defaultLayers` list the current flags describe — read by
   * `LandMapLayersControl` when it stages a choice as the new persisted
   * default, mirroring `useSeaStore.currentDefaultLayers()`.
   */
  function currentDefaultLayers(): string[] {
    return activeLayer.value ? [activeLayer.value] : []
  }

  /**
   * Save the current flags as `land.defaultLayers` straight away — the
   * sidebar's layer tabs call this, so a toggle made on the map is what every
   * device (and the app-config JSON) sees, without an APPLY step.
   */
  function persistDefaultLayers(): Promise<void> {
    return settingsApi.put('land', 'defaultLayers', currentDefaultLayers())
  }

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
    aprsRetentionMinutes,
    setAprsRetentionMinutes,
    aprsChannelMhz,
    setAprsChannelMhz,
    aprsLabelFields,
    setAprsLabelFields,
    aprsLayerVisible,
    setAprsLayerVisible,
    trafficCamerasLayerVisible,
    setTrafficCamerasLayerVisible,
    repeatersLayerVisible,
    setRepeatersLayerVisible,
    activeLayer,
    selectLayer,
    searchQuery,
    setSearchQuery,
    searchExpandedCallsign,
    setSearchExpandedCallsign,
    defaultLayers,
    hydrateDefaultLayers,
    currentDefaultLayers,
    persistDefaultLayers,
    fetchAprsStations,
    startAprsPolling,
    stopAprsPolling,
  }
})
