import { watch } from 'vue'
import type { Map } from 'maplibre-gl'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import { applyBasemapLayerVisibility, type BasemapLayerGroup } from '../utils/basemapLayers'

/**
 * Keep a map's base-style layer groups in step with the shared basemap store,
 * for the groups this map has no rail button for (borders on every map; roads
 * on Space). Settings is then the only place they are switched, and a flip
 * there reaches every mounted map at once.
 *
 * A fresh style ships with its own layer visibilities, so the map must call
 * the returned `apply` after every style load, the first included.
 */
export function useBasemapLayerSync(
  getMap: () => Map | null,
  groups: readonly BasemapLayerGroup[],
): { apply: () => void } {
  const basemapStore = useBasemapStore()

  function apply(): void {
    const map = getMap()
    if (!map) return
    groups.forEach((group) => {
      applyBasemapLayerVisibility(map, group, basemapStore.layers[group])
    })
  }

  watch(() => groups.map((group) => basemapStore.layers[group]), apply)

  return { apply }
}
