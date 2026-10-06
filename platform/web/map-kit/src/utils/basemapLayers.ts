import type { Map } from 'maplibre-gl'

/**
 * The base-style layer ids behind each shared base-map toggle. All six bundled
 * basemaps use the same layer ids, so one list serves every palette; an id a
 * given style lacks (the offline-only `surroundings_*` layers on an online
 * style) is skipped when applied.
 */
export const BASEMAP_LAYER_GROUPS = {
  /** Road lines, names and shields. `surroundings_motorway` is the offline
   *  build's low-zoom world motorways, drawn outside the downloaded areas. */
  roads: [
    'surroundings_motorway',
    'highway_path',
    'highway_minor',
    'highway_major_casing',
    'highway_major_inner',
    'highway_major_subtle',
    'highway_motorway_casing',
    'highway_motorway_inner',
    'highway_motorway_subtle',
    'highway_name_other',
    'highway_ref',
    'tunnel_motorway_casing',
    'tunnel_motorway_inner',
    'road_area_pier',
    'road_pier',
  ],
  /** Place-name labels, plus the places-of-interest labels (`poi`), which hide
   *  and show with them. `place_other` (hamlets) and `place_continent` are
   *  left out: the styles keep those off either way. */
  names: [
    'surroundings_place_city',
    'poi',
    'place_suburb',
    'place_village',
    'place_town',
    'place_city',
    'place_city_large',
    'place_state',
    'place_country_other',
    'place_country_minor',
    'place_country_major',
    'water_name',
  ],
  /** Country and state boundary lines. */
  borders: [
    'surroundings_boundary',
    'boundary_state',
    'boundary_country_z0-4',
    'boundary_country_z5-',
  ],
} as const satisfies Record<string, readonly string[]>

/** A toggle that maps onto a group of base-style layers. */
export type BasemapLayerGroup = keyof typeof BASEMAP_LAYER_GROUPS

/** Show or hide every layer of one group on the map's current style. */
export function applyBasemapLayerVisibility(
  map: Map,
  group: BasemapLayerGroup,
  visible: boolean,
): void {
  const visibility = visible ? 'visible' : 'none'
  BASEMAP_LAYER_GROUPS[group].forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility)
  })
}
