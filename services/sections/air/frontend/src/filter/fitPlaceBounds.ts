/**
 * Map fitting for a place picked in the Air FILTER pane (an airport or a
 * military base): the place's box, centred on its marker, inside the part of
 * the map the operator can actually see.
 */
import type { Map as MapLibreMap } from 'maplibre-gl'
import { mapChromeInsets } from '@sentinel/shell-api/shell/mapChromeInsets'

type Bounds = [number, number, number, number]

/**
 * The bounds grown to sit evenly around `centre`, so a fit to them centres on
 * that point. A place's stored box need not be centred on its marker (EGNT's
 * marker is on the top edge of its box), and the operator expects the marker
 * they clicked in the middle; the box still sets how far the map zooms in.
 */
export function boundsCentredOn(bounds: Bounds, centre: [number, number]): Bounds {
  const [west, south, east, north] = bounds
  const [longitude, latitude] = centre
  const halfWidth = Math.max(longitude - west, east - longitude)
  const halfHeight = Math.max(latitude - south, north - latitude)
  return [
    longitude - halfWidth,
    latitude - halfHeight,
    longitude + halfWidth,
    latitude + halfHeight,
  ]
}

/**
 * Fit the map to a place, its marker in the middle of the part of the map the
 * operator can see: the padding adds the width of the shell's rails and the
 * open side panel (mapChromeInsets), which sit over the full-window map, and
 * clears the top-right control stack.
 */
export function fitPlaceBounds(
  map: MapLibreMap,
  placeBounds: Bounds,
  marker: [number, number],
): void {
  const bounds = boundsCentredOn(placeBounds, marker)
  const controlStack = document.querySelector('.maplibregl-ctrl-top-right') as HTMLElement | null
  const controlStackWidth = controlStack ? controlStack.offsetWidth : 0
  const controlStackHeight = controlStack ? controlStack.offsetHeight : 0
  const padding = 80
  const topExtra = Math.max(0, controlStackHeight / 2 - padding)
  const chrome = mapChromeInsets(map.getContainer())
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    {
      padding: {
        top: padding + topExtra,
        bottom: padding,
        left: padding + chrome.left,
        right: padding + controlStackWidth + chrome.right,
      },
      maxZoom: 13,
      duration: 800,
    },
  )
}
