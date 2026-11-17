import type * as maplibregl from 'maplibre-gl'

/**
 * Dimming the dark basemap with a layer instead of the canvas filter.
 *
 * `MapLibreMap.vue` settles the dark basemap with a CSS filter on the whole
 * canvas (`brightness(0.65) saturate(0.85)`). That also dims everything the map
 * draws itself: a white aircraft silhouette tops out at mid grey, and an open
 * airfield or port label (a canvas image) looks dull beside the vessel and
 * aircraft labels, which are DOM markers outside the canvas. A map whose
 * subject is drawn on the canvas turns the filter off and puts this layer just
 * beneath its subject instead, so the basemap looks as it did and the subject
 * keeps its full brightness. The light basemap is never dimmed, either way.
 */

/** Black at this opacity matches the stylesheet's `brightness(0.65)`. */
export const MAP_DIM_OPACITY = 0.35

/**
 * Add the dimming layer, on top of the map, unless the map already has it. The
 * caller then raises the layers it wants at full brightness above it.
 */
export function addMapDimLayer(map: maplibregl.Map, layerId: string): void {
  if (map.getLayer(layerId)) return
  map.addLayer({
    id: layerId,
    type: 'background',
    paint: { 'background-color': '#000000', 'background-opacity': MAP_DIM_OPACITY },
  })
}

/**
 * Dim with the layer (`dimmed`, the dark basemap) or not at all (the light one).
 * Dimming turns the canvas filter off; not dimming hands the canvas back to the
 * stylesheet, which leaves the light basemap undimmed.
 */
export function setMapDimming(map: maplibregl.Map, layerId: string, dimmed: boolean): void {
  map.getCanvas().style.filter = dimmed ? 'none' : ''
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', dimmed ? 'visible' : 'none')
  }
}
