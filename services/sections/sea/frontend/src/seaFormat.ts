/**
 * Display formatting for AIS vessel fields, shared by the Sea FILTER pane and
 * the map labels so a value reads the same wherever it appears.
 */

/** ITU-R M.1371 navigational status codes, as a vessel reports them. */
const NAV_STATUS_LABELS: Record<number, string> = {
  0: 'UNDER WAY',
  1: 'AT ANCHOR',
  2: 'NOT UNDER COMMAND',
  3: 'RESTRICTED MANOEUVRE',
  4: 'CONSTRAINED BY DRAUGHT',
  5: 'MOORED',
  6: 'AGROUND',
  7: 'FISHING',
  8: 'UNDER SAIL',
  14: 'AIS-SART',
}

/** Human label for a navigational status code; unknown codes show as is. */
export function navStatusLabel(status: number | null): string {
  if (status === null) return '—'
  return NAV_STATUS_LABELS[status] ?? `STATUS ${status}`
}

/** Speed over ground as "12.3 KN", or a dash when not reported. */
export function formatKnots(knots: number | null): string {
  return knots === null ? '—' : `${knots.toFixed(1)} KN`
}

/** A bearing as "123°", or a dash when not reported. */
export function formatDegrees(degrees: number | null): string {
  return degrees === null ? '—' : `${Math.round(degrees)}°`
}

/** The fix time as HH:MM:SSZ (UTC). */
export function formatFixTime(unixMs: number): string {
  return `${new Date(unixMs).toISOString().slice(11, 19)}Z`
}
