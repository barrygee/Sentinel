import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSeaStore, type SeaVessel } from './sea'
import { SEA_POLL_INTERVAL_MS } from '@/constants/sea'

const VESSEL: SeaVessel = {
  mmsi: '232012345',
  name: 'PRIDE OF KENT',
  imo: '9015266',
  callsign: 'GBPK',
  type: '60',
  typeLabel: 'PASSENGER',
  family: 'passenger',
  destination: 'DOVER',
  lat: 51.07,
  lon: 1.42,
  sog: 18.4,
  cog: 122,
  heading: 121,
  navStatus: 0,
  lastPositionMs: 1789202463000,
  lastPositionUtc: '2026-09-12T08:41:03Z',
}

const SNAPSHOT = {
  vessels: [VESSEL],
  source: 'AISStream',
  status: 'live',
  error: null,
  lastMessageAt: 1,
  silentForMs: 2,
  reconnectAttempt: 0,
  nextAttemptAt: null,
  newestPositionAt: 3,
  vesselCount: 1,
}

function okFetch(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => body })
}

describe('sea store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    localStorage.clear()
  })

  it('starts empty, connecting, with the default overlays and label fields', () => {
    const store = useSeaStore()
    expect(store.vessels).toEqual([])
    expect(store.feed.status).toBe('connecting')
    expect(store.overlayStates).toEqual({
      vessels: true,
      vesselLabels: true,
      rangeRings: false,
      ferryRoutes: true,
      ports: true,
    })
    expect(store.labelFields.name).toBe(true)
    expect(store.seaFilterCategory).toBe('all')
    expect(store.selectedMmsi).toBe('')
    expect(store.mapCenter).toBeNull()
  })

  describe('fetchVessels', () => {
    it('replaces the list and adopts the feed metadata', async () => {
      const fetchMock = okFetch(SNAPSHOT)
      vi.stubGlobal('fetch', fetchMock)
      const store = useSeaStore()
      await store.fetchVessels()
      expect(store.vessels).toEqual([VESSEL])
      expect(store.feed).toEqual({
        status: 'live',
        error: null,
        source: 'AISStream',
        lastMessageAt: 1,
        silentForMs: 2,
        reconnectAttempt: 0,
        nextAttemptAt: null,
        newestPositionAt: 3,
        vesselCount: 1,
      })
      expect(store.lastFetchedAt).toBeGreaterThan(0)
      const url = String(fetchMock.mock.calls[0]![0])
      expect(url).toContain('/api/sea/vessels?max_rows=')
      expect(url).not.toContain('bbox')
    })

    it('sends the viewport bbox to three decimals', async () => {
      const fetchMock = okFetch(SNAPSHOT)
      vi.stubGlobal('fetch', fetchMock)
      const store = useSeaStore()
      store.setViewportBbox([50.12345, -1.5, 52, 2.99999])
      await store.fetchVessels()
      expect(String(fetchMock.mock.calls[0]![0])).toContain('bbox=50.123%2C-1.500%2C52.000%2C3.000')
    })

    it('fills in defaults for a sparse payload', async () => {
      vi.stubGlobal('fetch', okFetch({ vessels: 'nope' }))
      const store = useSeaStore()
      store.vessels = [VESSEL]
      await store.fetchVessels()
      expect(store.vessels).toEqual([VESSEL]) // a non-array leaves the list alone
      expect(store.feed.status).toBe('connecting')
      expect(store.feed.source).toBe('AISStream')
      expect(store.feed.vesselCount).toBe(1)
    })

    it('marks the feed unreachable on a non-ok response, keeping the list', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
      const store = useSeaStore()
      store.vessels = [VESSEL]
      await store.fetchVessels()
      expect(store.vessels).toEqual([VESSEL])
      expect(store.feed.status).toBe('unreachable')
      expect(store.feed.error).toBe('HTTP 503')
    })

    it('marks the feed unreachable on a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const store = useSeaStore()
      await store.fetchVessels()
      expect(store.feed.status).toBe('unreachable')
      expect(store.feed.error).toBe('backend unreachable')
    })

    it('ignores an aborted request', async () => {
      const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))
      const store = useSeaStore()
      await store.fetchVessels()
      expect(store.feed.status).toBe('connecting')
    })

    it('a newer request aborts the one in flight and the stale reply is dropped', async () => {
      let resolveFirst!: (value: unknown) => void
      const first = new Promise((resolve) => {
        resolveFirst = resolve
      })
      const fetchMock = vi
        .fn()
        .mockImplementationOnce((_url: string, init: { signal: AbortSignal }) =>
          first.then(() => ({
            ok: true,
            json: async () => ({
              ...SNAPSHOT,
              vessels: [{ ...VESSEL, name: 'STALE' }],
              _signal: init.signal,
            }),
          })),
        )
        .mockResolvedValueOnce({ ok: true, json: async () => SNAPSHOT })
      vi.stubGlobal('fetch', fetchMock)
      const store = useSeaStore()
      const pending = store.fetchVessels()
      await store.fetchVessels()
      const firstSignal = (fetchMock.mock.calls[0]![1] as { signal: AbortSignal }).signal
      expect(firstSignal.aborted).toBe(true)
      resolveFirst(undefined)
      await pending
      expect(store.vessels[0]!.name).toBe('PRIDE OF KENT')
    })
  })

  describe('polling', () => {
    it('is ref-counted: first caller fetches at once and starts the interval', async () => {
      const fetchMock = okFetch(SNAPSHOT)
      vi.stubGlobal('fetch', fetchMock)
      const store = useSeaStore()
      store.startPolling()
      store.startPolling()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(SEA_POLL_INTERVAL_MS)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      store.stopPolling()
      await vi.advanceTimersByTimeAsync(SEA_POLL_INTERVAL_MS)
      expect(fetchMock).toHaveBeenCalledTimes(3) // one consumer left
      store.stopPolling()
      store.stopPolling() // extra stop is harmless
      await vi.advanceTimersByTimeAsync(SEA_POLL_INTERVAL_MS)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('skips the immediate fetch when one just landed', async () => {
      const fetchMock = okFetch(SNAPSHOT)
      vi.stubGlobal('fetch', fetchMock)
      const store = useSeaStore()
      await store.fetchVessels()
      store.startPolling()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      store.stopPolling()
    })
  })

  describe('selection and tracks', () => {
    it('loads the selected vessel track', async () => {
      const samples = [{ lat: 51, lon: 1, t: 1 }]
      vi.stubGlobal('fetch', okFetch({ samples }))
      const store = useSeaStore()
      store.setSelectedMmsi(VESSEL.mmsi)
      await store.fetchTrack(VESSEL.mmsi)
      expect(store.selectedTrack).toEqual(samples)
    })

    it('empties the track on failure or a malformed body', async () => {
      const store = useSeaStore()
      store.setSelectedMmsi(VESSEL.mmsi)
      store.setSelectedTrack([{ lat: 1, lon: 1, t: 1 }])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      await store.fetchTrack(VESSEL.mmsi)
      expect(store.selectedTrack).toEqual([])
      store.setSelectedTrack([{ lat: 1, lon: 1, t: 1 }])
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      await store.fetchTrack(VESSEL.mmsi)
      expect(store.selectedTrack).toEqual([])
      vi.stubGlobal('fetch', okFetch({ samples: 'junk' }))
      await store.fetchTrack(VESSEL.mmsi)
      expect(store.selectedTrack).toEqual([])
    })

    it('drops a late track for a vessel that is no longer selected', async () => {
      vi.stubGlobal('fetch', okFetch({ samples: [{ lat: 1, lon: 1, t: 1 }] }))
      const store = useSeaStore()
      store.setSelectedMmsi('other')
      await store.fetchTrack(VESSEL.mmsi)
      expect(store.selectedTrack).toEqual([])
    })
  })

  describe('persisted preferences', () => {
    it('persists overlays, the filter category, the search state and label fields', () => {
      const store = useSeaStore()
      store.setOverlay('ferryRoutes', true)
      store.setSeaFilterCategory('tanker')
      store.setSearchQuery('kent')
      store.setSearchExpandedMmsi('1')
      store.setSearchExpandedPort('GBSOU')
      store.setLabelFields({ ...store.labelFields, mmsi: true })
      setActivePinia(createPinia())
      const again = useSeaStore()
      expect(again.overlayStates.ferryRoutes).toBe(true)
      expect(again.seaFilterCategory).toBe('tanker')
      expect(again.searchQuery).toBe('kent')
      expect(again.searchExpandedMmsi).toBe('1')
      expect(again.searchExpandedPort).toBe('GBSOU')
      expect(again.labelFields.mmsi).toBe(true)
    })

    it('falls back to "all" for an unknown persisted category', () => {
      localStorage.setItem('sentinel_sea_filterCategory', JSON.stringify('battleships'))
      expect(useSeaStore().seaFilterCategory).toBe('all')
    })

    it('treats an unreadable localStorage as no prior choice', () => {
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      const store = useSeaStore()
      store.applyDefaultLayers(['vessels'])
      expect(store.overlayStates.vesselLabels).toBe(false)
    })

    it('remembers the map view', () => {
      const store = useSeaStore()
      store.saveMapState([1, 51], 9)
      expect(store.mapCenter).toEqual([1, 51])
      expect(store.mapZoom).toBe(9)
    })
  })

  describe('default layers', () => {
    it('hydrates from the settings API and tolerates failures', async () => {
      const store = useSeaStore()
      vi.stubGlobal('fetch', okFetch({ defaultLayers: ['vessels'] }))
      await store.hydrateDefaultLayers()
      expect(store.defaultLayers).toEqual(['vessels'])
      vi.stubGlobal('fetch', okFetch({ defaultLayers: 'junk' }))
      await store.hydrateDefaultLayers()
      expect(store.defaultLayers).toEqual(['vessels'])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      await store.hydrateDefaultLayers()
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      await store.hydrateDefaultLayers()
      expect(store.defaultLayers).toEqual(['vessels'])
    })

    it('forces live vessels on, ignoring a stored "off" from an earlier build', () => {
      localStorage.setItem(
        'seaOverlayStates_v2',
        JSON.stringify({
          vessels: false,
          vesselLabels: false,
          rangeRings: false,
          ferryRoutes: false,
        }),
      )
      const store = useSeaStore()
      expect(store.overlayStates.vessels).toBe(true)
      expect(store.overlayStates.vesselLabels).toBe(false) // other choices stand
      expect(store.overlayStates.ports).toBe(true) // a key the old build never stored takes its default
      // Neither can the default-layers config turn them off.
      setActivePinia(createPinia())
      const fresh = useSeaStore()
      fresh.applyDefaultLayers(['vesselLabels'])
      expect(fresh.overlayStates.vessels).toBe(true)
    })

    it('seeds the overlays on a first visit only', () => {
      const store = useSeaStore()
      store.applyDefaultLayers(['vessels', 'ports'])
      expect(store.overlayStates).toMatchObject({
        vessels: true,
        vesselLabels: false,
        ferryRoutes: false,
        ports: true,
      })
      store.applyDefaultLayers(['vessels'])
      expect(store.overlayStates.ports).toBe(false)
      store.setOverlay('ferryRoutes', true)
      store.applyDefaultLayers([])
      expect(store.overlayStates.ferryRoutes).toBe(true) // the operator's choice stands
      // A browser with a stored choice never re-applies the defaults.
      setActivePinia(createPinia())
      const again = useSeaStore()
      again.applyDefaultLayers([])
      expect(again.overlayStates.ferryRoutes).toBe(true)
    })

    it('describes the current flags as a default-layers list, vessels always in, rings never', () => {
      const store = useSeaStore()
      expect(store.currentDefaultLayers()).toEqual([
        'vessels',
        'vesselLabels',
        'ferryRoutes',
        'ports',
      ])
      store.setOverlay('vesselLabels', false)
      store.setOverlay('ports', false)
      store.setOverlay('rangeRings', true)
      expect(store.currentDefaultLayers()).toEqual(['vessels', 'ferryRoutes'])
      store.setOverlay('ferryRoutes', false)
      expect(store.currentDefaultLayers()).toEqual(['vessels'])
    })
  })
})
