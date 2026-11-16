/**
 * The shape of one aircraft on the ADS-B map: the GeoJSON point feature
 * `AdsbLiveControl` builds from each feed entry, and the properties the map
 * layers, labels and tags read from it.
 */

/** One aircraft's properties, as parsed from the feed and resolved for drawing. */
export interface AircraftProperties {
  hex: string
  flight: string
  r: string
  t: string
  alt_baro: number
  alt_geom: number | null
  gs: number
  ias: number | null
  mach: number | null
  track: number
  baro_rate: number
  nav_altitude: number | null
  nav_heading: number | null
  category: string
  emergency: string
  squawk: string
  squawkEmerg: 0 | 1
  rssi: number | null
  military: boolean
  stale: 0 | 1
  /**
   * Map image of this aircraft's silhouette in its colour, or '' when its type
   * and category name no shape (it then keeps the arrow even in silhouette mode).
   */
  silhouetteImage: string
  /** Half the silhouette icon's size in px: how far the label sits off the position. */
  silhouetteRadiusPx: number
  /** 1 when the silhouette turns with the track; 0 for a side-view shape (a balloon). */
  silhouetteRotates: 0 | 1
}

/** One aircraft as a GeoJSON point feature. */
export interface AircraftGeoFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: AircraftProperties
}
