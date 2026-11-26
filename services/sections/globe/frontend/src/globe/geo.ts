/**
 * Globe geometry: where a latitude/longitude sits on the 3D sphere, and back.
 *
 * Ported from the sentinel-site header globe (`V`/`toLL`/`sunVec`), so the
 * axes match three.js's `SphereGeometry` texture coordinates: an
 * equirectangular texture drawn with longitude -180 at its left edge lands on
 * the right place without any rotation.
 */
import { Vector3 } from 'three'

/** The globe's radius in scene units. Everything else is sized from it. */
export const GLOBE_RADIUS = 100

/** Degrees to radians. */
export const DEGREES_TO_RADIANS = Math.PI / 180

/** A latitude/longitude pair in degrees. */
export interface LatLon {
  lat: number
  lon: number
}

/**
 * The scene position of a point on (or above) the globe.
 *
 * @param lat latitude in degrees.
 * @param lon longitude in degrees.
 * @param heightAboveSurface extra radius in scene units (0 = on the surface).
 * @param target optional vector to write into, to avoid an allocation per call.
 */
export function latLonToVector(
  lat: number,
  lon: number,
  heightAboveSurface = 0,
  target: Vector3 = new Vector3(),
): Vector3 {
  const polarAngle = (90 - lat) * DEGREES_TO_RADIANS
  const azimuth = (lon + 180) * DEGREES_TO_RADIANS
  const radius = GLOBE_RADIUS + heightAboveSurface
  return target.set(
    -radius * Math.cos(azimuth) * Math.sin(polarAngle),
    radius * Math.cos(polarAngle),
    radius * Math.sin(azimuth) * Math.sin(polarAngle),
  )
}

/** The latitude/longitude under a scene position (its length is ignored). */
export function vectorToLatLon(position: Vector3): LatLon {
  const direction = position.clone().normalize()
  const lat = 90 - Math.acos(direction.y) / DEGREES_TO_RADIANS
  return {
    lat,
    lon: wrapLongitude(Math.atan2(direction.z, -direction.x) / DEGREES_TO_RADIANS - 180),
  }
}

/** A longitude brought into -180..180. */
export function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

/**
 * The point on Earth with the Sun directly overhead at `date` (a low-precision
 * solar ephemeris, good to a fraction of a degree, which is all a day/night
 * shading needs).
 */
export function subsolarPoint(date: Date): LatLon {
  const daysSinceJ2000 = date.getTime() / 864e5 + 2440587.5 - 2451545
  const meanAnomaly = (357.529 + 0.98560028 * daysSinceJ2000) * DEGREES_TO_RADIANS
  const meanLongitude = 280.459 + 0.98564736 * daysSinceJ2000
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) *
    DEGREES_TO_RADIANS
  const obliquity = (23.439 - 3.6e-7 * daysSinceJ2000) * DEGREES_TO_RADIANS
  const rightAscension =
    Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude)) /
    DEGREES_TO_RADIANS
  const declination =
    Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude)) / DEGREES_TO_RADIANS
  const siderealHours = (18.697374558 + 24.06570982441908 * daysSinceJ2000) % 24
  return { lat: declination, lon: wrapLongitude(rightAscension - siderealHours * 15) }
}
