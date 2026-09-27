import type { LngLatBounds } from './rectangleDrawHandler'

/** Per-edge validation messages for `BboxFields`, or `null` where an edge is fine. */
export interface BboxFieldErrors {
  north: string | null
  south: string | null
  east: string | null
  west: string | null
}

/**
 * Validates a bbox the same way the backend's `AreaRequest` does (finite,
 * latitude within the Web Mercator limit, longitude within ±180, west<east,
 * south<north) — shared by `BboxFields` (which field to blame) and
 * `OfflineMapsSettings` (whether DOWNLOAD may be enabled at all), so the two
 * can never disagree about what counts as a usable area.
 */
export function computeBboxFieldErrors(bounds: LngLatBounds): BboxFieldErrors {
  const errors: BboxFieldErrors = { north: null, south: null, east: null, west: null }
  if (!Number.isFinite(bounds.north) || Math.abs(bounds.north) > 85.05113) {
    errors.north = 'North must be between -85.05113 and 85.05113.'
  }
  if (!Number.isFinite(bounds.south) || Math.abs(bounds.south) > 85.05113) {
    errors.south = 'South must be between -85.05113 and 85.05113.'
  }
  if (!Number.isFinite(bounds.east) || Math.abs(bounds.east) > 180) {
    errors.east = 'East must be between -180 and 180.'
  }
  if (!Number.isFinite(bounds.west) || Math.abs(bounds.west) > 180) {
    errors.west = 'West must be between -180 and 180.'
  }
  if (errors.north === null && errors.south === null && bounds.south >= bounds.north) {
    errors.north = 'North must be greater than South.'
  }
  if (errors.east === null && errors.west === null && bounds.west >= bounds.east) {
    errors.east = 'East must be greater than West.'
  }
  return errors
}

/** True when every edge is finite and in range, and the box is non-degenerate
 *  (west<east, south<north) — the gate `OfflineMapsSettings` applies before
 *  DOWNLOAD is enabled, on top of `hasDraftArea`'s cheaper "isn't the pristine
 *  0/0/0/0 default" check. */
export function isBboxValid(bounds: LngLatBounds): boolean {
  const errors = computeBboxFieldErrors(bounds)
  return (
    errors.north === null && errors.south === null && errors.east === null && errors.west === null
  )
}
