/**
 * Typed client for `/api/offline-map/*` — user-selected offline map area
 * downloads (see `docs/plans/offline-map-downloads.md`, "BUILD CONTRACT").
 *
 * Follows `sentryApi.ts`'s house style: one function per route, typed
 * request/response shapes, snake_case wire fields kept verbatim (the whole
 * app's JSON convention), times in epoch milliseconds. Unlike `sentryApi.ts`
 * this surface has no need to relay a proxied service's own error envelope —
 * FastAPI's own `{"detail": ...}` shape is enough — so failures are reported
 * with a small dedicated error class rather than the fuller envelope parser.
 */

const BASE = '/api/offline-map'

/** The area a download (or an estimate) covers, plus what to fetch for it. */
export interface OfflineAreaRequest {
  west: number
  south: number
  east: number
  north: number
  max_zoom: number
  include_basemap: boolean
  include_terrain: boolean
}

/** `POST /api/offline-map/estimate` response — the live size/tile-count preview. */
export interface OfflineAreaEstimate {
  basemap_tiles: number
  basemap_bytes: number
  terrain_tiles: number
  terrain_bytes: number
  total_bytes: number
  free_bytes: number
  fits: boolean
}

export type OfflineRegionStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'
export type OfflineRegionPhase = 'basemap' | 'terrain' | null

/** One downloaded (or downloading) offline area, as `GET`/`POST` return it. */
export interface OfflineRegion {
  id: string
  label: string
  west: number
  south: number
  east: number
  north: number
  max_zoom: number
  include_basemap: boolean
  include_terrain: boolean
  status: OfflineRegionStatus
  phase: OfflineRegionPhase
  bytes_done: number
  bytes_estimated: number
  tiles_estimated: number
  /** Null until the job finishes (queued/running/failed/cancelled have no final size yet). */
  size_bytes: number | null
  error: string | null
  created_at: number
  completed_at: number | null
}

/** Per-zoom average tile size, string zoom keys ("0".."14"/"12"), used identically by
 *  client and server so the live estimate can never disagree with the backend's own. */
export type AvgTileBytesTable = Record<string, number>

/** `GET /api/offline-map/status` — everything the settings UI needs up front. */
export interface OfflineMapStatus {
  basemap_available: boolean
  terrain_available: boolean
  basemap_max_zoom: number
  terrain_max_zoom: number
  free_bytes: number
  used_bytes: number
  sources_configured: boolean
  pmtiles_available: boolean
  /** Changes whenever a region completes or is deleted — bump the maps' tile cache on change. */
  tiers_version: string
  avg_tile_bytes: { basemap: AvgTileBytesTable; terrain: AvgTileBytesTable }
}

/** Thrown by every mutating/queueing call below on a non-2xx response. */
export class OfflineMapsApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'OfflineMapsApiError'
    this.status = status
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as unknown
    if (body !== null && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) {
        const messages = detail
          .map((entry) =>
            entry !== null && typeof entry === 'object' && 'msg' in entry
              ? String((entry as { msg: unknown }).msg)
              : null,
          )
          .filter((message): message is string => message !== null)
        if (messages.length > 0) return messages.join('; ')
      }
    }
  } catch {
    /* non-JSON error body — fall through to the generic message below */
  }
  return `Request failed (HTTP ${response.status}).`
}

async function requestJson<TResponse>(url: string, init?: RequestInit): Promise<TResponse> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new OfflineMapsApiError(0, 'Could not reach Sentinel.')
  }
  if (!response.ok) {
    throw new OfflineMapsApiError(response.status, await extractErrorMessage(response))
  }
  if (response.status === 204) return undefined as TResponse
  return (await response.json()) as TResponse
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/** Configured sources, disk space and the calibration table the live estimate uses. */
export async function getOfflineMapStatus(): Promise<OfflineMapStatus> {
  return requestJson<OfflineMapStatus>(`${BASE}/status`)
}

/** Authoritative pre-queue size check — the UI computes the same numbers live from `status`. */
export async function estimateOfflineArea(
  request: OfflineAreaRequest,
): Promise<OfflineAreaEstimate> {
  return requestJson<OfflineAreaEstimate>(`${BASE}/estimate`, jsonInit('POST', request))
}

/** Queue a download. Throws `OfflineMapsApiError` with status 507/409/503/422 on rejection. */
export async function createOfflineRegion(
  request: OfflineAreaRequest & { label: string },
): Promise<OfflineRegion> {
  return requestJson<OfflineRegion>(`${BASE}/regions`, jsonInit('POST', request))
}

/** Every known region, newest first — for the list and the map outlines. */
export async function listOfflineRegions(): Promise<OfflineRegion[]> {
  return requestJson<OfflineRegion[]>(`${BASE}/regions`)
}

/** One region's current status/progress — poll this while it is queued/running. */
export async function getOfflineRegion(regionId: string): Promise<OfflineRegion> {
  return requestJson<OfflineRegion>(`${BASE}/regions/${encodeURIComponent(regionId)}`)
}

/** Cancel a queued/running region, or delete a finished one's files and row. */
export async function deleteOfflineRegion(regionId: string): Promise<void> {
  await requestJson<undefined>(`${BASE}/regions/${encodeURIComponent(regionId)}`, {
    method: 'DELETE',
  })
}
