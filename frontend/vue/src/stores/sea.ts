import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePersistedObject, usePersistedRef } from './_persist'
import { SEA_MAX_RENDER_ROWS, SEA_POLL_INTERVAL_MS, SEA_REFETCH_GUARD_MS } from '@/constants/sea'
import { isSeaFilterCategory, type SeaFilterCategory, type VesselFamily } from '@/utils/aisShipType'

/** One vessel's latest position report, as returned by GET /api/sea/vessels. */
export interface SeaVessel {
  mmsi: string
  name: string
  imo: string
  callsign: string
  /** Raw AIS ship-type code (string), or '' when the vessel has not sent static data. */
  type: string
  /** Human label for the type, e.g. "CARGO" — '' when unknown. */
  typeLabel: string
  family: VesselFamily
  destination: string
  lat: number
  lon: number
  /** Speed over ground in knots, null when not reported. */
  sog: number | null
  /** Course over ground in degrees, null when not reported. */
  cog: number | null
  /** True heading in degrees, null when not reported. */
  heading: number | null
  navStatus: number | null
  lastPositionMs: number
  lastPositionUtc: string
}

/** The feed's health as reported alongside every snapshot. */
export type SeaFeedStatus =
  | 'disabled'
  | 'no-source'
  | 'unsupported-source'
  | 'missing-key'
  | 'connecting'
  | 'live'
  | 'stale'
  | 'reconnecting'
  | 'down'
  | 'auth-failed'
  | 'unreachable'

/** Feed metadata carried by the snapshot response (everything but the rows). */
export interface SeaFeedInfo {
  status: SeaFeedStatus
  error: string | null
  source: string
  lastMessageAt: number | null
  silentForMs: number | null
  reconnectAttempt: number
  nextAttemptAt: number | null
  newestPositionAt: number | null
  vesselCount: number
}

/** A point on a vessel's recent path, from GET /api/sea/vessels/{mmsi}/track. */
export interface SeaTrackSample {
  lat: number
  lon: number
  /** Epoch seconds of the fix. */
  t: number
}

/** Sea-specific overlays. Base-map layers every domain shares (place names,
 *  roads) live on the `basemap` store instead. */
export interface SeaOverlayStates {
  vessels: boolean
  vesselLabels: boolean
  rangeRings: boolean
  /** Charted ferry routes from the base map, drawn dashed with their names. */
  ferryRoutes: boolean
  /** Known ports with their VHF working channels — the Sea map's airports. */
  ports: boolean
}

/**
 * Which fields a vessel's map label shows. Mirrors the Air/Land label-field
 * settings: the operator decides what the map carries at density.
 */
export interface SeaLabelFieldMap {
  name: boolean
  type: boolean
  mmsi: boolean
  /** The flag state, resolved from the MMSI's maritime identification digits. */
  flag: boolean
  destination: boolean
  speed: boolean
  course: boolean
}

/** A valid key of {@link SeaLabelFieldMap}. */
export type SeaLabelField = keyof SeaLabelFieldMap

const LS_OVERLAYS_KEY = 'seaOverlayStates_v2'
const LS_LABEL_FIELDS_KEY = 'seaLabelFields_v1'

const DEFAULT_OVERLAYS: SeaOverlayStates = {
  vessels: true,
  vesselLabels: true,
  rangeRings: false,
  ferryRoutes: true,
  ports: true,
}
const DEFAULT_LABEL_FIELDS: SeaLabelFieldMap = {
  name: true,
  type: false,
  mmsi: false,
  flag: false,
  destination: false,
  speed: false,
  course: false,
}
const DEFAULT_FEED: SeaFeedInfo = {
  status: 'connecting',
  error: null,
  source: 'AISStream',
  lastMessageAt: null,
  silentForMs: null,
  reconnectAttempt: 0,
  nextAttemptAt: null,
  newestPositionAt: null,
  vesselCount: 0,
}

/** A viewport as `[south, west, north, east]` degrees. */
export type SeaBbox = [number, number, number, number]

/**
 * Sea domain store — the live AIS vessel picture plus the map/pane state that
 * must survive teleport remounts and route changes.
 *
 * Vessels are populated by polling the backend snapshot (ref-counted, like the
 * Land store's APRS poll); the map control supplies the viewport bbox so each
 * request only carries what is on screen.
 */
export const useSeaStore = defineStore('sea', () => {
  const vessels = ref<SeaVessel[]>([])
  const feed = ref<SeaFeedInfo>({ ...DEFAULT_FEED })
  /** Wall-clock ms of the last successful snapshot, 0 before the first. */
  const lastFetchedAt = ref(0)

  // ── overlays & label fields ────────────────────────────────────────────────
  // Whether this browser already holds an overlay choice. The `sea.defaultLayers`
  // config is a *default*: it seeds a first visit and is never allowed to undo
  // a toggle the operator has since made on the rail.
  let overlaysChosen = false
  try {
    overlaysChosen = localStorage.getItem(LS_OVERLAYS_KEY) !== null
  } catch {
    overlaysChosen = false
  }
  const overlayStates = usePersistedObject<SeaOverlayStates>(LS_OVERLAYS_KEY, DEFAULT_OVERLAYS)
  // Live vessels are always plotted at sea — the rail has no toggle for them
  // (FILTER narrows the picture instead) — so a stale stored "off" from an
  // earlier build must not hide the layer with no way back.
  if (!overlayStates.value.vessels) overlayStates.value = { ...overlayStates.value, vessels: true }
  function setOverlay(key: keyof SeaOverlayStates, on: boolean): void {
    overlaysChosen = true
    overlayStates.value = { ...overlayStates.value, [key]: on }
  }
  /** The overlays `sea.defaultLayers` records, in the order the config lists them. */
  const DEFAULT_LAYER_KEYS = ['vesselLabels', 'ferryRoutes', 'ports'] as const
  /** The `sea.defaultLayers` list the current flags describe — what Settings
   *  writes back so other devices and fresh browsers start the same way.
   *  Vessels are always in; range rings are a per-station aid, never saved. */
  function currentDefaultLayers(): string[] {
    return ['vessels', ...DEFAULT_LAYER_KEYS.filter((key) => overlayStates.value[key])]
  }
  /** Seed the overlays from the config's default-layers list — first visit only. */
  function applyDefaultLayers(layers: string[]): void {
    if (overlaysChosen) return
    overlayStates.value = {
      ...overlayStates.value,
      vessels: true,
      vesselLabels: layers.includes('vesselLabels'),
      ferryRoutes: layers.includes('ferryRoutes'),
      ports: layers.includes('ports'),
    }
  }

  const labelFields = usePersistedObject<SeaLabelFieldMap>(
    LS_LABEL_FIELDS_KEY,
    DEFAULT_LABEL_FIELDS,
  )
  function setLabelFields(fields: SeaLabelFieldMap): void {
    labelFields.value = fields
  }

  // ── FILTER rail category ───────────────────────────────────────────────────
  const seaFilterCategoryRaw = usePersistedRef<string>('sentinel_sea_filterCategory', 'all')
  const seaFilterCategory = ref<SeaFilterCategory>(
    isSeaFilterCategory(seaFilterCategoryRaw.value) ? seaFilterCategoryRaw.value : 'all',
  )
  function setSeaFilterCategory(category: SeaFilterCategory): void {
    seaFilterCategory.value = category
    seaFilterCategoryRaw.value = category
  }

  // ── selection & SEARCH pane ────────────────────────────────────────────────
  /** The vessel the map has selected (bracket + track), '' when none. */
  const selectedMmsi = ref('')
  function setSelectedMmsi(mmsi: string): void {
    selectedMmsi.value = mmsi
  }
  const selectedTrack = ref<SeaTrackSample[]>([])
  function setSelectedTrack(samples: SeaTrackSample[]): void {
    selectedTrack.value = samples
  }
  const searchQuery = usePersistedRef<string>('sentinel_sea_filterQuery', '')
  const searchExpandedMmsi = usePersistedRef<string>('sentinel_sea_filterExpanded', '')
  /** The port row open in the FILTER pane's PORTS list, by UN/LOCODE. */
  const searchExpandedPort = usePersistedRef<string>('sentinel_sea_filterExpandedPort', '')
  function setSearchQuery(query: string): void {
    searchQuery.value = query
  }
  function setSearchExpandedMmsi(mmsi: string): void {
    searchExpandedMmsi.value = mmsi
  }
  function setSearchExpandedPort(locode: string): void {
    searchExpandedPort.value = locode
  }

  // ── map state ──────────────────────────────────────────────────────────────
  const mapCenter = ref<[number, number] | null>(null)
  const mapZoom = ref<number | null>(null)
  function saveMapState(center: [number, number], zoom: number): void {
    mapCenter.value = center
    mapZoom.value = zoom
  }

  // Which layers are on by default (from the `sea.defaultLayers` config).
  const defaultLayers = ref<string[]>(['vessels', 'vesselLabels', 'ferryRoutes', 'ports'])
  async function hydrateDefaultLayers(): Promise<void> {
    try {
      const res = await fetch('/api/settings/sea')
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data?.defaultLayers)) defaultLayers.value = data.defaultLayers as string[]
    } catch {
      /* offline / transient — keep the default */
    }
  }

  // ── polling ────────────────────────────────────────────────────────────────
  /** The viewport the next snapshot request is limited to; null = worldwide. */
  const viewportBbox = ref<SeaBbox | null>(null)
  function setViewportBbox(bbox: SeaBbox | null): void {
    viewportBbox.value = bbox
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollers = 0
  let inFlight: AbortController | null = null

  /** Fetch the current vessel snapshot for the viewport, replacing the held
   *  list. A failed request marks the feed unreachable but keeps the last list
   *  so the map does not blank on a transient error. */
  async function fetchVessels(): Promise<void> {
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller
    const params = new URLSearchParams({ max_rows: String(SEA_MAX_RENDER_ROWS) })
    if (viewportBbox.value)
      params.set('bbox', viewportBbox.value.map((edge) => edge.toFixed(3)).join(','))
    try {
      const res = await fetch(`/api/sea/vessels?${params.toString()}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!res.ok) {
        feed.value = { ...feed.value, status: 'unreachable', error: `HTTP ${res.status}` }
        return
      }
      const data = (await res.json()) as Partial<SeaFeedInfo> & { vessels?: SeaVessel[] }
      if (controller.signal.aborted) return
      if (Array.isArray(data.vessels)) vessels.value = data.vessels
      feed.value = {
        status: (data.status as SeaFeedStatus) ?? 'connecting',
        error: data.error ?? null,
        source: data.source ?? 'AISStream',
        lastMessageAt: data.lastMessageAt ?? null,
        silentForMs: data.silentForMs ?? null,
        reconnectAttempt: data.reconnectAttempt ?? 0,
        nextAttemptAt: data.nextAttemptAt ?? null,
        newestPositionAt: data.newestPositionAt ?? null,
        vesselCount: data.vesselCount ?? vessels.value.length,
      }
      lastFetchedAt.value = Date.now()
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return
      feed.value = { ...feed.value, status: 'unreachable', error: 'backend unreachable' }
    } finally {
      if (inFlight === controller) inFlight = null
    }
  }

  /** Begin polling the vessel snapshot (ref-counted). The first caller fetches
   *  at once — unless a fetch landed a moment ago — and starts the interval. */
  function startPolling(): void {
    pollers += 1
    if (pollTimer !== null) return
    if (Date.now() - lastFetchedAt.value > SEA_REFETCH_GUARD_MS) void fetchVessels()
    pollTimer = setInterval(() => void fetchVessels(), SEA_POLL_INTERVAL_MS)
  }

  /** Stop polling when the last consumer leaves (ref-counted). */
  function stopPolling(): void {
    pollers = Math.max(0, pollers - 1)
    if (pollers > 0 || pollTimer === null) return
    clearInterval(pollTimer)
    pollTimer = null
    inFlight?.abort()
    inFlight = null
  }

  /** Load one vessel's recent path into `selectedTrack`; empties it on failure. */
  async function fetchTrack(mmsi: string): Promise<void> {
    try {
      const res = await fetch(`/api/sea/vessels/${encodeURIComponent(mmsi)}/track`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        selectedTrack.value = []
        return
      }
      const data = (await res.json()) as { samples?: SeaTrackSample[] }
      // Ignore a late reply for a vessel that is no longer the selection.
      if (selectedMmsi.value !== mmsi) return
      selectedTrack.value = Array.isArray(data.samples) ? data.samples : []
    } catch {
      selectedTrack.value = []
    }
  }

  return {
    vessels,
    feed,
    lastFetchedAt,
    overlayStates,
    setOverlay,
    applyDefaultLayers,
    currentDefaultLayers,
    labelFields,
    setLabelFields,
    seaFilterCategory,
    setSeaFilterCategory,
    selectedMmsi,
    setSelectedMmsi,
    selectedTrack,
    setSelectedTrack,
    searchQuery,
    setSearchQuery,
    searchExpandedMmsi,
    searchExpandedPort,
    setSearchExpandedPort,
    setSearchExpandedMmsi,
    mapCenter,
    mapZoom,
    saveMapState,
    defaultLayers,
    hydrateDefaultLayers,
    viewportBbox,
    setViewportBbox,
    fetchVessels,
    startPolling,
    stopPolling,
    fetchTrack,
  }
})
