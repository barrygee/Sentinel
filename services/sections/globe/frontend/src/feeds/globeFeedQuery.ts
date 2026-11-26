import type { LatLon } from '../globe/geo'
import type { Bbox, GlobeLayerId } from './globeFeedTypes'

/** Everything one request of the combined feed depends on. */
export interface GlobeFeedRequest {
  /** The layers to ask for; nothing is requested for a layer that is off. */
  layers: readonly GlobeLayerId[]
  /** The part of the globe in view (vessels are asked for here only); null = everywhere. */
  viewBbox: Bbox | null
  /** The operator's location: the aircraft centre. */
  home: LatLon | null
  /** NORAD ids of the chosen satellites. */
  satellites: readonly string[]
}

/** Rounds to `decimals`, so tiny camera moves don't make a "new" request. */
function rounded(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)))
}

/**
 * The URL for one request of `GET /api/globe/objects`, or null when no layer
 * is on (nothing to ask for). Parameters a requested layer doesn't use are
 * left out, so the backend's per-layer caches are shared as widely as they
 * can be.
 */
export function globeFeedUrl(request: GlobeFeedRequest): string | null {
  if (request.layers.length === 0) return null
  const params = new URLSearchParams({ layers: request.layers.join(',') })
  const wants = (layer: GlobeLayerId): boolean => request.layers.includes(layer)
  if (wants('sea') && request.viewBbox) {
    params.set('bbox', request.viewBbox.map((degrees) => rounded(degrees, 2)).join(','))
  }
  if ((wants('air') || wants('space')) && request.home) {
    params.set('lat', rounded(request.home.lat, 4))
    params.set('lon', rounded(request.home.lon, 4))
  }
  if (wants('space') && request.satellites.length > 0) {
    params.set('satellites', request.satellites.join(','))
  }
  return `/api/globe/objects?${params.toString()}`
}
