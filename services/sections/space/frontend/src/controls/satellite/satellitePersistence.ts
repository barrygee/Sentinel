/**
 * What the Space map remembers across a section change. The map unmounts on
 * navigation, destroying `SatelliteControl`; a fresh control reads these back
 * on mount so the user lands on the satellite they left, still following it if
 * they were.
 */

/** A satellite as the map remembers it: its NORAD id and the name shown for it. */
export interface RememberedSatellite {
  noradId: string
  name: string
}

/**
 * The satellite the user is following; cleared when they untrack. Mirrors
 * AIR's `adsbTracking`.
 */
export const FOLLOW_STORAGE_KEY = 'sentinel_space_follow'

/**
 * The satellite the map is showing, followed or not, so a remount resumes on it
 * instead of snapping back to the ISS. The side panes consult this on their own
 * restore: a persisted pane expansion may re-select the satellite only when it
 * is the one the map already shows, so two panes restoring different
 * satellites can no longer fight over the map.
 */
export const ACTIVE_SATELLITE_STORAGE_KEY = 'sentinel_space_activeSat'

/** Remember the followed satellite, or forget it when `satellite` is null (the user untracked). */
export function saveFollowedSatellite(satellite: RememberedSatellite | null): void {
  try {
    if (satellite) localStorage.setItem(FOLLOW_STORAGE_KEY, JSON.stringify(satellite))
    else localStorage.removeItem(FOLLOW_STORAGE_KEY)
  } catch {
    // Storage blocked (private mode, quota): the follow just won't survive a remount.
  }
}

/** The followed satellite remembered from before the map unmounted, if any. */
export function readFollowedSatellite(): RememberedSatellite | null {
  return readRememberedSatellite(FOLLOW_STORAGE_KEY)
}

/** Remember the satellite the map is showing. */
export function saveActiveSatellite(satellite: RememberedSatellite): void {
  try {
    localStorage.setItem(ACTIVE_SATELLITE_STORAGE_KEY, JSON.stringify(satellite))
  } catch {
    // Storage blocked: a remount falls back to the ISS.
  }
}

/** The satellite the map last showed, if any. */
export function readActiveSatellite(): RememberedSatellite | null {
  return readRememberedSatellite(ACTIVE_SATELLITE_STORAGE_KEY)
}

/**
 * One remembered satellite, tolerating whatever is stored: null for nothing,
 * bad JSON or an entry without a NORAD id; the id stands in for a missing name.
 */
function readRememberedSatellite(storageKey: string): RememberedSatellite | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { noradId?: string; name?: string }
    return parsed.noradId ? { noradId: parsed.noradId, name: parsed.name || parsed.noradId } : null
  } catch {
    return null
  }
}
