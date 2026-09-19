import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/repeatersApi', () => ({ fetchRepeaterDirectory: vi.fn() }))
vi.mock('@/services/settingsApi', () => ({ put: vi.fn(), getNamespace: vi.fn() }))

import { DEFAULT_REPEATER_LABEL_FIELDS, useRepeatersStore } from './repeaters'
import * as repeatersApi from '@/services/repeatersApi'
import * as settingsApi from '@/services/settingsApi'
import type {
  RepeaterChannel,
  RepeaterDirectory,
  RepeaterStation,
  RepeaterStatus,
} from '@/types/repeaters'

const LS_LABEL_FIELDS_KEY = 'repeaterLabelFields_v1'

function channel(overrides: Partial<RepeaterChannel> = {}): RepeaterChannel {
  return {
    id: 1,
    band: '2M',
    channel: 'RV52',
    txMhz: 145.7125,
    rxMhz: 145.1125,
    modes: ['A'],
    ctcssHz: 118.8,
    dmrColourCode: null,
    heightMagl: 40,
    erpDbw: 12,
    status: 'OPERATIONAL',
    ...overrides,
  }
}

function station(overrides: Partial<RepeaterStation> = {}): RepeaterStation {
  return {
    callsign: 'GB3NR',
    latitude: 52.6,
    longitude: 1.3,
    locator: 'JO02PP',
    location: 'NORWICH',
    postcode: 'NR2',
    region: 'EA',
    keeper: 'G4XYZ',
    channels: [channel()],
    ...overrides,
  }
}

function directory(stations: RepeaterStation[]): RepeaterDirectory {
  return { source: 'online', fetchedAt: 1_700_000_000_000, stations }
}

const OFF_AIR: RepeaterStatus = 'NOT OPERATIONAL'

describe('useRepeatersStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts empty, unloaded and unfiltered', () => {
      const store = useRepeatersStore()
      expect(store.stations).toEqual([])
      expect(store.source).toBeNull()
      expect(store.fetchedAt).toBeNull()
      expect(store.loading).toBe(false)
      expect(store.loaded).toBe(false)
      expect(store.filters).toEqual({ bands: [], modes: [], status: 'all' })
      expect(store.viewportBounds).toBeNull()
    })

    it('labels show the glyph, callsign and band badges only', () => {
      const store = useRepeatersStore()
      expect(store.labelFields).toEqual(DEFAULT_REPEATER_LABEL_FIELDS)
      expect(DEFAULT_REPEATER_LABEL_FIELDS.symbol).toBe(true)
      expect(DEFAULT_REPEATER_LABEL_FIELDS.callsign).toBe(true)
      expect(DEFAULT_REPEATER_LABEL_FIELDS.band).toBe(true)
      expect(DEFAULT_REPEATER_LABEL_FIELDS.keeper).toBe(false)
    })

    it('restores label fields persisted in localStorage', () => {
      localStorage.setItem(LS_LABEL_FIELDS_KEY, JSON.stringify({ keeper: true }))
      setActivePinia(createPinia())
      const store = useRepeatersStore()
      expect(store.labelFields.keeper).toBe(true)
      expect(store.labelFields.callsign).toBe(true)
    })
  })

  describe('load', () => {
    it('stores the fetched directory and marks itself loaded', async () => {
      vi.mocked(repeatersApi.fetchRepeaterDirectory).mockResolvedValue(directory([station()]))
      const store = useRepeatersStore()
      await store.load()
      expect(store.stations).toHaveLength(1)
      expect(store.source).toBe('online')
      expect(store.fetchedAt).toBe(1_700_000_000_000)
      expect(store.loaded).toBe(true)
      expect(store.loading).toBe(false)
    })

    it('does not fetch again once loaded', async () => {
      vi.mocked(repeatersApi.fetchRepeaterDirectory).mockResolvedValue(directory([station()]))
      const store = useRepeatersStore()
      await store.load()
      await store.load()
      expect(repeatersApi.fetchRepeaterDirectory).toHaveBeenCalledOnce()
    })

    it('keeps whatever it held and stays unloaded when the fetch fails', async () => {
      vi.mocked(repeatersApi.fetchRepeaterDirectory).mockResolvedValue(null)
      const store = useRepeatersStore()
      store.stations = [station({ callsign: 'GB3PI' })]
      await store.load()
      expect(store.stations.map((each) => each.callsign)).toEqual(['GB3PI'])
      expect(store.loaded).toBe(false)
      expect(store.loading).toBe(false)
      // A retry is allowed after a failure, unlike after a success.
      await store.load()
      expect(repeatersApi.fetchRepeaterDirectory).toHaveBeenCalledTimes(2)
    })

    it('collapses concurrent calls into one in-flight fetch', async () => {
      let resolveDirectory: (value: RepeaterDirectory) => void = () => {}
      vi.mocked(repeatersApi.fetchRepeaterDirectory).mockReturnValue(
        new Promise<RepeaterDirectory>((resolve) => {
          resolveDirectory = resolve
        }),
      )
      const store = useRepeatersStore()
      const first = store.load()
      expect(store.loading).toBe(true)
      await store.load() // second call returns immediately
      expect(repeatersApi.fetchRepeaterDirectory).toHaveBeenCalledOnce()
      resolveDirectory(directory([station()]))
      await first
      expect(store.loaded).toBe(true)
    })

    it('clears the loading flag when the fetch throws', async () => {
      vi.mocked(repeatersApi.fetchRepeaterDirectory).mockRejectedValue(new Error('boom'))
      const store = useRepeatersStore()
      await expect(store.load()).rejects.toThrow('boom')
      expect(store.loading).toBe(false)
      expect(store.loaded).toBe(false)
    })
  })

  describe('filteredStations', () => {
    const dualBand = station({
      callsign: 'GB7DUAL',
      channels: [channel({ band: '2M', modes: ['A'] }), channel({ band: '70CM', modes: ['M'] })],
    })
    const twentyThreeCm = station({
      callsign: 'GB3CM',
      channels: [channel({ band: '23CM', modes: ['T'] })],
    })

    it('returns every station when no narrowing is set', () => {
      const store = useRepeatersStore()
      store.stations = [dualBand, twentyThreeCm]
      expect(store.filteredStations).toHaveLength(2)
    })

    it('keeps a station when any one channel matches the band filter', () => {
      const store = useRepeatersStore()
      store.stations = [dualBand, twentyThreeCm]
      store.toggleBand('70CM')
      expect(store.filteredStations.map((each) => each.callsign)).toEqual(['GB7DUAL'])
    })

    it('keeps a station when any one channel matches the mode filter', () => {
      const store = useRepeatersStore()
      store.stations = [dualBand, twentyThreeCm]
      store.toggleMode('T')
      expect(store.filteredStations.map((each) => each.callsign)).toEqual(['GB3CM'])
    })

    it('requires one single channel to satisfy band and mode together', () => {
      const store = useRepeatersStore()
      store.stations = [dualBand]
      // The site has 2M FM and 70CM DMR, so "2M" + "DMR" matches no one channel.
      store.setFilters({ bands: ['2M'], modes: ['M'], status: 'all' })
      expect(store.filteredStations).toEqual([])
      store.setFilters({ bands: ['70CM'], modes: ['M'], status: 'all' })
      expect(store.filteredStations.map((each) => each.callsign)).toEqual(['GB7DUAL'])
    })

    it('drops a station whose bands are all outside the filter', () => {
      const store = useRepeatersStore()
      store.stations = [twentyThreeCm]
      store.toggleBand('6M')
      expect(store.filteredStations).toEqual([])
    })

    it('excludes off-air sites under the operational filter', () => {
      const store = useRepeatersStore()
      const offAir = station({ callsign: 'GB3OLD', channels: [channel({ status: OFF_AIR })] })
      store.stations = [dualBand, offAir]
      store.setStatusFilter('operational')
      expect(store.filteredStations.map((each) => each.callsign)).toEqual(['GB7DUAL'])
    })

    it('shows only off-air sites under the offAir filter', () => {
      const store = useRepeatersStore()
      const offAir = station({ callsign: 'GB3OLD', channels: [channel({ status: OFF_AIR })] })
      store.stations = [dualBand, offAir]
      store.setStatusFilter('offAir')
      expect(store.filteredStations.map((each) => each.callsign)).toEqual(['GB3OLD'])
    })

    it('drops a station with no channels, which can satisfy no narrowing', () => {
      const store = useRepeatersStore()
      store.stations = [station({ callsign: 'GB3EMPTY', channels: [] })]
      expect(store.filteredStations).toEqual([])
    })

    it('returns nothing when the directory is empty', () => {
      const store = useRepeatersStore()
      expect(store.filteredStations).toEqual([])
    })
  })

  describe('visibleStations', () => {
    const inside = station({ callsign: 'GB3IN', longitude: 1.3, latitude: 52.6 })
    const outside = station({ callsign: 'GB3OUT', longitude: -4.0, latitude: 55.9 })

    it('falls back to every filtered station before the map reports a viewport', () => {
      const store = useRepeatersStore()
      store.stations = [inside, outside]
      expect(store.visibleStations).toHaveLength(2)
    })

    it('keeps only stations inside the reported viewport', () => {
      const store = useRepeatersStore()
      store.stations = [inside, outside]
      store.setViewportBounds({ west: 0, south: 51, east: 2, north: 53 })
      expect(store.visibleStations.map((each) => each.callsign)).toEqual(['GB3IN'])
    })

    it('includes a station sitting exactly on a viewport edge', () => {
      const store = useRepeatersStore()
      store.stations = [inside]
      store.setViewportBounds({ west: 1.3, south: 52.6, east: 1.3, north: 52.6 })
      expect(store.visibleStations).toHaveLength(1)
    })

    it('excludes a station just beyond each edge in turn', () => {
      const store = useRepeatersStore()
      store.stations = [inside]
      store.setViewportBounds({ west: 1.31, south: 51, east: 2, north: 53 })
      expect(store.visibleStations).toEqual([])
      store.setViewportBounds({ west: 0, south: 51, east: 1.29, north: 53 })
      expect(store.visibleStations).toEqual([])
      store.setViewportBounds({ west: 0, south: 52.61, east: 2, north: 53 })
      expect(store.visibleStations).toEqual([])
      store.setViewportBounds({ west: 0, south: 51, east: 2, north: 52.59 })
      expect(store.visibleStations).toEqual([])
    })

    it('applies the band filter before the viewport', () => {
      const store = useRepeatersStore()
      store.stations = [inside]
      store.setViewportBounds({ west: 0, south: 51, east: 2, north: 53 })
      store.toggleBand('6M')
      expect(store.visibleStations).toEqual([])
    })
  })

  describe('stationByCallsign', () => {
    it('finds a station by exact callsign', () => {
      const store = useRepeatersStore()
      store.stations = [station({ callsign: 'GB3NR' }), station({ callsign: 'GB3PI' })]
      expect(store.stationByCallsign('GB3PI')?.callsign).toBe('GB3PI')
    })

    it('returns undefined for a callsign the directory does not hold', () => {
      const store = useRepeatersStore()
      store.stations = [station()]
      expect(store.stationByCallsign('GB3ZZZ')).toBeUndefined()
    })
  })

  describe('filter mutators', () => {
    it('toggleBand adds then removes a band, persisting each change', () => {
      const store = useRepeatersStore()
      store.toggleBand('2M')
      expect(store.filters.bands).toEqual(['2M'])
      store.toggleBand('70CM')
      expect(store.filters.bands).toEqual(['2M', '70CM'])
      store.toggleBand('2M')
      expect(store.filters.bands).toEqual(['70CM'])
      expect(settingsApi.put).toHaveBeenCalledTimes(3)
      expect(settingsApi.put).toHaveBeenLastCalledWith('land', 'repeaterFilters', {
        bands: ['70CM'],
        modes: [],
        status: 'all',
      })
    })

    it('toggleMode adds then removes a mode', () => {
      const store = useRepeatersStore()
      store.toggleMode('M')
      expect(store.filters.modes).toEqual(['M'])
      store.toggleMode('D')
      expect(store.filters.modes).toEqual(['M', 'D'])
      store.toggleMode('M')
      expect(store.filters.modes).toEqual(['D'])
    })

    it('clearBands and clearModes empty one list without touching the other', () => {
      const store = useRepeatersStore()
      store.setFilters({ bands: ['2M'], modes: ['A'], status: 'operational' })
      store.clearBands()
      expect(store.filters).toEqual({ bands: [], modes: ['A'], status: 'operational' })
      store.clearModes()
      expect(store.filters).toEqual({ bands: [], modes: [], status: 'operational' })
    })

    it('setStatusFilter changes only the status', () => {
      const store = useRepeatersStore()
      store.setFilters({ bands: ['2M'], modes: [], status: 'all' })
      store.setStatusFilter('offAir')
      expect(store.filters).toEqual({ bands: ['2M'], modes: [], status: 'offAir' })
    })

    it('setFilters persists a copy, so later mutation cannot rewrite the config', () => {
      const store = useRepeatersStore()
      const next = { bands: ['2M'], modes: [], status: 'all' as const }
      store.setFilters(next)
      const persisted = vi.mocked(settingsApi.put).mock.calls[0]?.[2]
      expect(persisted).toEqual(next)
      expect(persisted).not.toBe(next)
    })
  })

  describe('hydrateFilters', () => {
    it('adopts a well-formed remote value', () => {
      const store = useRepeatersStore()
      store.hydrateFilters({ bands: ['2M', '70CM'], modes: ['A', 'M'], status: 'operational' })
      expect(store.filters).toEqual({
        bands: ['2M', '70CM'],
        modes: ['A', 'M'],
        status: 'operational',
      })
    })

    it('does not write the adopted value back to the backend', () => {
      const store = useRepeatersStore()
      store.hydrateFilters({ bands: ['2M'], modes: [], status: 'all' })
      expect(settingsApi.put).not.toHaveBeenCalled()
    })

    it('drops mode codes the register does not define', () => {
      const store = useRepeatersStore()
      store.hydrateFilters({ modes: ['A', 'nonsense', 42, null] })
      expect(store.filters.modes).toEqual(['A'])
    })

    it('drops band entries that are not strings', () => {
      const store = useRepeatersStore()
      store.hydrateFilters({ bands: ['2M', 7, { band: '70CM' }] })
      expect(store.filters.bands).toEqual(['2M'])
    })

    it('keeps the current value for each key the remote value omits', () => {
      const store = useRepeatersStore()
      store.setFilters({ bands: ['2M'], modes: ['A'], status: 'offAir' })
      store.hydrateFilters({})
      expect(store.filters).toEqual({ bands: ['2M'], modes: ['A'], status: 'offAir' })
    })

    it('keeps the current status when the remote one is unknown', () => {
      const store = useRepeatersStore()
      store.setStatusFilter('operational')
      store.hydrateFilters({ status: 'ONLY_GOOD_ONES' })
      expect(store.filters.status).toBe('operational')
    })

    it('ignores a non-object, null, or array remote value', () => {
      const store = useRepeatersStore()
      store.setFilters({ bands: ['2M'], modes: [], status: 'all' })
      for (const remote of [null, undefined, 'bands', 7, ['2M']]) {
        store.hydrateFilters(remote)
        expect(store.filters.bands).toEqual(['2M'])
      }
    })
  })

  describe('label fields', () => {
    it('setLabelFields replaces the map and persists it locally', () => {
      const store = useRepeatersStore()
      store.setLabelFields({ ...DEFAULT_REPEATER_LABEL_FIELDS, keeper: true, band: false })
      expect(store.labelFields.keeper).toBe(true)
      expect(store.labelFields.band).toBe(false)
      expect(JSON.parse(localStorage.getItem(LS_LABEL_FIELDS_KEY) ?? '{}')).toMatchObject({
        keeper: true,
        band: false,
      })
    })

    it('hydrateLabelFields adopts only the boolean values of known fields', () => {
      const store = useRepeatersStore()
      store.hydrateLabelFields({ keeper: true, band: false, locator: 'yes', unknownField: true })
      expect(store.labelFields.keeper).toBe(true)
      expect(store.labelFields.band).toBe(false)
      expect(store.labelFields.locator).toBe(false) // non-boolean ignored
      expect(store.labelFields).not.toHaveProperty('unknownField')
    })

    it('hydrateLabelFields ignores a non-object, null, or array remote value', () => {
      const store = useRepeatersStore()
      store.setLabelFields({ ...DEFAULT_REPEATER_LABEL_FIELDS, keeper: true })
      for (const remote of [null, undefined, 'keeper', 0, [{ keeper: false }]]) {
        store.hydrateLabelFields(remote)
        expect(store.labelFields.keeper).toBe(true)
      }
    })
  })

  describe('hydrateFiltersFromDb', () => {
    it('adopts both the filters and the label fields from the land namespace', async () => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue({
        repeaterFilters: { bands: ['2M'], modes: ['A'], status: 'operational' },
        repeaterLabelFields: { keeper: true },
      })
      const store = useRepeatersStore()
      await store.hydrateFiltersFromDb()
      expect(settingsApi.getNamespace).toHaveBeenCalledWith('land')
      expect(store.filters).toEqual({ bands: ['2M'], modes: ['A'], status: 'operational' })
      expect(store.labelFields.keeper).toBe(true)
    })

    it('leaves the defaults in place when the namespace is unreachable', async () => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
      const store = useRepeatersStore()
      await store.hydrateFiltersFromDb()
      expect(store.filters).toEqual({ bands: [], modes: [], status: 'all' })
      expect(store.labelFields).toEqual(DEFAULT_REPEATER_LABEL_FIELDS)
    })

    it('leaves the defaults in place when the namespace holds no repeater keys', async () => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue({ somethingElse: true })
      const store = useRepeatersStore()
      await store.hydrateFiltersFromDb()
      expect(store.filters).toEqual({ bands: [], modes: [], status: 'all' })
    })
  })
})
