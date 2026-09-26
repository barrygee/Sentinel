import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { usePersistedObject } from './_persist'
import { fetchRepeaterDirectory } from '@/services/repeatersApi'
import * as settingsApi from '@/services/settingsApi'
import { REPEATER_MODE_CODES, stationOffAir } from '@/constants/repeaters'
import type {
  RepeaterDataSource,
  RepeaterFilters,
  RepeaterLabelFieldMap,
  RepeaterModeCode,
  RepeaterStation,
  RepeaterStatusFilter,
} from '@/types/repeaters'
import type { ViewportBounds } from '@/types/viewport'

/** Everything shown: no band or mode narrowing, off-air sites included. */
const DEFAULT_FILTERS: RepeaterFilters = { bands: [], modes: [], status: 'all' }

const STATUS_FILTERS: readonly RepeaterStatusFilter[] = ['all', 'operational', 'offAir']

const LS_LABEL_FIELDS_KEY = 'repeaterLabelFields_v1'

/** Glyph, callsign and band badges — the label as first shipped, so an
 *  upgrade never changes what an existing user sees. */
export const DEFAULT_REPEATER_LABEL_FIELDS: RepeaterLabelFieldMap = {
  symbol: true,
  callsign: true,
  band: true,
  location: false,
  modes: false,
  output: false,
  input: false,
  tone: false,
  channel: false,
  locator: false,
  keeper: false,
  status: false,
}

/**
 * UK repeater directory store — the stations the Land map plots, the
 * band/mode filters that narrow them (persisted as `land.repeaterFilters`),
 * and the map viewport so the FILTER pane can list exactly what is in view.
 *
 * The directory is static reference data refreshed daily by the backend, so
 * it is loaded once per session rather than polled; `RepeatersControl` calls
 * `load()` when the layer first shows.
 */
export const useRepeatersStore = defineStore('repeaters', () => {
  const stations = ref<RepeaterStation[]>([])
  const source = ref<RepeaterDataSource | null>(null)
  const fetchedAt = ref<number | null>(null)
  const loading = ref(false)
  const loaded = ref(false)

  const filters = ref<RepeaterFilters>({ ...DEFAULT_FILTERS })

  // Which data fields appear on repeater map labels. Persisted locally for
  // instant restore and mirrored to the backend (`land.repeaterLabelFields`)
  // by the Settings control, so the choice follows the user across devices.
  const labelFields = usePersistedObject<RepeaterLabelFieldMap>(
    LS_LABEL_FIELDS_KEY,
    DEFAULT_REPEATER_LABEL_FIELDS,
  )
  function setLabelFields(fields: RepeaterLabelFieldMap): void {
    labelFields.value = fields
  }

  /** Adopt `land.repeaterLabelFields` from the config database; only boolean
   *  values for known fields apply, so a hand-edited config cannot break a label. */
  function hydrateLabelFields(remote: unknown): void {
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return
    const candidate = remote as Partial<Record<keyof RepeaterLabelFieldMap, unknown>>
    const next = { ...labelFields.value }
    for (const key of Object.keys(
      DEFAULT_REPEATER_LABEL_FIELDS,
    ) as (keyof RepeaterLabelFieldMap)[]) {
      const value = candidate[key]
      if (typeof value === 'boolean') next[key] = value
    }
    labelFields.value = next
  }

  const viewportBounds = ref<ViewportBounds | null>(null)
  function setViewportBounds(bounds: ViewportBounds): void {
    viewportBounds.value = bounds
  }

  /** Fetch the directory once; later calls are no-ops unless the first failed. */
  async function load(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    try {
      const directory = await fetchRepeaterDirectory()
      if (!directory) return
      stations.value = directory.stations
      source.value = directory.source
      fetchedAt.value = directory.fetchedAt
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** Stations passing the band/mode/status filters — what the map plots. */
  const filteredStations = computed<RepeaterStation[]>(() => {
    const { bands, modes, status } = filters.value
    return stations.value.filter((station) => {
      if (status === 'operational' && stationOffAir(station)) return false
      if (status === 'offAir' && !stationOffAir(station)) return false
      // A site passes if any one channel satisfies both narrowings: a dual-band
      // 2M FM / 70CM DMR site shows for "2M" and for "DMR", not only "2M DMR".
      return station.channels.some(
        (channel) =>
          (bands.length === 0 || bands.includes(channel.band)) &&
          (modes.length === 0 || channel.modes.some((mode) => modes.includes(mode))),
      )
    })
  })

  /** Filtered stations inside the last map viewport — the pane's list. */
  const visibleStations = computed<RepeaterStation[]>(() => {
    const bounds = viewportBounds.value
    if (!bounds) return filteredStations.value
    return filteredStations.value.filter(
      (station) =>
        station.longitude >= bounds.west &&
        station.longitude <= bounds.east &&
        station.latitude >= bounds.south &&
        station.latitude <= bounds.north,
    )
  })

  function stationByCallsign(callsign: string): RepeaterStation | undefined {
    return stations.value.find((station) => station.callsign === callsign)
  }

  // ── filters ──────────────────────────────────────────────────────────────

  function toggleBand(band: string): void {
    const bands = filters.value.bands.includes(band)
      ? filters.value.bands.filter((candidate) => candidate !== band)
      : [...filters.value.bands, band]
    setFilters({ ...filters.value, bands })
  }

  function toggleMode(mode: RepeaterModeCode): void {
    const modes = filters.value.modes.includes(mode)
      ? filters.value.modes.filter((candidate) => candidate !== mode)
      : [...filters.value.modes, mode]
    setFilters({ ...filters.value, modes })
  }

  function clearBands(): void {
    setFilters({ ...filters.value, bands: [] })
  }

  function clearModes(): void {
    setFilters({ ...filters.value, modes: [] })
  }

  function setStatusFilter(status: RepeaterStatusFilter): void {
    setFilters({ ...filters.value, status })
  }

  /** Replace the filters and persist them to the app config. */
  function setFilters(next: RepeaterFilters): void {
    filters.value = next
    void settingsApi.put('land', 'repeaterFilters', { ...next })
  }

  /**
   * Adopt `land.repeaterFilters` from the config database (startup, or after
   * the app-config JSON is uploaded). Unknown bands/modes are dropped so a
   * hand-edited config can never hide every station behind a typo.
   */
  function hydrateFilters(remote: unknown): void {
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return
    const candidate = remote as Partial<Record<keyof RepeaterFilters, unknown>>
    const bands = Array.isArray(candidate.bands)
      ? candidate.bands.filter((band): band is string => typeof band === 'string')
      : filters.value.bands
    const modes = Array.isArray(candidate.modes)
      ? candidate.modes.filter((mode): mode is RepeaterModeCode =>
          (REPEATER_MODE_CODES as readonly unknown[]).includes(mode),
        )
      : filters.value.modes
    const status = (STATUS_FILTERS as readonly unknown[]).includes(candidate.status)
      ? (candidate.status as RepeaterStatusFilter)
      : filters.value.status
    filters.value = { bands, modes, status }
  }

  /** Load `land.repeaterFilters` and `land.repeaterLabelFields` from the
   *  backend (startup, config upload). */
  async function hydrateFiltersFromDb(): Promise<void> {
    const land = await settingsApi.getNamespace('land')
    hydrateFilters(land?.repeaterFilters)
    hydrateLabelFields(land?.repeaterLabelFields)
  }

  return {
    stations,
    source,
    fetchedAt,
    loading,
    loaded,
    filters,
    labelFields,
    setLabelFields,
    hydrateLabelFields,
    viewportBounds,
    setViewportBounds,
    load,
    filteredStations,
    visibleStations,
    stationByCallsign,
    toggleBand,
    toggleMode,
    clearBands,
    clearModes,
    setStatusFilter,
    setFilters,
    hydrateFilters,
    hydrateFiltersFromDb,
  }
})

export type RepeatersStore = ReturnType<typeof useRepeatersStore>
