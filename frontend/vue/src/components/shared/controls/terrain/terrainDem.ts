// Offline elevation plumbing for the terrain overlay.
//
// The DEM is a Terrarium-encoded raster PMTiles archive (see README → Offline
// maps) served from the /assets static mount, so hillshade and contours work
// with no network at all. Hillshade is drawn natively by MapLibre straight from
// the `pmtiles://` URL. Contours are generated client-side by maplibre-contour,
// which normally fetches DEM tiles over HTTP — here its tile fetch is swapped
// for a direct PMTiles range read so it reads the same local archive.
import maplibregl from 'maplibre-gl'
import mlcontour from 'maplibre-contour'
import { PMTiles } from 'pmtiles'

export const TERRAIN_PMTILES_PATH = '/assets/tiles/uk-terrain.pmtiles'
export const TERRAIN_PMTILES_URL = `pmtiles://${TERRAIN_PMTILES_PATH}`

// Mapterhorn archives are 512px WebP tiles; MapLibre needs the size up front.
export const TERRAIN_TILE_SIZE = 512

// Metre intervals per zoom as [minor, index]. Zooms without an entry reuse the
// next lower one; below z9 there are no contours at all (too dense to read).
export const CONTOUR_THRESHOLDS: Record<number, [number, number]> = {
  9: [200, 1000],
  10: [100, 500],
  11: [50, 250],
  12: [25, 100],
  13: [10, 50],
}
export const CONTOUR_MIN_ZOOM = 9
export const CONTOUR_MAX_ZOOM = 15

export interface TerrainDem {
  /** Native max zoom of the DEM archive. */
  maxzoom: number
  /** [west, south, east, north] coverage of the archive. */
  bounds: [number, number, number, number]
  /** Tile URL template for the contour vector source (maplibre-contour protocol). */
  contourTilesUrl: string
}

interface DemTile {
  width: number
  height: number
  data: Float32Array
}
type FetchAndParse = (
  z: number,
  x: number,
  y: number,
  abortController: AbortController,
  timer?: unknown,
) => Promise<DemTile>
interface PatchableManager {
  getTile: (url: string, abortController: AbortController) => Promise<{ data: Blob }>
  fetchAndParseTile: FetchAndParse
}

let _dem: Promise<TerrainDem> | null = null

/**
 * Open the local DEM archive and register the contour protocol with MapLibre.
 * Memoised — the protocol must only be registered once per app lifetime. A
 * missing archive rejects, and the rejection is not cached so a later attempt
 * (e.g. after the file is installed) can succeed.
 */
export function loadTerrainDem(): Promise<TerrainDem> {
  if (!_dem) {
    _dem = openTerrainDem().catch((err: unknown) => {
      _dem = null
      throw err
    })
  }
  return _dem
}

/** Test hook: forget the memoised archive. */
export function _resetTerrainDem(): void {
  _dem = null
}

async function openTerrainDem(): Promise<TerrainDem> {
  const archive = new PMTiles(TERRAIN_PMTILES_PATH)
  // Rejects (404) when the archive is not installed — the caller reports that.
  const header = await archive.getHeader()
  const maxzoom = header.maxZoom

  const demSource = new mlcontour.DemSource({
    url: `${TERRAIN_PMTILES_URL}/{z}/{x}/{y}`,
    encoding: 'terrarium',
    maxzoom,
    // Contours are built on the main thread: maplibre-contour's worker fetches
    // tiles with plain fetch(), which cannot read a PMTiles archive. Decoding
    // (createImageBitmap) is still async, and tiles are cached, so the cost is
    // a few ms of marching-squares per tile.
    worker: false,
    cacheSize: 200,
  })
  const manager = demSource.manager as unknown as PatchableManager

  // Read tiles straight out of the archive instead of over HTTP.
  manager.getTile = async (url, abortController) => {
    const [z, x, y] = url.split('/').slice(-3).map(Number) as [number, number, number]
    const tile = await archive.getZxy(z, x, y, abortController.signal)
    if (!tile) throw new Error(`terrain: no DEM tile at ${z}/${x}/${y}`)
    return { data: new Blob([tile.data]) }
  }

  // Contour generation needs all 8 neighbours of a tile and fails the whole
  // tile if any is missing. At the edge of a regional extract neighbours are
  // absent, so substitute a flat sea-level tile rather than dropping contours.
  let tileSize = TERRAIN_TILE_SIZE
  const fetchAndParse = manager.fetchAndParseTile
  manager.fetchAndParseTile = async (z, x, y, abortController, timer) => {
    try {
      const tile = await fetchAndParse(z, x, y, abortController, timer)
      tileSize = tile.width
      return tile
    } catch (err) {
      if (abortController.signal.aborted) throw err
      return { width: tileSize, height: tileSize, data: new Float32Array(tileSize * tileSize) }
    }
  }

  demSource.setupMaplibre(maplibregl)

  return {
    maxzoom,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    contourTilesUrl: demSource.contourProtocolUrl({
      thresholds: CONTOUR_THRESHOLDS,
      elevationKey: 'ele',
      levelKey: 'level',
      contourLayer: 'contours',
      buffer: 1,
      // Build from the parent zoom's tile: with 512px source tiles this halves
      // the DEM work per contour tile with no visible loss.
      overzoom: 1,
    }),
  }
}
