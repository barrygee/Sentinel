import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getOfflineMapStatus,
  estimateOfflineArea,
  createOfflineRegion,
  listOfflineRegions,
  getOfflineRegion,
  deleteOfflineRegion,
  OfflineMapsApiError,
  type OfflineRegion,
} from './offlineMapsApi'

const STATUS_RESPONSE = {
  basemap_available: true,
  terrain_available: true,
  basemap_max_zoom: 14,
  terrain_max_zoom: 12,
  free_bytes: 1000,
  used_bytes: 0,
  sources_configured: true,
  pmtiles_available: true,
  tiers_version: 'v1',
  avg_tile_bytes: { basemap: {}, terrain: {} },
}

const REGION_RESPONSE: OfflineRegion = {
  id: 'abc-123',
  label: 'Lake District',
  west: -3.2,
  south: 54.3,
  east: -2.9,
  north: 54.6,
  max_zoom: 12,
  include_basemap: true,
  include_terrain: true,
  status: 'queued',
  phase: null,
  bytes_done: 0,
  bytes_estimated: 1000,
  tiles_estimated: 10,
  size_bytes: null,
  error: null,
  created_at: 1,
  completed_at: null,
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('offlineMapsApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('getOfflineMapStatus', () => {
    it('GETs /api/offline-map/status and returns the parsed body', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, STATUS_RESPONSE))
      const result = await getOfflineMapStatus()
      expect(fetch).toHaveBeenCalledWith('/api/offline-map/status', undefined)
      expect(result).toEqual(STATUS_RESPONSE)
    })
  })

  describe('estimateOfflineArea', () => {
    it('POSTs the bbox/zoom/content request as snake_case JSON', async () => {
      const estimateResponse = {
        basemap_tiles: 10,
        basemap_bytes: 100,
        terrain_tiles: 5,
        terrain_bytes: 50,
        total_bytes: 150,
        free_bytes: 1000,
        fits: true,
      }
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, estimateResponse))
      const request = {
        west: -3.2,
        south: 54.3,
        east: -2.9,
        north: 54.6,
        max_zoom: 12,
        include_basemap: true,
        include_terrain: false,
      }
      const result = await estimateOfflineArea(request)
      expect(fetch).toHaveBeenCalledWith('/api/offline-map/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      expect(result).toEqual(estimateResponse)
    })
  })

  describe('createOfflineRegion', () => {
    it('POSTs to /api/offline-map/regions and returns the created region', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(202, REGION_RESPONSE))
      const request = {
        west: -3.2,
        south: 54.3,
        east: -2.9,
        north: 54.6,
        max_zoom: 12,
        include_basemap: true,
        include_terrain: true,
        label: 'Lake District',
      }
      const result = await createOfflineRegion(request)
      expect(fetch).toHaveBeenCalledWith('/api/offline-map/regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      expect(result).toEqual(REGION_RESPONSE)
    })

    it.each([
      [422, 'The area is not valid.'],
      [507, 'Not enough free disk space.'],
      [409, 'A download is already in progress.'],
      [503, 'The offline tile source is unreachable.'],
    ])(
      'rejects with an OfflineMapsApiError carrying the %s status and detail',
      async (status, detail) => {
        vi.mocked(fetch).mockResolvedValue(jsonResponse(status, { detail }))
        await expect(
          createOfflineRegion({
            west: 0,
            south: 0,
            east: 1,
            north: 1,
            max_zoom: 12,
            include_basemap: true,
            include_terrain: true,
            label: 'x',
          }),
        ).rejects.toMatchObject({ name: 'OfflineMapsApiError', status, message: detail })
      },
    )

    it('joins a FastAPI validation-error array of messages with "; "', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(422, {
          detail: [{ msg: 'west must be finite' }, { msg: 'north must be greater than south' }],
        }),
      )
      await expect(
        createOfflineRegion({
          west: 0,
          south: 0,
          east: 1,
          north: 1,
          max_zoom: 12,
          include_basemap: true,
          include_terrain: true,
          label: 'x',
        }),
      ).rejects.toThrow('west must be finite; north must be greater than south')
    })

    it('skips array entries that are not {msg} objects, keeping the valid ones', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(422, { detail: [{ msg: 'west must be finite' }, 'not an object', null, 42] }),
      )
      await expect(
        createOfflineRegion({
          west: 0,
          south: 0,
          east: 1,
          north: 1,
          max_zoom: 12,
          include_basemap: true,
          include_terrain: true,
          label: 'x',
        }),
      ).rejects.toThrow('west must be finite')
    })

    it('falls back to the generic message when a validation-error array has no usable {msg} entries', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(422, { detail: ['not an object', null, 42] }))
      await expect(
        createOfflineRegion({
          west: 0,
          south: 0,
          east: 1,
          north: 1,
          max_zoom: 12,
          include_basemap: true,
          include_terrain: true,
          label: 'x',
        }),
      ).rejects.toThrow('Request failed (HTTP 422).')
    })

    it('falls back to a generic message when the error body has no usable detail', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { unexpected: true }))
      await expect(
        createOfflineRegion({
          west: 0,
          south: 0,
          east: 1,
          north: 1,
          max_zoom: 12,
          include_basemap: true,
          include_terrain: true,
          label: 'x',
        }),
      ).rejects.toThrow('Request failed (HTTP 500).')
    })

    it('falls back to the generic message when detail is neither a string nor an array', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { detail: { unexpected: 'shape' } }))
      await expect(
        createOfflineRegion({
          west: 0,
          south: 0,
          east: 1,
          north: 1,
          max_zoom: 12,
          include_basemap: true,
          include_terrain: true,
          label: 'x',
        }),
      ).rejects.toThrow('Request failed (HTTP 500).')
    })

    it('falls back to a generic message when the error body is not JSON', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      } as unknown as Response)
      await expect(
        createOfflineRegion({
          west: 0,
          south: 0,
          east: 1,
          north: 1,
          max_zoom: 12,
          include_basemap: true,
          include_terrain: true,
          label: 'x',
        }),
      ).rejects.toThrow('Request failed (HTTP 500).')
    })

    it('reports a network failure as a status-0 OfflineMapsApiError', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
      await expect(
        createOfflineRegion({
          west: 0,
          south: 0,
          east: 1,
          north: 1,
          max_zoom: 12,
          include_basemap: true,
          include_terrain: true,
          label: 'x',
        }),
      ).rejects.toMatchObject({ status: 0, message: 'Could not reach Sentinel.' })
    })
  })

  describe('listOfflineRegions', () => {
    it('GETs /api/offline-map/regions and returns the array', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [REGION_RESPONSE]))
      const result = await listOfflineRegions()
      expect(fetch).toHaveBeenCalledWith('/api/offline-map/regions', undefined)
      expect(result).toEqual([REGION_RESPONSE])
    })
  })

  describe('getOfflineRegion', () => {
    it('GETs the region by id, percent-encoding it into the path', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, REGION_RESPONSE))
      await getOfflineRegion('abc/123 xyz')
      expect(fetch).toHaveBeenCalledWith(
        `/api/offline-map/regions/${encodeURIComponent('abc/123 xyz')}`,
        undefined,
      )
    })

    it('rejects with a 404 OfflineMapsApiError when the region is gone', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { detail: 'Not found.' }))
      await expect(getOfflineRegion('gone')).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('deleteOfflineRegion', () => {
    it('DELETEs the region by id, percent-encoding it into the path', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.resolve(undefined),
      } as unknown as Response)
      await deleteOfflineRegion('abc/123')
      expect(fetch).toHaveBeenCalledWith(
        `/api/offline-map/regions/${encodeURIComponent('abc/123')}`,
        {
          method: 'DELETE',
        },
      )
    })

    it('rejects with an OfflineMapsApiError on failure', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { detail: 'Still running.' }))
      await expect(deleteOfflineRegion('id')).rejects.toBeInstanceOf(OfflineMapsApiError)
    })
  })
})
