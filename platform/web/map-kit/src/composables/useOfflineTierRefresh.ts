import { watch } from 'vue'
import type { Map as MapLibreGlMap, VectorTileSource } from 'maplibre-gl'
import { useOfflineMapsStore } from '@sentinel/shell-api/stores/offlineMaps'
import { withTierVersion } from '@sentinel/map-kit/utils/offlineTileVersion'
import type { TerrainToggleControl } from '@sentinel/map-kit/controls/terrain/TerrainToggleControl'

/** The `openmaptiles` source id and tile template every offline basemap style shares
 *  (`fiord.json`/`osm-light.json` — see the BUILD CONTRACT). */
const OFFLINE_BASEMAP_SOURCE_ID = 'openmaptiles'
const OFFLINE_BASEMAP_TILE_URL_TEMPLATE = '/api/offline-map/basemap/{z}/{x}/{y}'

/**
 * Refreshes a domain map's offline tiles when an offline-map download job
 * completes (or is deleted) while that map is showing the offline style — see
 * `docs/plans/offline-map-downloads.md`, "Domain maps change only indirectly".
 *
 * IMPORTANT: this does NOT call `map.setStyle()` (an earlier version of this
 * composable did, and it was wrong on two counts). `setStyle` in diff mode
 * compares the new style document against the current one; since the style
 * JSON is byte-identical before and after a region completes, MapLibre
 * concludes nothing changed and never re-requests `openmaptiles` — the tiles
 * it already cached as "empty" (204) while offline stay cached as empty
 * forever. Worse, if it ever *did* decide to reload, a style swap tears down
 * and rebuilds every runtime layer this map owns (ADS-B/AIS markers, terrain,
 * range rings, …) and fires a fresh `style.load` that every control listens
 * for — a false "the whole map just reloaded" signal on every completed
 * download.
 *
 * Instead, this reaches directly for the one source that needs to know:
 * `(map.getSource('openmaptiles') as VectorTileSource).setTiles([...])`,
 * which MapLibre documents as "sets the source `tiles` property and
 * re-renders the map" — it clears that source's tile cache and refetches,
 * touching nothing else. `TerrainToggleControl.refreshTiles()` does the
 * equivalent for the raster-dem source (plus reconfiguring the
 * maplibre-contour `DemSource`, whose URL/maxzoom are otherwise baked in at
 * construction — see `terrainDem.ts`); it is only called when the version
 * actually *changes*, because the control already versions its own initial
 * load itself (from `offlineMapsStore.tiersVersion` at the moment it first
 * builds its layers) — calling it unconditionally on every style load would
 * race that first build with a redundant second one.
 *
 * The basemap tile URL always carries `?v=<tiersVersion>` (via
 * `withTierVersion`), applied on every style load — not only when
 * `tiersVersion` changes — so a style reload for an unrelated reason (a theme
 * swap, say) after a version bump still serves the versioned URL rather than
 * whatever the browser's HTTP cache holds for the plain one.
 */
export function useOfflineTierRefresh(
  getMap: () => MapLibreGlMap | null,
  isShowingOfflineStyle: () => boolean,
  getTerrainControl?: () => TerrainToggleControl | null,
): { applyCurrentVersion: () => void } {
  const offlineMapsStore = useOfflineMapsStore()

  function applyBasemapVersion(): void {
    const map = getMap()
    if (!map || !isShowingOfflineStyle()) return
    const basemapSource = map.getSource(OFFLINE_BASEMAP_SOURCE_ID) as VectorTileSource | undefined
    basemapSource?.setTiles([
      withTierVersion(OFFLINE_BASEMAP_TILE_URL_TEMPLATE, offlineMapsStore.tiersVersion),
    ])
  }

  /** Call once right after every style load (initial mount AND any later
   *  swap, e.g. a theme change) — see the versioning note above. */
  function applyCurrentVersion(): void {
    applyBasemapVersion()
  }

  watch(
    () => offlineMapsStore.tiersVersion,
    (tiersVersion, previousTiersVersion) => {
      // Skip the very first assignment — `tiersVersion` starts at `null`
      // (no status fetched yet) and Vue's watch reports that real initial
      // value as `previousTiersVersion`, never `undefined`, so `null` is the
      // sentinel to check here. Only an actual change (a region completing/
      // being deleted mid-session, or `fetchStatus()` resolving after this map
      // already mounted) other than that first bootstrap fetch needs to force
      // anything; the map already applied the version it loaded with via
      // `applyCurrentVersion()` at style-load time.
      if (previousTiersVersion === null || tiersVersion === previousTiersVersion) return
      if (!isShowingOfflineStyle()) return
      applyBasemapVersion()
      getTerrainControl?.()?.refreshTiles()
    },
  )

  return { applyCurrentVersion }
}
