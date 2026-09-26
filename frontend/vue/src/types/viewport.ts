/** A geographic bounding box in plain degrees — simpler than MapLibre's own
 *  `LngLatBounds` type so a store holding it (and anything reading it, like
 *  the sidebar's in-view lists) has no MapLibre dependency. */
export interface ViewportBounds {
  west: number
  south: number
  east: number
  north: number
}
