import { describe, it, expect, beforeEach, vi } from 'vitest'

// Fake for maplibre-contour's DemSource, whose manager's `fetchAndParseTile`
// our module wraps to substitute a flat tile when a fetch/decode fails — the
// same situation the real DemSource hits on a 204 (no tile at that zoom/x/y)
// or a genuinely missing neighbour at the edge of a regional extract.
const fakes = vi.hoisted(() => {
  const state = {
    demSources: [] as Array<Record<string, unknown>>,
    // "zoom/tileX/tileY" keys (e.g. "10/1/1") that the fake DemSource's fetch should fail for.
    failing: new Set<string>(),
    addProtocol: vi.fn(),
    // When true, the next DemSource construction throws — standing in for
    // maplibre-contour's own setup failing (a genuinely local, no-network step).
    failNextConstruction: false,
  }
  return state
})

vi.mock('maplibre-contour', () => ({
  default: {
    DemSource: class {
      options: Record<string, unknown>
      manager: {
        fetchAndParseTile: (
          zoom: number,
          tileX: number,
          tileY: number,
          abortController: AbortController,
        ) => Promise<{ width: number; height: number; data: Float32Array }>
      }
      constructor(options: Record<string, unknown>) {
        if (fakes.failNextConstruction) {
          fakes.failNextConstruction = false
          throw new Error('DemSource construction failed')
        }
        this.options = options
        this.manager = {
          // The stock parser: succeeds unless the zoom/x/y key was marked failing —
          // standing in for a 204/decode failure over the real HTTP fetch.
          fetchAndParseTile: async (zoom, tileX, tileY, abortController) => {
            if (abortController.signal.aborted) throw new Error('aborted')
            if (fakes.failing.has(`${zoom}/${tileX}/${tileY}`)) throw new Error('no tile')
            return { width: 256, height: 256, data: new Float32Array(256 * 256) }
          },
        }
        fakes.demSources.push(this as unknown as Record<string, unknown>)
      }
      setupMaplibre = vi.fn()
      contourProtocolUrl = vi.fn(
        (opts: unknown) => `dem-contour://{z}/{x}/{y}?${JSON.stringify(opts)}`,
      )
    },
  },
}))

vi.mock('maplibre-gl', () => ({ addProtocol: fakes.addProtocol }))

import {
  loadTerrainDem,
  _resetTerrainDem,
  CONTOUR_THRESHOLDS,
  TERRAIN_TILE_URL_TEMPLATE,
  TERRAIN_TILE_SIZE,
} from './terrainDem'

type Manager = (typeof fakes.demSources)[number]['manager'] & {
  fetchAndParseTile: (
    zoom: number,
    tileX: number,
    tileY: number,
    abortController: AbortController,
  ) => Promise<{ width: number; height: number; data: Float32Array }>
}
const manager = () => fakes.demSources[fakes.demSources.length - 1]!.manager as Manager

beforeEach(() => {
  _resetTerrainDem()
  fakes.demSources.length = 0
  fakes.failing.clear()
  fakes.failNextConstruction = false
})

describe('loadTerrainDem', () => {
  it('describes itself from the requested maxzoom', async () => {
    const dem = await loadTerrainDem(12)
    expect(dem.maxzoom).toBe(12)
    expect(dem.contourTilesUrl).toContain('dem-contour://')
    expect(dem.contourTilesUrl).toContain(JSON.stringify(CONTOUR_THRESHOLDS[9]))
  })

  it('configures a main-thread terrarium DemSource over the plain (unversioned) resolver endpoint and registers it once', async () => {
    await loadTerrainDem(12)
    await loadTerrainDem(12)
    expect(fakes.demSources).toHaveLength(1)
    const source = fakes.demSources[0]!
    expect(source.options).toMatchObject({
      url: TERRAIN_TILE_URL_TEMPLATE,
      encoding: 'terrarium',
      maxzoom: 12,
      worker: false,
    })
    expect(source.setupMaplibre).toHaveBeenCalledOnce()
  })

  it('reconfigures when a different maxzoom is requested', async () => {
    await loadTerrainDem(12)
    await loadTerrainDem(10)
    expect(fakes.demSources).toHaveLength(2)
    expect(fakes.demSources[1]!.options).toMatchObject({ maxzoom: 10 })
  })

  it('appends the tiers version to the resolver URL when one is given', async () => {
    await loadTerrainDem(12, 'abc123')
    expect(fakes.demSources[0]!.options).toMatchObject({
      url: `${TERRAIN_TILE_URL_TEMPLATE}?v=abc123`,
    })
  })

  it('un-memoises and rejects when configuring the DemSource fails, so a later call retries rather than replaying the failure', async () => {
    fakes.failNextConstruction = true
    await expect(loadTerrainDem(12)).rejects.toThrow('DemSource construction failed')

    // A later call for the same (maxzoom, tiersVersion) must try again, not
    // reuse/replay the rejected promise — proof the memo was cleared on failure.
    const dem = await loadTerrainDem(12)
    expect(dem.maxzoom).toBe(12)
  })

  it('reconfigures when the tiers version changes, so a completed/deleted region rebuilds the contours', async () => {
    await loadTerrainDem(12, 'v1')
    await loadTerrainDem(12, 'v1')
    expect(fakes.demSources).toHaveLength(1)
    await loadTerrainDem(12, 'v2')
    expect(fakes.demSources).toHaveLength(2)
    expect(fakes.demSources[1]!.options).toMatchObject({
      url: `${TERRAIN_TILE_URL_TEMPLATE}?v=v2`,
    })
  })
})

describe('missing-neighbour / 204 fallback', () => {
  it('passes real tiles through and remembers their size', async () => {
    await loadTerrainDem(12)
    const tile = await manager().fetchAndParseTile(10, 1, 1, new AbortController())
    expect(tile.width).toBe(256)
  })

  it('substitutes a flat tile of the last-seen size when a fetch fails (e.g. a 204)', async () => {
    await loadTerrainDem(12)
    fakes.failing.add('10/9/9')
    // No real tile seen yet → default size.
    const first = await manager().fetchAndParseTile(10, 9, 9, new AbortController())
    expect(first.width).toBe(TERRAIN_TILE_SIZE)
    expect(first.data.length).toBe(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE)
    expect(first.data.every((value) => value === 0)).toBe(true)

    await manager().fetchAndParseTile(10, 1, 1, new AbortController())
    const second = await manager().fetchAndParseTile(10, 9, 9, new AbortController())
    // Still failing at 10/9/9, but the flat substitute now matches the size of
    // the one real tile seen so far (256), not the module's own default.
    expect(second.width).toBe(256)
  })

  it('still propagates an abort rather than faking a tile', async () => {
    await loadTerrainDem(12)
    const abortController = new AbortController()
    abortController.abort()
    await expect(manager().fetchAndParseTile(10, 9, 9, abortController)).rejects.toThrow('aborted')
  })
})
