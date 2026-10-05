import { describe, it, expect } from 'vitest'
import {
  estimateOfflineArea,
  formatByteSize,
  formatTileCount,
  OFFLINE_TERRAIN_MAX_ZOOM,
  OFFLINE_DISK_MARGIN_RATIO,
} from './offlineMapEstimate'

const EMPTY_TABLE = { basemap: {}, terrain: {} }

describe('estimateOfflineArea', () => {
  it('counts exactly one tile at zoom 0 regardless of the bbox', () => {
    const result = estimateOfflineArea({
      west: -3.2,
      south: 54.3,
      east: -2.9,
      north: 54.6,
      maxZoom: 0,
      includeBasemap: true,
      includeTerrain: false,
      avgTileBytes: EMPTY_TABLE,
    })
    expect(result.basemapTiles).toBe(1)
    expect(result.terrainTiles).toBe(0)
  })

  it('clamps latitude to the Web Mercator limit rather than producing an out-of-grid row', () => {
    // A north bound past the Mercator limit must not throw or index outside
    // the tile grid: both extremes clamp to the same edge row.
    const clampedNorth = estimateOfflineArea({
      west: -1,
      south: 84,
      east: 1,
      north: 90,
      maxZoom: 4,
      includeBasemap: true,
      includeTerrain: false,
      avgTileBytes: EMPTY_TABLE,
    })
    const exactLimit = estimateOfflineArea({
      west: -1,
      south: 84,
      east: 1,
      north: 85.05112878,
      maxZoom: 4,
      includeBasemap: true,
      includeTerrain: false,
      avgTileBytes: EMPTY_TABLE,
    })
    expect(clampedNorth.basemapTiles).toBe(exactLimit.basemapTiles)
  })

  it('clamps a +180 east edge to the last grid column instead of computing an out-of-grid one', () => {
    // Without the clamp, east=180 at z3 computes tile column 8 (one past the
    // last valid column, 7) and the tile-count formula would then count 9
    // columns instead of 8 — so this must match the east=179.999 case exactly.
    const exactlyAtEdge = estimateOfflineArea({
      west: -1,
      south: -10,
      east: 180,
      north: 10,
      maxZoom: 3,
      includeBasemap: true,
      includeTerrain: false,
      avgTileBytes: EMPTY_TABLE,
    })
    const justInsideEdge = estimateOfflineArea({
      west: -1,
      south: -10,
      east: 179.999,
      north: 10,
      maxZoom: 3,
      includeBasemap: true,
      includeTerrain: false,
      avgTileBytes: EMPTY_TABLE,
    })
    expect(exactlyAtEdge.basemapTiles).toBe(justInsideEdge.basemapTiles)
  })

  it('clamps terrain to min(maxZoom, 12) even when the basemap depth goes deeper', () => {
    const shallow = estimateOfflineArea({
      west: -1,
      south: 50,
      east: 1,
      north: 52,
      maxZoom: OFFLINE_TERRAIN_MAX_ZOOM,
      includeBasemap: false,
      includeTerrain: true,
      avgTileBytes: EMPTY_TABLE,
    })
    const deep = estimateOfflineArea({
      west: -1,
      south: 50,
      east: 1,
      north: 52,
      maxZoom: 14,
      includeBasemap: false,
      includeTerrain: true,
      avgTileBytes: EMPTY_TABLE,
    })
    // Terrain depth is capped at 12 regardless of how deep the basemap goes,
    // so the tile counts must be identical between z12 and z14 requests.
    expect(deep.terrainTiles).toBe(shallow.terrainTiles)
  })

  it('returns zero tiles/bytes for a layer the caller did not include', () => {
    const result = estimateOfflineArea({
      west: -1,
      south: 50,
      east: 1,
      north: 52,
      maxZoom: 10,
      includeBasemap: false,
      includeTerrain: false,
      avgTileBytes: EMPTY_TABLE,
    })
    expect(result).toEqual({
      basemapTiles: 0,
      basemapBytes: 0,
      terrainTiles: 0,
      terrainBytes: 0,
      totalBytes: 0,
    })
  })

  it('falls back to the nearest lower calibrated zoom for bytes when the exact zoom is missing', () => {
    const table = { basemap: { '0': 100, '2': 400 }, terrain: {} }
    const atZoomOne = estimateOfflineArea({
      west: -1,
      south: 50,
      east: 1,
      north: 52,
      maxZoom: 1,
      includeBasemap: true,
      includeTerrain: false,
      avgTileBytes: table,
    })
    // z1 has no entry, so it falls back to z0's 100 (nearest zoom AT or BELOW).
    // z0 contributes 1 tile * 100; z1 contributes some tiles * 100 as well.
    const z0Only = estimateOfflineArea({
      west: -1,
      south: 50,
      east: 1,
      north: 52,
      maxZoom: 0,
      includeBasemap: true,
      includeTerrain: false,
      avgTileBytes: table,
    })
    const z1TileCount = atZoomOne.basemapTiles - z0Only.basemapTiles
    expect(atZoomOne.basemapBytes).toBe(z0Only.basemapBytes + z1TileCount * 100)
  })

  it('falls back to the nearest zoom ABOVE when nothing calibrated exists at or below', () => {
    const table = { basemap: { '5': 500 }, terrain: {} }
    const result = estimateOfflineArea({
      west: -1,
      south: 50,
      east: 1,
      north: 52,
      maxZoom: 0,
      includeBasemap: true,
      includeTerrain: false,
      avgTileBytes: table,
    })
    // Only zoom 0 is summed (maxZoom=0) and the only known zoom (5) is above it,
    // so the single z0 tile is priced at the z5 rate (500) via the "above" fallback.
    expect(result.basemapBytes).toBe(result.basemapTiles * 500)
  })

  it('prices every tile at 0 for a wholly empty calibration table', () => {
    const result = estimateOfflineArea({
      west: -1,
      south: 50,
      east: 1,
      north: 52,
      maxZoom: 3,
      includeBasemap: true,
      includeTerrain: false,
      avgTileBytes: EMPTY_TABLE,
    })
    expect(result.basemapBytes).toBe(0)
    expect(result.basemapTiles).toBeGreaterThan(0)
  })

  it('sums basemap and terrain bytes into totalBytes', () => {
    const table = { basemap: { '0': 10 }, terrain: { '0': 5 } }
    const result = estimateOfflineArea({
      west: -1,
      south: 50,
      east: 1,
      north: 52,
      maxZoom: 0,
      includeBasemap: true,
      includeTerrain: true,
      avgTileBytes: table,
    })
    expect(result.totalBytes).toBe(result.basemapBytes + result.terrainBytes)
    expect(result.totalBytes).toBeGreaterThan(0)
  })

  it('keeps the OFFLINE_DISK_MARGIN_RATIO safety margin above 1', () => {
    expect(OFFLINE_DISK_MARGIN_RATIO).toBeGreaterThan(1)
  })
})

describe('formatByteSize', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [10 * 1024, '10 KB'],
    [1024 * 1024, '1.0 MB'],
    [1024 * 1024 * 1024, '1.0 GB'],
    [1024 * 1024 * 1024 * 1024, '1.0 TB'],
    [1024 * 1024 * 1024 * 1024 * 1024, '1024 TB'],
  ])('formats %i bytes as %s', (bytes, expected) => {
    expect(formatByteSize(bytes)).toBe(expected)
  })
})

describe('formatTileCount', () => {
  it('adds thousands separators', () => {
    expect(formatTileCount(184300)).toBe('184,300')
  })

  it('formats a small count with no separator', () => {
    expect(formatTileCount(7)).toBe('7')
  })

  it('formats zero', () => {
    expect(formatTileCount(0)).toBe('0')
  })
})
