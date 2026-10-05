// Range-ring geometry shared by the map controls that draw distance-from-you
// rings (air + land). Pure: given a centre lng/lat, returns concentric great-
// circle rings as GeoJSON LineStrings.

/** Ring radii, in nautical miles. */
export const RING_DISTANCES_NM = [50, 100, 150, 200, 250] as const

/** Build concentric range rings (great circles) centred on ``lng``/``lat``. */
export function buildRingsGeoJSON(lng: number, lat: number): GeoJSON.FeatureCollection {
  const EARTH_RADIUS_NM = 3440.065
  const features: GeoJSON.Feature[] = []
  for (const distNm of RING_DISTANCES_NM) {
    const R = distNm / EARTH_RADIUS_NM
    const points: [number, number][] = []
    const steps = 64
    for (let i = 0; i <= steps; i++) {
      const bearing = (i / steps) * Math.PI * 2
      const lat1 = (lat * Math.PI) / 180
      const lon1 = (lng * Math.PI) / 180
      const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(R) + Math.cos(lat1) * Math.sin(R) * Math.cos(bearing),
      )
      const lon2 =
        lon1 +
        Math.atan2(
          Math.sin(bearing) * Math.sin(R) * Math.cos(lat1),
          Math.cos(R) - Math.sin(lat1) * Math.sin(lat2),
        )
      points.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: points },
      properties: { dist: distNm },
    })
  }
  return { type: 'FeatureCollection', features }
}
