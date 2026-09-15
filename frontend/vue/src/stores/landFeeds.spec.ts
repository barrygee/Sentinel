import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLandFeedsStore } from './landFeeds'
import type { CameraFeatureCollection, FeedWithStatus } from '@/types/landFeeds'

vi.mock('@/services/landFeedsApi', () => ({
  listFeeds: vi.fn(),
  getFeatures: vi.fn(),
  saveFeeds: vi.fn(),
  getCredentialStatus: vi.fn(),
  setCredential: vi.fn(),
  clearCredential: vi.fn(),
  testFeed: vi.fn(),
}))
import * as landFeedsApi from '@/services/landFeedsApi'

const STATUS = {
  lastFetchAt: null,
  lastError: null,
  featureCount: 0,
  credentialConfigured: false,
  running: false,
}

function feed(overrides: Partial<FeedWithStatus> = {}): FeedWithStatus {
  return {
    id: 'durham-cc',
    name: 'Durham County Council',
    category: 'traffic-cameras',
    provider: 'durham',
    url: 'https://spatial.durham.gov.uk/example',
    enabled: true,
    refreshSeconds: 60,
    datasets: ['cameras'],
    bbox: null,
    location: null,
    auth: { type: 'none' },
    status: STATUS,
    ...overrides,
  }
}

function collection(featureIds: string[] = []): CameraFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: featureIds.map((id) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {
        kind: 'camera',
        id,
        name: id,
        description: '',
        view: null,
        updatedAt: null,
        state: 'live',
        imageUrl: null,
        clipUrl: null,
        externalUrl: null,
        sourceId: 'durham-cc',
        sourceName: 'Durham County Council',
        attribution: '',
      },
    })),
  }
}

describe('landFeeds store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([])
    vi.mocked(landFeedsApi.getFeatures).mockResolvedValue(collection())
    vi.mocked(landFeedsApi.saveFeeds).mockResolvedValue(undefined)
    vi.mocked(landFeedsApi.getCredentialStatus).mockResolvedValue({ configured: false })
    vi.mocked(landFeedsApi.setCredential).mockResolvedValue({ configured: true })
    vi.mocked(landFeedsApi.clearCredential).mockResolvedValue({ configured: false })
    vi.mocked(landFeedsApi.testFeed).mockResolvedValue({ ok: true, message: '', featureCount: 0 })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with no feeds, no feature snapshots and no viewport bounds', () => {
    const store = useLandFeedsStore()
    expect(store.feeds).toEqual([])
    expect(store.featuresByFeed).toEqual({})
    expect(store.viewportBounds).toBeNull()
  })

  it('setViewportBounds records the bounds', () => {
    const store = useLandFeedsStore()
    store.setViewportBounds({ west: -2, south: 54, east: -1, north: 55 })
    expect(store.viewportBounds).toEqual({ west: -2, south: 54, east: -1, north: 55 })
  })

  describe('loadFeeds', () => {
    it('replaces the feed list from the API', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed()])
      const store = useLandFeedsStore()
      await store.loadFeeds()
      expect(store.feeds).toEqual([feed()])
    })

    it('empties the list when nothing is configured', async () => {
      const store = useLandFeedsStore()
      store.feeds = [feed()]
      await store.loadFeeds()
      expect(store.feeds).toEqual([])
    })
  })

  describe('refresh', () => {
    it('stores the fetched collection under the feed id', async () => {
      vi.mocked(landFeedsApi.getFeatures).mockResolvedValue(collection(['durham-cc:1']))
      const store = useLandFeedsStore()
      await store.refresh('durham-cc')
      expect(store.featuresByFeed['durham-cc']).toEqual(collection(['durham-cc:1']))
    })

    it('leaves other feeds untouched', async () => {
      const store = useLandFeedsStore()
      store.featuresByFeed = { 'tfl-jamcams': collection(['tfl-jamcams:1']) }
      vi.mocked(landFeedsApi.getFeatures).mockResolvedValue(collection(['durham-cc:1']))
      await store.refresh('durham-cc')
      expect(store.featuresByFeed['tfl-jamcams']).toEqual(collection(['tfl-jamcams:1']))
      expect(store.featuresByFeed['durham-cc']).toEqual(collection(['durham-cc:1']))
    })

    it('replaces an empty snapshot with the freshly fetched one (an empty feed refreshing is not a no-op)', async () => {
      const store = useLandFeedsStore()
      store.featuresByFeed = { 'durham-cc': collection([]) }
      vi.mocked(landFeedsApi.getFeatures).mockResolvedValue(collection(['durham-cc:1']))
      await store.refresh('durham-cc')
      expect(store.featuresByFeed['durham-cc']).toEqual(collection(['durham-cc:1']))
    })

    // The regression this guards: `refresh` used to spread `featuresByFeed`
    // into a new object *before* the `await`, capturing whichever other
    // entries existed at call time. Two concurrent refreshes then raced —
    // whichever `await` resolved last overwrote the whole map with its own
    // stale snapshot of the other feed's slot, silently dropping the feed
    // that finished first. The fix moves the spread after the await, so each
    // refresh merges into whatever the *current* map holds. This test proves
    // the ordering: feed B is fetched first but resolves *last*, arriving
    // after feed A — the exact case the old code lost.
    it('lets two concurrent refreshes both land, regardless of which resolves last', async () => {
      const store = useLandFeedsStore()

      let resolveDurham!: (value: CameraFeatureCollection) => void
      let resolveTfl!: (value: CameraFeatureCollection) => void
      vi.mocked(landFeedsApi.getFeatures).mockImplementation((feedId: string) => {
        if (feedId === 'durham-cc') {
          return new Promise((resolve) => {
            resolveDurham = resolve
          })
        }
        return new Promise((resolve) => {
          resolveTfl = resolve
        })
      })

      const durhamRefresh = store.refresh('durham-cc')
      const tflRefresh = store.refresh('tfl-jamcams') // started second

      // Resolve out of call order: the feed requested first finishes last.
      resolveTfl(collection(['tfl-jamcams:1']))
      await tflRefresh
      resolveDurham(collection(['durham-cc:1']))
      await durhamRefresh

      // Both must be present — the race this test guards against drops
      // whichever finished first once the other overwrites the whole map.
      expect(store.featuresByFeed).toEqual({
        'durham-cc': collection(['durham-cc:1']),
        'tfl-jamcams': collection(['tfl-jamcams:1']),
      })
    })
  })

  describe('polling', () => {
    it('startPolling loads the feed list and fetches every enabled feed immediately', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed({ id: 'durham-cc' })])
      const store = useLandFeedsStore()
      await store.startPolling()
      expect(landFeedsApi.getFeatures).toHaveBeenCalledWith('durham-cc')
      store.stopPolling()
    })

    it('never polls a disabled feed', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([
        feed({ id: 'durham-cc', enabled: false }),
      ])
      const store = useLandFeedsStore()
      await store.startPolling()
      expect(landFeedsApi.getFeatures).not.toHaveBeenCalled()
      store.stopPolling()
    })

    it('re-fetches an enabled feed on its own interval', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([
        feed({ id: 'durham-cc', refreshSeconds: 60 }),
      ])
      const store = useLandFeedsStore()
      await store.startPolling()
      vi.mocked(landFeedsApi.getFeatures).mockClear()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(landFeedsApi.getFeatures).toHaveBeenCalledWith('durham-cc')
      store.stopPolling()
    })

    it('floors the poll interval at 15s even for a faster configured refresh', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([
        feed({ id: 'durham-cc', refreshSeconds: 5 }),
      ])
      const store = useLandFeedsStore()
      await store.startPolling()
      vi.mocked(landFeedsApi.getFeatures).mockClear()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(landFeedsApi.getFeatures).not.toHaveBeenCalled() // floored to 15s, not yet due
      await vi.advanceTimersByTimeAsync(10_000)
      expect(landFeedsApi.getFeatures).toHaveBeenCalledWith('durham-cc')
      store.stopPolling()
    })

    it('ref-counts pollers: a second start does not reload the list or duplicate timers', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed()])
      const store = useLandFeedsStore()
      await store.startPolling()
      vi.mocked(landFeedsApi.listFeeds).mockClear()
      await store.startPolling()
      expect(landFeedsApi.listFeeds).not.toHaveBeenCalled()
      store.stopPolling()
      store.stopPolling()
    })

    it('stops polling only once every consumer has left', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed()])
      const store = useLandFeedsStore()
      await store.startPolling()
      await store.startPolling()
      store.stopPolling() // one consumer remains
      vi.mocked(landFeedsApi.getFeatures).mockClear()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(landFeedsApi.getFeatures).toHaveBeenCalled() // still polling

      store.stopPolling() // last consumer leaves
      vi.mocked(landFeedsApi.getFeatures).mockClear()
      await vi.advanceTimersByTimeAsync(120_000)
      expect(landFeedsApi.getFeatures).not.toHaveBeenCalled()
    })

    it('stopPolling with nothing started is a safe no-op', () => {
      const store = useLandFeedsStore()
      expect(() => store.stopPolling()).not.toThrow()
    })

    it('re-syncs the feed list and timers every FEED_LIST_REFRESH_MS while polling', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed({ enabled: false })])
      const store = useLandFeedsStore()
      await store.startPolling()
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed({ enabled: true })])
      vi.mocked(landFeedsApi.getFeatures).mockClear()
      await vi.advanceTimersByTimeAsync(30_000)
      // The feed flipped enabled between syncs — the periodic re-sync must
      // pick that up and start polling it, not just refresh the static list.
      expect(landFeedsApi.getFeatures).toHaveBeenCalledWith('durham-cc')
      store.stopPolling()
    })

    it('stops polling a feed that becomes disabled on a later sync', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed({ enabled: true })])
      const store = useLandFeedsStore()
      await store.startPolling()
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed({ enabled: false })])
      await vi.advanceTimersByTimeAsync(30_000) // periodic re-sync clears the timer
      vi.mocked(landFeedsApi.getFeatures).mockClear()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(landFeedsApi.getFeatures).not.toHaveBeenCalled()
      store.stopPolling()
    })

    it('stops polling a feed removed from the list entirely', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed({ id: 'durham-cc' })])
      const store = useLandFeedsStore()
      await store.startPolling()
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([])
      await vi.advanceTimersByTimeAsync(30_000)
      vi.mocked(landFeedsApi.getFeatures).mockClear()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(landFeedsApi.getFeatures).not.toHaveBeenCalled()
      store.stopPolling()
    })

    it('polls every enabled feed independently, each on its own timer', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([
        feed({ id: 'durham-cc', refreshSeconds: 60 }),
        feed({ id: 'tfl-jamcams', refreshSeconds: 300 }),
      ])
      const store = useLandFeedsStore()
      await store.startPolling()
      vi.mocked(landFeedsApi.getFeatures).mockClear()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(landFeedsApi.getFeatures).toHaveBeenCalledWith('durham-cc')
      expect(landFeedsApi.getFeatures).not.toHaveBeenCalledWith('tfl-jamcams')
      await vi.advanceTimersByTimeAsync(240_000)
      expect(landFeedsApi.getFeatures).toHaveBeenCalledWith('tfl-jamcams')
      store.stopPolling()
    })
  })

  describe('saveFeeds', () => {
    it('writes the list, then reloads the feed list', async () => {
      const store = useLandFeedsStore()
      await store.saveFeeds([])
      expect(landFeedsApi.saveFeeds).toHaveBeenCalledWith([])
      expect(landFeedsApi.listFeeds).toHaveBeenCalled()
    })

    it('re-syncs polling timers when polling is currently active', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed({ enabled: false })])
      const store = useLandFeedsStore()
      await store.startPolling()
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed({ enabled: true })])
      vi.mocked(landFeedsApi.getFeatures).mockClear()
      await store.saveFeeds([feed({ enabled: true })])
      expect(landFeedsApi.getFeatures).toHaveBeenCalledWith('durham-cc')
      store.stopPolling()
    })

    it('does not start polling as a side effect when nothing was polling before', async () => {
      const store = useLandFeedsStore()
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([feed({ enabled: true })])
      await store.saveFeeds([feed({ enabled: true })])
      expect(landFeedsApi.getFeatures).not.toHaveBeenCalled()
    })
  })

  describe('credentials', () => {
    it('get reads status straight from the API with no side effects', async () => {
      vi.mocked(landFeedsApi.getCredentialStatus).mockResolvedValue({ configured: true })
      const store = useLandFeedsStore()
      expect(await store.credentials.get('tfl-jamcams')).toEqual({ configured: true })
      expect(landFeedsApi.listFeeds).not.toHaveBeenCalled()
    })

    it('set writes the credential then reloads the feed list', async () => {
      const store = useLandFeedsStore()
      await store.credentials.set('tfl-jamcams', { apiKey: 'abc' })
      expect(landFeedsApi.setCredential).toHaveBeenCalledWith('tfl-jamcams', { apiKey: 'abc' })
      expect(landFeedsApi.listFeeds).toHaveBeenCalled()
    })

    it('clear forgets the credential then reloads the feed list', async () => {
      const store = useLandFeedsStore()
      await store.credentials.clear('tfl-jamcams')
      expect(landFeedsApi.clearCredential).toHaveBeenCalledWith('tfl-jamcams')
      expect(landFeedsApi.listFeeds).toHaveBeenCalled()
    })
  })

  describe('test', () => {
    it('probes the feed via the API and returns its result', async () => {
      vi.mocked(landFeedsApi.testFeed).mockResolvedValue({
        ok: false,
        message: 'HTTP 503.',
        featureCount: 0,
      })
      const store = useLandFeedsStore()
      expect(await store.test('durham-cc')).toEqual({
        ok: false,
        message: 'HTTP 503.',
        featureCount: 0,
      })
      expect(landFeedsApi.testFeed).toHaveBeenCalledWith('durham-cc')
    })
  })
})
