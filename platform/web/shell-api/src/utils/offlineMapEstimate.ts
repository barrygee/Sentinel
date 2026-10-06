import type { AvgTileBytesTable } from '@sentinel/shell-api/services/offlineMapsApi'

/**
 * Client-side mirror of the backend's tile-count/byte-size estimate
 * (`backend/services/offline_map/estimator.py` — kept in exact numeric lock
 * step with it, including the tile-index clamping and the "nearest lower
 * zoom" calibration fallback, so the client's live preview and the server's
 * authoritative `/estimate`/507-gate check can never disagree). Kept as a pure
 * function, with no store or network access, so it can run on every drag
 * frame, field edit or checkbox toggle with no round trip.
 *
 * The byte side is only as good as `avgTileBytes`, which is `status.
 * avg_tile_bytes` verbatim.
 */

/** Web Mercator's usable latitude range (MapLibre/Leaflet convention) — matches the
 *  backend's `MAX_MERCATOR_LATITUDE` exactly. */
const MAX_MERCATOR_LATITUDE = 85.05112878

/** Terrain is never extracted deeper than z12 — Mapterhorn's global build stops there. */
export const OFFLINE_TERRAIN_MAX_ZOOM = 12

/**
 * The same safety margin the backend's `POST /regions` disk-space gate applies
 * (`settings.offline_disk_margin_ratio`, `backend/config.py`) — mirrored here
 * so the client's "exceeds free space" warning trips at the same threshold the
 * server would actually reject at, rather than a gap where Download looks
 * enabled but a 507 follows anyway.
 */
export const OFFLINE_DISK_MARGIN_RATIO = 1.1

export interface OfflineAreaEstimateInput {
  west: number
  south: number
  east: number
  north: number
  maxZoom: number
  includeBasemap: boolean
  includeTerrain: boolean
  avgTileBytes: { basemap: AvgTileBytesTable; terrain: AvgTileBytesTable }
}

export interface OfflineAreaEstimateResult {
  basemapTiles: number
  basemapBytes: number
  terrainTiles: number
  terrainBytes: number
  totalBytes: number
}

/** Web Mercator tile column for a longitude at a zoom level, clamped to the grid
 *  (mirrors the backend's `_lon_to_tile_x`). */
function longitudeToTileColumn(longitudeDegrees: number, zoom: number): number {
  const tileGridWidth = 2 ** zoom
  const column = Math.trunc(((longitudeDegrees + 180) / 360) * tileGridWidth)
  return Math.max(0, Math.min(tileGridWidth - 1, column))
}

/** Web Mercator tile row for a latitude at a zoom level, clamped to the grid
 *  (mirrors the backend's `_lat_to_tile_y`). */
function latitudeToTileRow(latitudeDegrees: number, zoom: number): number {
  const clampedLatitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitudeDegrees),
  )
  const latitudeRadians = (clampedLatitude * Math.PI) / 180
  const tileGridHeight = 2 ** zoom
  const row = Math.trunc(
    ((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * tileGridHeight,
  )
  return Math.max(0, Math.min(tileGridHeight - 1, row))
}

/** Exact count of tiles covering `[west, south, east, north]` at one zoom level
 *  (mirrors the backend's `tile_count_at_zoom`; assumes an already-validated
 *  bbox with west<east and south<north). */
function tileCountAtZoom(
  west: number,
  south: number,
  east: number,
  north: number,
  zoom: number,
): number {
  const minColumn = longitudeToTileColumn(west, zoom)
  const maxColumn = longitudeToTileColumn(east, zoom)
  // Latitude decreases as tile row increases, so north gives the smaller row.
  const minRow = latitudeToTileRow(north, zoom)
  const maxRow = latitudeToTileRow(south, zoom)
  return (maxColumn - minColumn + 1) * (maxRow - minRow + 1)
}

/**
 * Calibrated average bytes for a zoom, falling back to the nearest zoom below
 * it, then the nearest above, then 0 for a wholly empty table — mirrors the
 * backend's `_avg_bytes_for_zoom` exactly (tables are always dense from 0 in
 * practice, so the fallback only matters for a sparse/empty calibration table).
 */
function averageBytesForZoom(table: AvgTileBytesTable, zoom: number): number {
  const exactKey = String(zoom)
  if (exactKey in table) return table[exactKey]!
  const knownZooms = Object.keys(table).map(Number)
  const zoomsAtOrBelow = knownZooms.filter((knownZoom) => knownZoom <= zoom)
  if (zoomsAtOrBelow.length > 0) {
    return table[String(Math.max(...zoomsAtOrBelow))]!
  }
  const zoomsAbove = knownZooms.filter((knownZoom) => knownZoom > zoom)
  return zoomsAbove.length > 0 ? table[String(Math.min(...zoomsAbove))]! : 0
}

/**
 * Sum tile count and estimated bytes for `zoom 0..maxZoom` (never a partial
 * pyramid — every zoom below the target is needed to zoom out offline).
 */
function estimateLayer(
  west: number,
  south: number,
  east: number,
  north: number,
  maxZoom: number,
  avgTileBytesByZoom: AvgTileBytesTable,
): { tiles: number; bytes: number } {
  let tiles = 0
  let bytes = 0
  for (let zoom = 0; zoom <= maxZoom; zoom += 1) {
    const tilesAtZoom = tileCountAtZoom(west, south, east, north, zoom)
    tiles += tilesAtZoom
    bytes += tilesAtZoom * averageBytesForZoom(avgTileBytesByZoom, zoom)
  }
  return { tiles, bytes }
}

/**
 * Estimate the download this area/depth/content selection would need. Mirrors
 * `AreaRequest`'s validation shape but does not itself validate — callers
 * should only call this with an already-valid bbox/zoom (an invalid one is
 * reported by the form fields, not by silently returning a wrong estimate).
 */
export function estimateOfflineArea(input: OfflineAreaEstimateInput): OfflineAreaEstimateResult {
  const basemap = input.includeBasemap
    ? estimateLayer(
        input.west,
        input.south,
        input.east,
        input.north,
        input.maxZoom,
        input.avgTileBytes.basemap,
      )
    : { tiles: 0, bytes: 0 }
  const terrain = input.includeTerrain
    ? estimateLayer(
        input.west,
        input.south,
        input.east,
        input.north,
        Math.min(input.maxZoom, OFFLINE_TERRAIN_MAX_ZOOM),
        input.avgTileBytes.terrain,
      )
    : { tiles: 0, bytes: 0 }
  return {
    basemapTiles: basemap.tiles,
    basemapBytes: basemap.bytes,
    terrainTiles: terrain.tiles,
    terrainBytes: terrain.bytes,
    totalBytes: basemap.bytes + terrain.bytes,
  }
}

/** Format a byte count the way the estimate/region list want it: "1.2 GB", "184 MB", "512 KB". */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const decimals = value < 10 ? 1 : 0
  return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

/** Format a tile count with thousands separators, e.g. "184,300". */
export function formatTileCount(tiles: number): string {
  return tiles.toLocaleString('en-GB')
}
