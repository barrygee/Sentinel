/**
 * The optional position of a radio added by IP and port: what the form's
 * LATITUDE / LONGITUDE text becomes, or why it can't be saved.
 *
 * Both blank is no position (the radio isn't drawn on maps); both filled in
 * and in range is one; anything else says which field is wrong.
 */
export type RadioPositionResult =
  | { ok: true; latitude: number | null; longitude: number | null }
  | { ok: false; latitudeError: string | null; longitudeError: string | null }

const NEITHER_OR_BOTH = 'Give both latitude and longitude, or neither.'

function parseCoordinate(text: string, limit: number, name: string): number | string {
  const value = Number(text)
  if (!Number.isFinite(value)) return `${name} must be a number.`
  if (Math.abs(value) > limit) return `${name} must be between -${limit} and ${limit}.`
  return value
}

/** Read the form's two fields (trimmed text, blank meaning unset). */
export function readRadioPosition(
  latitudeText: string,
  longitudeText: string,
): RadioPositionResult {
  const latitudeInput = latitudeText.trim()
  const longitudeInput = longitudeText.trim()
  if (latitudeInput === '' && longitudeInput === '')
    return { ok: true, latitude: null, longitude: null }
  if (latitudeInput === '' || longitudeInput === '') {
    return {
      ok: false,
      latitudeError: latitudeInput === '' ? NEITHER_OR_BOTH : null,
      longitudeError: longitudeInput === '' ? NEITHER_OR_BOTH : null,
    }
  }
  const latitude = parseCoordinate(latitudeInput, 90, 'Latitude')
  const longitude = parseCoordinate(longitudeInput, 180, 'Longitude')
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return { ok: true, latitude, longitude }
  }
  return {
    ok: false,
    latitudeError: typeof latitude === 'string' ? latitude : null,
    longitudeError: typeof longitude === 'string' ? longitude : null,
  }
}

/** A stored coordinate as the form shows it: blank when unset. */
export function coordinateText(value: number | null | undefined): string {
  return value == null ? '' : String(value)
}
