/**
 * The colour ramp along an aircraft's trail line, so each stretch shows the
 * altitude it was flown at. A MapLibre `line-gradient` rather than one feature
 * per segment: overlapping translucent segments would leave a darker bead at
 * every vertex.
 */
import type { ExpressionSpecification } from 'maplibre-gl'

/** One point on the trail and the colour the line takes there. */
export interface TrailVertex {
  lon: number
  lat: number
  colour: string
}

/** Distance between two vertices, in degrees of latitude at their latitude. */
function distanceBetween(first: TrailVertex, second: TrailVertex): number {
  const midLatitudeRad = (((first.lat + second.lat) / 2) * Math.PI) / 180
  return Math.hypot((second.lon - first.lon) * Math.cos(midLatitudeRad), second.lat - first.lat)
}

/**
 * A `line-gradient` with a stop at each vertex, placed by how far along the line
 * it is.
 *
 * @returns The expression, or `null` for a line with no length to colour.
 */
export function trailLineGradient(
  vertices: readonly TrailVertex[],
): ExpressionSpecification | null {
  const distances = [0]
  for (let index = 1; index < vertices.length; index++) {
    const step = distanceBetween(vertices[index - 1]!, vertices[index]!)
    distances.push(distances[index - 1]! + step)
  }
  const totalDistance = distances.at(-1)!
  if (totalDistance === 0) return null

  const stops: (number | string)[] = []
  let lastProgress = -1
  vertices.forEach((vertex, index) => {
    const progress = distances[index]! / totalDistance
    // Stops must rise strictly, so a repeated position is skipped.
    if (progress <= lastProgress) return
    lastProgress = progress
    stops.push(progress, vertex.colour)
  })
  return ['interpolate', ['linear'], ['line-progress'], ...stops] as ExpressionSpecification
}
