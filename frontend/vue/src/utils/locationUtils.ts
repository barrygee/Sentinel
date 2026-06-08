/** True when lat/lon are finite numbers within valid geographic bounds. */
export function isValidLatLon(lat: number, lon: number): boolean {
  return !isNaN(lat) && lat >= -90 && lat <= 90 && !isNaN(lon) && lon >= -180 && lon <= 180
}
