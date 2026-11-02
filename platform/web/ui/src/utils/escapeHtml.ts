/**
 * Escape a string for safe interpolation into HTML built by hand — map labels
 * and the screen-reader data tables the map controls render outside the Vue
 * tree. Every value that comes off the air or from a feed (callsigns, squawks,
 * MMSIs, host names) is remote input and goes through this before `innerHTML`.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
