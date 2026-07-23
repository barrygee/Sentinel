import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLandStore } from './land'

const STATION = {
  callsign: 'M0ABC-9',
  latitude: 51.5,
  longitude: -0.1,
  symbol: '/>',
  comment: 'rolling',
  course: 90,
  speed: 30,
  altitude: 120,
  path: 'WIDE1-1',
  raw: 'M0ABC-9>APRS:!x',
  last_heard_ms: 1000,
}

describe('land store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('starts empty', () => {
    expect(useLandStore().aprsStations).toEqual([])
  })

  it('fetchAprsStations replaces the list from the snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [STATION] }) }),
    )
    const store = useLandStore()
    await store.fetchAprsStations()
    expect(store.aprsStations).toEqual([STATION])
  })

  it('fetchAprsStations ignores a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    const store = useLandStore()
    await store.fetchAprsStations()
    expect(store.aprsStations).toEqual([])
  })

  it('fetchAprsStations ignores a payload without a stations array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ oops: 1 }) }))
    const store = useLandStore()
    await store.fetchAprsStations()
    expect(store.aprsStations).toEqual([])
  })

  it('fetchAprsStations swallows a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const store = useLandStore()
    await expect(store.fetchAprsStations()).resolves.toBeUndefined()
    expect(store.aprsStations).toEqual([])
  })

  it('startAprsPolling fetches immediately and then on the interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const store = useLandStore()
    store.startAprsPolling()
    expect(fetchMock).toHaveBeenCalledTimes(1) // immediate
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(2) // one interval tick
    store.stopAprsPolling()
  })

  it('ref-counts pollers: a second start does not add a second interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const store = useLandStore()
    store.startAprsPolling()
    store.startAprsPolling() // second consumer — no extra immediate fetch, no 2nd timer
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(2) // still just one tick per interval
    store.stopAprsPolling()
    store.stopAprsPolling()
  })

  it('stops polling only when the last consumer leaves', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const store = useLandStore()
    store.startAprsPolling()
    store.startAprsPolling()
    store.stopAprsPolling() // one consumer left; polling continues
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    store.stopAprsPolling() // last consumer left; polling stops
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchMock).toHaveBeenCalledTimes(2) // no more ticks
  })

  it('stopAprsPolling with no active poller is a safe no-op', () => {
    const store = useLandStore()
    expect(() => store.stopAprsPolling()).not.toThrow()
  })

  describe('APRS retention setting', () => {
    it('defaults to 5 minutes and can be set', () => {
      const store = useLandStore()
      expect(store.aprsRetentionMinutes).toBe(5)
      store.setAprsRetentionMinutes(30)
      expect(store.aprsRetentionMinutes).toBe(30)
    })
  })

  describe('default layers', () => {
    it('defaults to ["aprs"]', () => {
      expect(useLandStore().defaultLayers).toEqual(['aprs'])
    })

    it('hydrates the layer list from the land settings', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ defaultLayers: ['aprs', 'weather'] }),
        }),
      )
      const store = useLandStore()
      await store.hydrateDefaultLayers()
      expect(store.defaultLayers).toEqual(['aprs', 'weather'])
    })

    it('keeps the default on a non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
      const store = useLandStore()
      await store.hydrateDefaultLayers()
      expect(store.defaultLayers).toEqual(['aprs'])
    })

    it('keeps the default when the payload has no layer array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ other: 1 }) }),
      )
      const store = useLandStore()
      await store.hydrateDefaultLayers()
      expect(store.defaultLayers).toEqual(['aprs'])
    })

    it('swallows a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const store = useLandStore()
      await expect(store.hydrateDefaultLayers()).resolves.toBeUndefined()
      expect(store.defaultLayers).toEqual(['aprs'])
    })
  })
})
