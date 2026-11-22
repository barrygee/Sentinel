import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSeaStore, type SeaVessel } from './sea'
import { usePlaybackStore } from '@sentinel/shell-api/stores/playback'
import { SEA_POLL_INTERVAL_MS } from '../constants/sea'

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
        // The snapshot carries no `mode`, so the store falls back to 'online' —
        // the source a response predating the off-grid decoder must be from.
        mode: 'online',
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

    it('selectVessel selects the vessel and loads its track', async () => {
      const samples = [{ lat: 51, lon: 1, t: 1 }]
      const fetchMock = okFetch({ samples })
      vi.stubGlobal('fetch', fetchMock)
      const store = useSeaStore()
      store.selectVessel(VESSEL.mmsi)
      // Selected at once, so the bracket shows before the track arrives.
      expect(store.selectedMmsi).toBe(VESSEL.mmsi)
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/sea/vessels/${VESSEL.mmsi}/track`,
        expect.objectContaining({ cache: 'no-store' }),
      )
      await vi.waitFor(() => expect(store.selectedTrack).toEqual(samples))
    })

    it('selectVessel drops the previous vessel’s track if it is superseded', async () => {
      let resolveFirst: (value: unknown) => void = () => {}
      const fetchMock = vi
        .fn()
        .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
        .mockResolvedValue({
          ok: true,
          json: async () => ({ samples: [{ lat: 2, lon: 2, t: 2 }] }),
        })
      vi.stubGlobal('fetch', fetchMock)
      const store = useSeaStore()
      store.selectVessel('first')
      store.selectVessel('second')
      await vi.waitFor(() => expect(store.selectedTrack).toEqual([{ lat: 2, lon: 2, t: 2 }]))
      resolveFirst({ ok: true, json: async () => ({ samples: [{ lat: 1, lon: 1, t: 1 }] }) })
      // Let the stale reply's json() and the store's check run (fake timers are
      // on, so flush microtasks rather than waiting on a timeout).
      for (let tick = 0; tick < 5; tick++) await Promise.resolve()
      expect(store.selectedMmsi).toBe('second')
      expect(store.selectedTrack).toEqual([{ lat: 2, lon: 2, t: 2 }])
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

describe('sea store — replay', () => {
  const NOW = Date.UTC(2026, 10, 20, 12, 0, 0)
  const AT = NOW - 3_600_000

  function sample(t: number, lat = 51, overrides: Record<string, unknown> = {}) {
    return {
      t,
      lat,
      lon: 1,
      alt: null,
      heading: 90,
      speed: 10,
      source: 'online',
      extra: { name: 'PRIDE OF KENT', family: 'passenger', cog: 90 },
      ...overrides,
    }
  }

  function historyFetch(entities: Record<string, unknown[]>) {
    return vi.fn(async (url: string) => {
      if (String(url).startsWith('/api/sea/history/samples')) {
        return { ok: true, json: async () => ({ from: 0, to: 0, truncated: false, entities }) }
      }
      return { ok: true, json: async () => ({ vessels: [{ mmsi: 'live' }], status: 'live' }) }
    })
  }

  async function settle() {
    for (let index = 0; index < 6; index++) await Promise.resolve()
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    usePlaybackStore().enterReplay('sea', AT)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('fills vessels from the recording at the replayed moment, with no source warnings', async () => {
    const fetchMock = historyFetch({ '232012345': [sample(AT - 60_000)] })
    vi.stubGlobal('fetch', fetchMock)
    const store = useSeaStore()
    store.startReplay()
    await settle()
    expect(store.vessels.map((vessel) => vessel.mmsi)).toEqual(['232012345'])
    expect(store.feed).toMatchObject({
      status: 'live',
      mode: 'online',
      source: 'Recorded history',
      vesselCount: 1,
    })
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith('/api/sea/history/'))).toBe(
      true,
    )
  })

  it('reports off grid when only the off-grid decoder was heard', async () => {
    vi.stubGlobal('fetch', historyFetch({ a: [sample(AT - 1000, 51, { source: 'offgrid' })] }))
    const store = useSeaStore()
    store.startReplay()
    await settle()
    expect(store.feed.mode).toBe('offgrid')
  })

  it('pauses polling while replaying and resumes for the consumers counted meanwhile', async () => {
    const fetchMock = historyFetch({})
    vi.stubGlobal('fetch', fetchMock)
    const store = useSeaStore()
    store.startPolling() // a live consumer before replay
    store.startReplay()
    store.startPolling() // another joins during replay: counted, not polling
    await settle()
    fetchMock.mockClear()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/sea/vessels'))).toBe(
      false,
    )
    store.stopReplay()
    await settle()
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/sea/vessels'))).toBe(
      true,
    )
    expect(store.feed.status).toBe('live')
    store.stopPolling()
    store.stopPolling()
  })

  it('a fetch while replaying redraws the recording instead (a pan)', async () => {
    const fetchMock = historyFetch({})
    vi.stubGlobal('fetch', fetchMock)
    const store = useSeaStore()
    store.startReplay()
    await settle()
    await store.fetchVessels()
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/sea/vessels'))).toBe(
      false,
    )
  })

  it("the selected vessel's track comes from the recording up to the moment", async () => {
    vi.stubGlobal(
      'fetch',
      historyFetch({
        a: [sample(AT - 120_000, 50), sample(AT - 60_000, 50.5), sample(AT + 60_000, 51)],
      }),
    )
    const store = useSeaStore()
    store.startReplay()
    await settle()
    store.selectVessel('a')
    expect(store.selectedTrack).toEqual([
      { lat: 50, lon: 1, t: Math.floor((AT - 120_000) / 1000) },
      { lat: 50.5, lon: 1, t: Math.floor((AT - 60_000) / 1000) },
    ])
    // Each frame refreshes the selected track as the moment moves on.
    usePlaybackStore().seek('sea', AT + 120_000)
    store.refreshReplay()
    await settle()
    expect(store.selectedTrack).toHaveLength(3)
  })

  it('draws a frame each second, never two at once', async () => {
    const fetchMock = historyFetch({})
    vi.stubGlobal('fetch', fetchMock)
    const store = useSeaStore()
    store.startReplay()
    store.refreshReplay() // in flight: skipped
    await settle()
    await vi.advanceTimersByTimeAsync(2000)
    // One chunk fetch serves every frame (cached).
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a frame finishing after replay ended is dropped', async () => {
    let release!: (value: unknown) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => (release = resolve))),
    )
    const store = useSeaStore()
    store.startReplay()
    store.stopReplay()
    release({ ok: true, json: async () => ({ entities: { a: [sample(AT - 1000)] } }) })
    await settle()
    expect(store.vessels).toEqual([])
  })

  it('leaving replay restores the live feed and the live track', async () => {
    const fetchMock = historyFetch({ a: [sample(AT - 1000)] })
    vi.stubGlobal('fetch', fetchMock)
    const store = useSeaStore()
    store.startReplay()
    await settle()
    store.selectVessel('a')
    store.stopReplay()
    await settle()
    expect(store.vessels).toEqual([])
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/sea/vessels/a/track')).toBe(
      true,
    )
  })

  it('leaving with nothing selected and nobody polling just clears', async () => {
    const fetchMock = historyFetch({})
    vi.stubGlobal('fetch', fetchMock)
    const store = useSeaStore()
    store.startReplay()
    await settle()
    fetchMock.mockClear()
    store.stopReplay()
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.feed.status).toBe('connecting')
  })

  it('starting twice, stopping twice and refreshing while live are harmless', async () => {
    const fetchMock = historyFetch({})
    vi.stubGlobal('fetch', fetchMock)
    const store = useSeaStore()
    store.startReplay()
    store.startReplay()
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    store.stopReplay()
    store.stopReplay()
    store.refreshReplay()
    expect(store.selectedTrack).toEqual([])
  })

  it('a track asked for while live comes from the network as before', async () => {
    const fetchMock = okFetch({ samples: [{ lat: 1, lon: 2, t: 3 }] })
    vi.stubGlobal('fetch', fetchMock)
    const store = useSeaStore()
    store.selectVessel('x')
    await settle()
    expect(store.selectedTrack).toEqual([{ lat: 1, lon: 2, t: 3 }])
  })
})
