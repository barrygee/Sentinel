// Elevation plumbing for the terrain overlay.
//
// The DEM is Terrarium-encoded, served by the backend's resolver endpoint
// (`GET /api/offline-map/terrain/{z}/{x}/{y}`, see
// `docs/plans/offline-map-downloads.md`): completed offline-region terrain
// archives newest first, then the bundled `uk-terrain.pmtiles`, else 204. That
// means this module no longer opens a PMTiles archive itself — the resolver
// does — and the contours (maplibre-contour) simply fetch it over plain HTTP
// like any other tile server. `TerrainToggleControl` is what knows *whether* terrain is available
// (`status.terrain_available`) and at what depth (`status.terrain_max_zoom`);
// this module only turns a maxzoom + tiers-version into a configured
// `mlcontour.DemSource`.
import * as maplibregl from 'maplibre-gl'
import mlcontour from 'maplibre-contour'
import { withTierVersion } from '@/utils/offlineTileVersion'

/** Tile URL template for the contour DEM fetch. */
export const TERRAIN_TILE_URL_TEMPLATE = '/api/offline-map/terrain/{z}/{x}/{y}'

// Mapterhorn/region archives are 512px WebP (or PNG) tiles; MapLibre needs the size up front.
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
  /** The maxzoom this DEM source was configured for (from `status.terrain_max_zoom`). */
  maxzoom: number
  /** Tile URL template for the contour vector source (maplibre-contour protocol). */
  contourTilesUrl: string
}

interface DemTile {
  width: number
  height: number
  data: Float32Array
}
type FetchAndParse = (
  zoom: number,
  tileX: number,
  tileY: number,
  abortController: AbortController,
  timer?: unknown,
) => Promise<DemTile>
interface PatchableManager {
  fetchAndParseTile: FetchAndParse
}

let _dem: Promise<TerrainDem> | null = null
let _demKey: string | null = null

function demKey(maxzoom: number, tiersVersion: string | null): string {
  return `${maxzoom}:${tiersVersion ?? ''}`
}

/**
 * Configure the contour protocol for the given terrain depth/tiers-version and
 * register it with MapLibre. Memoised per `(maxzoom, tiersVersion)` — either
 * changing forces a fresh `DemSource`, since maplibre-contour bakes both the
 * `url` and `maxzoom` in at construction; a `tiersVersion` change is how a
 * completed/deleted terrain region gets the contour layer to actually rebuild
 * against the new tiles rather than serving cached-empty (204) ones forever.
 */
export function loadTerrainDem(
  maxzoom: number,
  tiersVersion: string | null = null,
): Promise<TerrainDem> {
  const key = demKey(maxzoom, tiersVersion)
  if (!_dem || _demKey !== key) {
    _demKey = key
    _dem = openTerrainDem(maxzoom, tiersVersion).catch((error: unknown) => {
      _dem = null
      throw error
    })
  }
  return _dem
}

/** Test hook: forget the memoised DEM source. */
export function _resetTerrainDem(): void {
  _dem = null
  _demKey = null
}

async function openTerrainDem(maxzoom: number, tiersVersion: string | null): Promise<TerrainDem> {
  const demSource = new mlcontour.DemSource({
    url: withTierVersion(TERRAIN_TILE_URL_TEMPLATE, tiersVersion),
    encoding: 'terrarium',
    maxzoom,
    // Decoding stays on the main thread: the flat-tile substitution below is
    // patched onto this manager instance, and a worker would run its own copy
    // that never sees the patch, silently losing the fallback at the edge of
    // a regional extract. Revisit if maplibre-contour grows a way to apply
    // the patch worker-side too.
    worker: false,
    cacheSize: 200,
  })
  const manager = demSource.manager as unknown as PatchableManager

  // Contour generation needs all 8 neighbours of a tile and fails the whole
  // tile if any is missing. At the edge of a regional extract (or wherever
  // the resolver has no tile at all) the endpoint answers 204, which fails to
  // decode as an image — substitute a flat sea-level tile rather than
  // dropping contours, exactly as for a genuinely absent PMTiles tile before.
  let tileSize = TERRAIN_TILE_SIZE
  const fetchAndParse = manager.fetchAndParseTile
  manager.fetchAndParseTile = async (zoom, tileX, tileY, abortController, timer) => {
    try {
      const tile = await fetchAndParse(zoom, tileX, tileY, abortController, timer)
      tileSize = tile.width
      return tile
    } catch (error) {
      if (abortController.signal.aborted) throw error
      return { width: tileSize, height: tileSize, data: new Float32Array(tileSize * tileSize) }
    }
  }

  demSource.setupMaplibre(maplibregl)

  // maplibre-contour caches each contour tile and, with worker:false, hands
  // MapLibre the SAME ArrayBuffer every time that tile is asked for. MapLibre
  // transfers it to its worker, which detaches it, so the next request for the
  // tile (any style reload, e.g. going offline, re-requests everything) fails
  // with "DataCloneError: ArrayBuffer at index 0 is already detached". Replace
  // the handler with one that gives MapLibre its own copy each time.
  maplibregl.addProtocol(demSource.contourProtocolId, async (request, abortController) => {
    const response = await demSource.contourProtocolV4(request, abortController)
    const cached = response.data as ArrayBuffer
    return { ...response, data: cached.slice(0) }
  })

  return {
    maxzoom,
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
