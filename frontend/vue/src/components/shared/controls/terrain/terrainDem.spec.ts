import { describe, it, expect, beforeEach, vi } from 'vitest'

// Fakes for the two libraries the module glues together. `pmtiles` supplies the
// archive header + raw tile bytes; `maplibre-contour` supplies the DemSource
// whose manager we patch to read from the archive.
const fakes = vi.hoisted(() => {
  const state = {
    header: {
      maxZoom: 12,
      minLon: -8.65,
      minLat: 49.84,
      maxLon: 1.77,
      maxLat: 60.86,
    } as Record<string, number>,
    headerError: null as Error | null,
    tiles: new Map<string, ArrayBuffer>(),
    demSources: [] as Array<Record<string, unknown>>,
    addProtocol: vi.fn(),
  }
  return state
})

vi.mock('pmtiles', () => ({
  PMTiles: class {
    path: string
    constructor(path: string) {
      this.path = path
    }
    async getHeader() {
      if (fakes.headerError) throw fakes.headerError
      return fakes.header
    }
    async getZxy(z: number, x: number, y: number) {
      const data = fakes.tiles.get(`${z}/${x}/${y}`)
      return data ? { data } : undefined
    }
  },
}))

vi.mock('maplibre-contour', () => ({
  default: {
    DemSource: class {
      options: Record<string, unknown>
      manager: {
        getTile: (url: string, ac: AbortController) => Promise<{ data: Blob }>
        fetchAndParseTile: (
          z: number,
          x: number,
          y: number,
          ac: AbortController,
        ) => Promise<{ width: number; height: number; data: Float32Array }>
      }
      constructor(options: Record<string, unknown>) {
        this.options = options
        this.manager = {
          getTile: vi.fn(),
          // The stock parser: succeeds only for tiles that exist in the archive.
          fetchAndParseTile: async (z, x, y, ac) => {
            await this.manager.getTile(`x://${z}/${x}/${y}`, ac)
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

vi.mock('maplibre-gl', () => ({ default: { addProtocol: fakes.addProtocol } }))

import {
  loadTerrainDem,
  _resetTerrainDem,
  CONTOUR_THRESHOLDS,
  TERRAIN_PMTILES_PATH,
  TERRAIN_PMTILES_URL,
  TERRAIN_TILE_SIZE,
} from './terrainDem'

type Manager = (typeof fakes.demSources)[number]['manager'] & {
  getTile: (url: string, ac: AbortController) => Promise<{ data: Blob }>
  fetchAndParseTile: (
    z: number,
    x: number,
    y: number,
    ac: AbortController,
  ) => Promise<{ width: number; height: number; data: Float32Array }>
}
const manager = () => fakes.demSources[fakes.demSources.length - 1]!.manager as Manager

beforeEach(() => {
  _resetTerrainDem()
  fakes.headerError = null
  fakes.tiles.clear()
  fakes.demSources.length = 0
})

describe('loadTerrainDem', () => {
  it('opens the archive and describes it from the header', async () => {
    const dem = await loadTerrainDem()
    expect(dem.maxzoom).toBe(12)
    expect(dem.bounds).toEqual([-8.65, 49.84, 1.77, 60.86])
    expect(dem.contourTilesUrl).toContain('dem-contour://')
    expect(dem.contourTilesUrl).toContain(JSON.stringify(CONTOUR_THRESHOLDS[9]))
  })

  it('configures a main-thread terrarium DemSource over the pmtiles URL and registers it once', async () => {
    await loadTerrainDem()
    await loadTerrainDem()
    expect(fakes.demSources).toHaveLength(1)
    const source = fakes.demSources[0]!
    expect(source.options).toMatchObject({
      url: `${TERRAIN_PMTILES_URL}/{z}/{x}/{y}`,
      encoding: 'terrarium',
      maxzoom: 12,
      worker: false,
    })
    expect(source.setupMaplibre).toHaveBeenCalledOnce()
    expect(TERRAIN_PMTILES_URL).toBe(`pmtiles://${TERRAIN_PMTILES_PATH}`)
  })

  it('rejects when the archive is missing and does not cache the failure', async () => {
    fakes.headerError = new Error('404')
    await expect(loadTerrainDem()).rejects.toThrow('404')
    fakes.headerError = null
    await expect(loadTerrainDem()).resolves.toBeTruthy()
  })
})

describe('archive-backed tile fetch', () => {
  it('reads tile bytes out of the archive by z/x/y parsed from the URL', async () => {
    await loadTerrainDem()
    fakes.tiles.set('10/511/340', new Uint8Array([1, 2, 3]).buffer)
    const res = await manager().getTile(`${TERRAIN_PMTILES_URL}/10/511/340`, new AbortController())
    expect(res.data).toBeInstanceOf(Blob)
    expect(res.data.size).toBe(3)
  })

  it('throws for a tile outside the archive', async () => {
    await loadTerrainDem()
    await expect(
      manager().getTile(`${TERRAIN_PMTILES_URL}/10/1/1`, new AbortController()),
    ).rejects.toThrow('no DEM tile at 10/1/1')
  })
})

describe('missing-neighbour fallback', () => {
  it('passes real tiles through and remembers their size', async () => {
    await loadTerrainDem()
    fakes.tiles.set('10/1/1', new ArrayBuffer(1))
    const tile = await manager().fetchAndParseTile(10, 1, 1, new AbortController())
    expect(tile.width).toBe(256)
  })

  it('substitutes a flat tile of the last-seen size when a neighbour is missing', async () => {
    await loadTerrainDem()
    // No real tile seen yet → default size.
    const first = await manager().fetchAndParseTile(10, 9, 9, new AbortController())
    expect(first.width).toBe(TERRAIN_TILE_SIZE)
    expect(first.data.length).toBe(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE)
    expect(first.data.every((v) => v === 0)).toBe(true)

    fakes.tiles.set('10/1/1', new ArrayBuffer(1))
    await manager().fetchAndParseTile(10, 1, 1, new AbortController())
    const second = await manager().fetchAndParseTile(10, 9, 9, new AbortController())
    expect(second.width).toBe(256)
  })

  it('still propagates an abort rather than faking a tile', async () => {
    await loadTerrainDem()
    const ac = new AbortController()
    ac.abort()
    await expect(manager().fetchAndParseTile(10, 9, 9, ac)).rejects.toThrow('no DEM tile')
  })
})
