import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  getOfflineMapStatus: vi.fn(),
  listOfflineRegions: vi.fn(),
  getOfflineRegion: vi.fn(),
  createOfflineRegion: vi.fn(),
  deleteOfflineRegion: vi.fn(),
  estimateOfflineArea: vi.fn(),
}))

vi.mock('../services/offlineMapsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/offlineMapsApi')>()),
  getOfflineMapStatus: apiMock.getOfflineMapStatus,
  listOfflineRegions: apiMock.listOfflineRegions,
  getOfflineRegion: apiMock.getOfflineRegion,
  createOfflineRegion: apiMock.createOfflineRegion,
  deleteOfflineRegion: apiMock.deleteOfflineRegion,
  estimateOfflineArea: apiMock.estimateOfflineArea,
}))

import { useOfflineMapsStore, OFFLINE_MIN_ZOOM, OFFLINE_MAX_ZOOM } from './offlineMaps'
import { OfflineMapsApiError, type OfflineRegion } from '../services/offlineMapsApi'

const STATUS = {
  basemap_available: true,
  terrain_available: true,
  basemap_max_zoom: 14,
  terrain_max_zoom: 12,
  free_bytes: 10_000_000_000,
  used_bytes: 0,
  sources_configured: true,
  pmtiles_available: true,
  tiers_version: 'v1',
  avg_tile_bytes: { basemap: { '0': 100 }, terrain: { '0': 50 } },
}

function region(overrides: Partial<OfflineRegion>): OfflineRegion {
  return {
    id: 'r1',
    label: 'Region',
    west: -1,
    south: 50,
    east: 1,
    north: 52,
    max_zoom: 12,
    include_basemap: true,
    include_terrain: true,
    status: 'queued',
    phase: null,
    bytes_done: 0,
    bytes_estimated: 1000,
    tiles_estimated: 100,
    size_bytes: null,
    error: null,
    created_at: 1,
    completed_at: null,
    ...overrides,
  }
}

describe('useOfflineMapsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('draft persistence and clamping', () => {
    it('starts with the pristine 0/0/0/0 draft and reports hasDraftArea=false', () => {
      const store = useOfflineMapsStore()
      expect(store.hasDraftArea).toBe(false)
      expect(store.draft).toMatchObject({ west: 0, south: 0, east: 0, north: 0, maxZoom: 14 })
    })

    it('seeds lastCreatedRegionId from a valid stored string', () => {
      localStorage.setItem('sentinel_offlineMapsLastCreatedRegionId', JSON.stringify('abc-123'))
      const store = useOfflineMapsStore()
      expect(store.lastCreatedRegionId).toBe('abc-123')
    })

    it('falls back to the empty-string default when the stored lastCreatedRegionId is not a string', () => {
      localStorage.setItem('sentinel_offlineMapsLastCreatedRegionId', JSON.stringify(42))
      const store = useOfflineMapsStore()
      expect(store.lastCreatedRegionId).toBe('')
    })

    it('restores a saved draft with neither Basemap nor Terrain as both selected', () => {
      localStorage.setItem(
        'sentinel_offlineMapsDraft',
        JSON.stringify({ label: 'Saved', includeBasemap: false, includeTerrain: false }),
      )
      const store = useOfflineMapsStore()
      expect(store.draft).toMatchObject({
        label: 'Saved',
        includeBasemap: true,
        includeTerrain: true,
      })
    })

    it('restores a saved draft with one of Basemap or Terrain selected unchanged', () => {
      localStorage.setItem(
        'sentinel_offlineMapsDraft',
        JSON.stringify({ includeBasemap: false, includeTerrain: true }),
      )
      expect(useOfflineMapsStore().draft).toMatchObject({
        includeBasemap: false,
        includeTerrain: true,
      })
    })

    it('keeps the drawn area only for the page session, restoring depth/contents/label but no area after a reload', () => {
      const store = useOfflineMapsStore()
      store.setDraftBbox(-3, 54, -2, 55)
      store.setDraftMaxZoom(9)
      store.setDraftLabel('Fells')
      expect(store.hasDraftArea).toBe(true)

      // A new store instance is what a page reload produces.
      setActivePinia(createPinia())
      const reopened = useOfflineMapsStore()
      expect(reopened.hasDraftArea).toBe(false)
      expect(reopened.draft).toMatchObject({ maxZoom: 9, label: 'Fells' })
    })

    it('ignores a bbox update containing a non-finite value', () => {
      const store = useOfflineMapsStore()
      store.setDraftBbox(-3, 54, -2, 55)
      store.setDraftBbox(NaN, 54, -2, 55)
      expect(store.draft.west).toBe(-3) // unchanged
    })

    it('clearDraftArea forgets the area but keeps depth, contents and label', () => {
      const store = useOfflineMapsStore()
      store.setDraftBbox(-3, 54, -2, 55)
      store.setDraftMaxZoom(9)
      store.setDraftIncludeTerrain(false)
      store.setDraftLabel('Lakes')
      store.clearDraftArea()
      expect(store.hasDraftArea).toBe(false)
      expect(store.draft).toMatchObject({
        west: 0,
        south: 0,
        east: 0,
        north: 0,
        maxZoom: 9,
        includeTerrain: false,
        label: 'Lakes',
      })
    })

    it('clamps setDraftMaxZoom to [OFFLINE_MIN_ZOOM, OFFLINE_MAX_ZOOM] and rounds', () => {
      const store = useOfflineMapsStore()
      store.setDraftMaxZoom(2)
      expect(store.draft.maxZoom).toBe(OFFLINE_MIN_ZOOM)
      store.setDraftMaxZoom(99)
      expect(store.draft.maxZoom).toBe(OFFLINE_MAX_ZOOM)
      store.setDraftMaxZoom(10.6)
      expect(store.draft.maxZoom).toBe(11)
    })

    it('sets includeBasemap/includeTerrain/label independently', () => {
      const store = useOfflineMapsStore()
      store.setDraftIncludeBasemap(false)
      store.setDraftLabel('My Area')
      expect(store.draft).toMatchObject({
        includeBasemap: false,
        includeTerrain: true,
        label: 'My Area',
      })
      store.setDraftIncludeBasemap(true)
      store.setDraftIncludeTerrain(false)
      expect(store.draft).toMatchObject({ includeBasemap: true, includeTerrain: false })
    })

    it('refuses to untick terrain when basemap is already off', () => {
      const store = useOfflineMapsStore()
      store.setDraftIncludeBasemap(false)
      store.setDraftIncludeTerrain(false)
      expect(store.draft).toMatchObject({ includeBasemap: false, includeTerrain: true })
    })

    it('refuses to untick basemap when terrain is already off', () => {
      const store = useOfflineMapsStore()
      store.setDraftIncludeTerrain(false)
      store.setDraftIncludeBasemap(false)
      expect(store.draft).toMatchObject({ includeBasemap: true, includeTerrain: false })
    })

    it('still lets the only ticked box be re-ticked (a no-op true)', () => {
      const store = useOfflineMapsStore()
      store.setDraftIncludeTerrain(false)
      store.setDraftIncludeBasemap(true)
      expect(store.draft).toMatchObject({ includeBasemap: true, includeTerrain: false })
    })
  })

  describe('fetchStatus / fetchRegions', () => {
    it('reports no tiers version before any status has loaded', () => {
      const store = useOfflineMapsStore()
      expect(store.status).toBeNull()
      expect(store.tiersVersion).toBeNull()
    })

    it('populates status on success', async () => {
      apiMock.getOfflineMapStatus.mockResolvedValue(STATUS)
      const store = useOfflineMapsStore()
      await store.fetchStatus()
      expect(store.status).toEqual(STATUS)
      expect(store.tiersVersion).toBe('v1')
    })

    it('keeps the last-known status when the fetch fails', async () => {
      apiMock.getOfflineMapStatus.mockResolvedValueOnce(STATUS)
      const store = useOfflineMapsStore()
      await store.fetchStatus()
      apiMock.getOfflineMapStatus.mockRejectedValueOnce(new Error('offline'))
      await store.fetchStatus()
      expect(store.status).toEqual(STATUS)
    })

    it('populates regions on success, newest-first as the endpoint returns them', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a' }), region({ id: 'b' })])
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      expect(store.regions.map((current) => current.id)).toEqual(['a', 'b'])
    })

    it('keeps the last-known region list when the fetch fails', async () => {
      apiMock.listOfflineRegions.mockResolvedValueOnce([region({ id: 'a' })])
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      apiMock.listOfflineRegions.mockRejectedValueOnce(new Error('offline'))
      await store.fetchRegions()
      expect(store.regions.map((current) => current.id)).toEqual(['a'])
    })
  })

  describe('draftEstimate', () => {
    it('is null until both status and a drawn area exist', () => {
      const store = useOfflineMapsStore()
      expect(store.draftEstimate).toBeNull()
    })

    it('computes a live estimate once status and a draft area exist', async () => {
      apiMock.getOfflineMapStatus.mockResolvedValue(STATUS)
      const store = useOfflineMapsStore()
      await store.fetchStatus()
      store.setDraftBbox(-1, 50, 1, 52)
      expect(store.draftEstimate).not.toBeNull()
      expect(store.draftEstimate!.basemapTiles).toBeGreaterThan(0)
    })
  })

  describe('fetchServerEstimate', () => {
    it('returns null without a drawn area (no round trip)', async () => {
      const store = useOfflineMapsStore()
      const result = await store.fetchServerEstimate()
      expect(result).toBeNull()
    })

    it('requests the authoritative estimate for the current draft', async () => {
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      store.setDraftMaxZoom(10)
      const serverEstimate = {
        basemap_tiles: 5,
        basemap_bytes: 500,
        terrain_tiles: 2,
        terrain_bytes: 100,
        total_bytes: 600,
        free_bytes: 1000,
        fits: true,
      }
      apiMock.estimateOfflineArea.mockResolvedValue(serverEstimate)
      const result = await store.fetchServerEstimate()
      expect(result).toEqual(serverEstimate)
      expect(apiMock.estimateOfflineArea).toHaveBeenCalledWith({
        west: -1,
        south: 50,
        east: 1,
        north: 52,
        max_zoom: 10,
        include_basemap: true,
        include_terrain: true,
      })
    })

    it('returns null when the server rejects the estimate request', async () => {
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      apiMock.estimateOfflineArea.mockRejectedValue(new OfflineMapsApiError(422, 'bad bbox'))
      expect(await store.fetchServerEstimate()).toBeNull()
    })
  })

  describe('createRegionFromDraft', () => {
    it('does nothing and returns false with no drawn area', async () => {
      const store = useOfflineMapsStore()
      expect(await store.createRegionFromDraft()).toBe(false)
      expect(apiMock.createOfflineRegion).not.toHaveBeenCalled()
    })

    it('queues the draft, defaulting an empty label to "Untitled area"', async () => {
      const created = region({ id: 'new', label: 'Untitled area' })
      apiMock.createOfflineRegion.mockResolvedValue(created)
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      const ok = await store.createRegionFromDraft()
      expect(ok).toBe(true)
      expect(apiMock.createOfflineRegion).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Untitled area' }),
      )
      expect(store.regions[0]).toEqual(created)
      expect(store.lastCreatedRegionId).toBe('new')
    })

    it('sends the label, then clears it once the download is queued', async () => {
      apiMock.createOfflineRegion.mockResolvedValue(region({ id: 'new', label: 'Lake District' }))
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      store.setDraftLabel('Lake District')
      expect(await store.createRegionFromDraft()).toBe(true)
      expect(apiMock.createOfflineRegion).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Lake District' }),
      )
      expect(store.draft.label).toBe('')
      // Cleared in storage too, so a reload does not bring the old label back.
      expect(JSON.parse(localStorage.getItem('sentinel_offlineMapsDraft')!).label).toBe('')
    })

    it('keeps the label when the download is rejected, so it can be retried', async () => {
      apiMock.createOfflineRegion.mockRejectedValue(new OfflineMapsApiError(422, 'bad'))
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      store.setDraftLabel('Lake District')
      expect(await store.createRegionFromDraft()).toBe(false)
      expect(store.draft.label).toBe('Lake District')
    })

    it('trims a whitespace-only label down to the "Untitled area" default', async () => {
      const created = region({ id: 'new' })
      apiMock.createOfflineRegion.mockResolvedValue(created)
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      store.setDraftLabel('   ')
      await store.createRegionFromDraft()
      expect(apiMock.createOfflineRegion).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Untitled area' }),
      )
    })

    it('sets submitting true only while the request is in flight', async () => {
      let resolveCreate!: (value: OfflineRegion) => void
      apiMock.createOfflineRegion.mockReturnValue(
        new Promise((resolve) => (resolveCreate = resolve)),
      )
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      const pending = store.createRegionFromDraft()
      expect(store.submitting).toBe(true)
      resolveCreate(region({ id: 'new' }))
      await pending
      expect(store.submitting).toBe(false)
    })

    it('is a no-op while a create is already submitting', async () => {
      apiMock.createOfflineRegion.mockReturnValue(new Promise(() => {}))
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      void store.createRegionFromDraft()
      expect(await store.createRegionFromDraft()).toBe(false)
      expect(apiMock.createOfflineRegion).toHaveBeenCalledTimes(1)
    })

    it.each([
      [422, 'The area is not valid.'],
      [507, 'Not enough free disk space.'],
      [409, 'A download is already outstanding.'],
      [503, 'The offline tile source is unreachable.'],
    ])(
      'captures a %s rejection message in submitError rather than throwing',
      async (status, message) => {
        apiMock.createOfflineRegion.mockRejectedValue(new OfflineMapsApiError(status, message))
        const store = useOfflineMapsStore()
        store.setDraftBbox(-1, 50, 1, 52)
        const ok = await store.createRegionFromDraft()
        expect(ok).toBe(false)
        expect(store.submitError).toBe(message)
      },
    )

    it('falls back to a generic submitError for a non-API error', async () => {
      apiMock.createOfflineRegion.mockRejectedValue(new Error('boom'))
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      await store.createRegionFromDraft()
      expect(store.submitError).toBe('Could not start the download.')
    })

    it('clears a previous submitError on a later successful create', async () => {
      apiMock.createOfflineRegion.mockRejectedValueOnce(new OfflineMapsApiError(422, 'bad'))
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      await store.createRegionFromDraft()
      expect(store.submitError).toBe('bad')
      apiMock.createOfflineRegion.mockResolvedValueOnce(region({ id: 'new' }))
      await store.createRegionFromDraft()
      expect(store.submitError).toBeNull()
    })

    it('starts polling once a non-terminal region has been queued', async () => {
      apiMock.createOfflineRegion.mockResolvedValue(region({ id: 'new', status: 'queued' }))
      apiMock.getOfflineRegion.mockResolvedValue(region({ id: 'new', status: 'running' }))
      const store = useOfflineMapsStore()
      store.setDraftBbox(-1, 50, 1, 52)
      await store.createRegionFromDraft()
      await vi.advanceTimersByTimeAsync(1500)
      expect(apiMock.getOfflineRegion).toHaveBeenCalledWith('new')
    })
  })

  describe('polling non-terminal regions', () => {
    it('polls every currently non-terminal region on each tick', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([
        region({ id: 'a', status: 'queued' }),
        region({ id: 'b', status: 'running' }),
        region({ id: 'c', status: 'complete' }),
      ])
      apiMock.getOfflineRegion.mockImplementation((id: string) =>
        Promise.resolve(region({ id, status: 'running' })),
      )
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      await vi.advanceTimersByTimeAsync(1500)
      expect(apiMock.getOfflineRegion).toHaveBeenCalledWith('a')
      expect(apiMock.getOfflineRegion).toHaveBeenCalledWith('b')
      expect(apiMock.getOfflineRegion).not.toHaveBeenCalledWith('c')
    })

    it('skips a tick while the previous poll round trip is still in flight', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a', status: 'running' })])
      let resolveSlowPoll: (value: OfflineRegion) => void = () => {}
      apiMock.getOfflineRegion.mockImplementation(
        () =>
          new Promise<OfflineRegion>((resolve) => {
            resolveSlowPoll = resolve
          }),
      )
      const store = useOfflineMapsStore()
      // fetchRegions starts the interval and fires one poll at once; that
      // poll never answers until resolveSlowPoll is called.
      await store.fetchRegions()
      expect(apiMock.getOfflineRegion).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1500 * 3)
      expect(apiMock.getOfflineRegion).toHaveBeenCalledTimes(1)
      resolveSlowPoll(region({ id: 'a', status: 'running' }))
      await vi.advanceTimersByTimeAsync(1500)
      expect(apiMock.getOfflineRegion).toHaveBeenCalledTimes(2)
    })

    it('stops polling once no non-terminal region remains', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a', status: 'queued' })])
      apiMock.getOfflineRegion.mockResolvedValue(region({ id: 'a', status: 'complete' }))
      apiMock.getOfflineMapStatus.mockResolvedValue(STATUS)
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      await vi.advanceTimersByTimeAsync(1500)
      expect(apiMock.getOfflineRegion).toHaveBeenCalledTimes(1)
      // A further tick's worth of time must not poll again — the interval was cleared.
      await vi.advanceTimersByTimeAsync(3000)
      expect(apiMock.getOfflineRegion).toHaveBeenCalledTimes(1)
    })

    it('a non-404 poll failure leaves the region tracked for the next tick', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a', status: 'queued' })])
      apiMock.getOfflineRegion
        .mockRejectedValueOnce(new Error('network blip'))
        .mockResolvedValueOnce(region({ id: 'a', status: 'running' }))
      const store = useOfflineMapsStore()
      // fetchRegions() itself fires one immediate poll tick (tick 0, on top of
      // the interval) — settle that microtask-only, with no timer advance yet,
      // so the two ticks under test can be told apart.
      await store.fetchRegions()
      await vi.advanceTimersByTimeAsync(0)
      expect(store.regions.find((current) => current.id === 'a')?.status).toBe('queued') // unchanged by tick 0's failure

      await vi.advanceTimersByTimeAsync(1500) // the first real interval tick
      expect(store.regions.find((current) => current.id === 'a')?.status).toBe('running')
    })

    it('a confirmed 404 removes the region from the list', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a', status: 'queued' })])
      apiMock.getOfflineRegion.mockRejectedValue(new OfflineMapsApiError(404, 'gone'))
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      await vi.advanceTimersByTimeAsync(1500)
      expect(store.regions).toHaveLength(0)
    })

    it('refreshes status once per tick after a region reaches a terminal state', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([
        region({ id: 'a', status: 'queued' }),
        region({ id: 'b', status: 'queued' }),
      ])
      apiMock.getOfflineRegion.mockImplementation((id: string) =>
        Promise.resolve(region({ id, status: 'complete' })),
      )
      apiMock.getOfflineMapStatus.mockResolvedValue(STATUS)
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      await vi.advanceTimersByTimeAsync(1500)
      // Both regions turned terminal in the same tick — status is refreshed once, not twice.
      expect(apiMock.getOfflineMapStatus).toHaveBeenCalledTimes(1)
    })

    it('does not refresh status when nothing reached a terminal state this tick', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a', status: 'queued' })])
      apiMock.getOfflineRegion.mockResolvedValue(region({ id: 'a', status: 'running' }))
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      await vi.advanceTimersByTimeAsync(1500)
      expect(apiMock.getOfflineMapStatus).not.toHaveBeenCalled()
    })

    it('does not start a second overlapping polling interval', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a', status: 'queued' })])
      apiMock.getOfflineRegion.mockResolvedValue(region({ id: 'a', status: 'running' }))
      const store = useOfflineMapsStore()
      await store.fetchRegions() // fires tick 0 (the immediate poll) — 1 call
      store.startPollingKnownRegions() // redundant call, e.g. from a component mounting
      await vi.advanceTimersByTimeAsync(1500) // exactly one interval tick — 1 more call
      expect(apiMock.getOfflineRegion).toHaveBeenCalledTimes(2)
      // A second (duplicate) interval would fire twice inside the next period
      // instead of once — proving the redundant startPollingKnownRegions()
      // call above never created one.
      await vi.advanceTimersByTimeAsync(1500)
      expect(apiMock.getOfflineRegion).toHaveBeenCalledTimes(3)
    })

    it('does not start polling when fetchRegions turns up nothing outstanding', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a', status: 'complete' })])
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      await vi.advanceTimersByTimeAsync(3000)
      expect(apiMock.getOfflineRegion).not.toHaveBeenCalled()
    })

    it('stops a running interval on the tick after its last tracked region was removed some other way (e.g. deleted before the next poll)', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a', status: 'queued' })])
      apiMock.getOfflineRegion.mockRejectedValue(new Error('should not be called again'))
      apiMock.deleteOfflineRegion.mockResolvedValue(undefined)
      apiMock.getOfflineMapStatus.mockResolvedValue(STATUS)
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      await vi.advanceTimersByTimeAsync(0) // let tick 0 (the immediate poll) settle
      apiMock.getOfflineRegion.mockClear()

      // The operator deletes the only outstanding region directly, without
      // waiting for a poll tick to observe it finishing — the interval is
      // still running at this point.
      await store.deleteRegion('a')
      expect(store.regions).toHaveLength(0)

      // The next scheduled tick finds nothing left to poll and stops itself.
      await vi.advanceTimersByTimeAsync(1500)
      expect(apiMock.getOfflineRegion).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(3000) // would poll again if the interval were still running
      expect(apiMock.getOfflineRegion).not.toHaveBeenCalled()
    })
  })

  describe('totalDownloadedBytes', () => {
    it('sums only complete regions size_bytes', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([
        region({ id: 'a', status: 'complete', size_bytes: 100 }),
        region({ id: 'b', status: 'failed', size_bytes: null }),
        region({ id: 'c', status: 'complete', size_bytes: 50 }),
      ])
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      expect(store.totalDownloadedBytes).toBe(150)
    })

    it('treats a complete region with a null size_bytes as contributing 0 (defensive fallback)', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([
        region({ id: 'a', status: 'complete', size_bytes: null }),
        region({ id: 'b', status: 'complete', size_bytes: 50 }),
      ])
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      expect(store.totalDownloadedBytes).toBe(50)
    })
  })

  describe('deleteRegion', () => {
    it('removes the region and refreshes status on success', async () => {
      apiMock.deleteOfflineRegion.mockResolvedValue(undefined)
      apiMock.getOfflineMapStatus.mockResolvedValue(STATUS)
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a' }), region({ id: 'b' })])
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      await store.deleteRegion('a')
      expect(store.regions.map((current) => current.id)).toEqual(['b'])
      expect(apiMock.getOfflineMapStatus).toHaveBeenCalled()
    })

    it('treats a 404 as an already-successful delete', async () => {
      apiMock.deleteOfflineRegion.mockRejectedValue(new OfflineMapsApiError(404, 'gone'))
      apiMock.getOfflineMapStatus.mockResolvedValue(STATUS)
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a' })])
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      await store.deleteRegion('a')
      expect(store.regions).toHaveLength(0)
    })

    it('keeps the row listed when the delete fails for any other reason', async () => {
      apiMock.deleteOfflineRegion.mockRejectedValue(new OfflineMapsApiError(409, 'still running'))
      apiMock.listOfflineRegions.mockResolvedValue([region({ id: 'a' })])
      const store = useOfflineMapsStore()
      await store.fetchRegions()
      await store.deleteRegion('a')
      expect(store.regions.map((current) => current.id)).toEqual(['a'])
      expect(apiMock.getOfflineMapStatus).not.toHaveBeenCalled()
    })
  })
})
