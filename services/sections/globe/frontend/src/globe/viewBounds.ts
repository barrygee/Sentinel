/**
 * The part of the globe in view, as a south/west/north/east box, for asking
 * the feed only for the vessels that can be seen.
 */
import type { Bbox } from '../feeds/globeFeedTypes'
import { wrapLongitude, type LatLon } from './geo'

/** Degrees added round the sampled points: the grid misses the strip between its outer points and the edge. */
const MARGIN_DEGREES = 3

/** A longitude span this wide is as good as the whole way round. */
const WHOLE_WAY_ROUND_DEGREES = 300

/** The whole globe. */
export const WORLD_BBOX: Bbox = [-90, -180, 90, 180]

/**
 * The smallest longitude range that covers every longitude given, as
 * [west, east]; west > east when it crosses the antimeridian. Found as the
 * complement of the widest gap between neighbouring longitudes.
 */
function longitudeRange(longitudes: number[]): [number, number] {
  const sorted = longitudes.map(wrapLongitude).sort((first, second) => first - second)
  let widestGap = 360 - (sorted[sorted.length - 1]! - sorted[0]!)
  let west = sorted[0]!
  let east = sorted[sorted.length - 1]!
  for (let index = 1; index < sorted.length; index++) {
    const gap = sorted[index]! - sorted[index - 1]!
    if (gap > widestGap) {
      widestGap = gap
      west = sorted[index]!
      east = sorted[index - 1]!
    }
  }
  return [west, east]
}

/**
 * The view's box from the globe points sampled across the canvas.
 *
 * @param samples globe points under a grid of canvas pixels (space misses are left out).
 * @param poleInView which pole, if any, is on screen: the box then reaches it, all the way round.
 * @returns the box, or null when no sample hit the globe.
 */
export function viewBounds(
  samples: readonly LatLon[],
  poleInView: 'north' | 'south' | null,
): Bbox | null {
  if (samples.length === 0) return null
  let south = Math.min(...samples.map((sample) => sample.lat)) - MARGIN_DEGREES
  let north = Math.max(...samples.map((sample) => sample.lat)) + MARGIN_DEGREES
  if (poleInView === 'north') north = 90
  if (poleInView === 'south') south = -90
  south = Math.max(-90, south)
  north = Math.min(90, north)

  const [west, east] = longitudeRange(samples.map((sample) => sample.lon))
  const span = (((east - west) % 360) + 360) % 360
  if (poleInView || span + 2 * MARGIN_DEGREES >= WHOLE_WAY_ROUND_DEGREES) {
    return [south, -180, north, 180]
  }
  return [south, wrapLongitude(west - MARGIN_DEGREES), north, wrapLongitude(east + MARGIN_DEGREES)]
}

/** True when two boxes differ by more than `toleranceDegrees` on any edge. */
export function boundsDiffer(
  first: Bbox | null,
  second: Bbox | null,
  toleranceDegrees = 0.5,
): boolean {
  if (first === null || second === null) return first !== second
  return first.some((edge, index) => Math.abs(edge - second[index]!) > toleranceDegrees)
}
