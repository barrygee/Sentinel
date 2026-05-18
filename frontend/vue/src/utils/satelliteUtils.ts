export const SATELLITE_CATEGORY_SHORT_LABELS: Record<string, string> = {
  space_station: 'STATION',
  active:        'ACTIVE',
  weather:       'WEATHER',
  navigation:    'NAV',
  military:      'MIL',
  amateur:       'AMATEUR',
  science:       'SCI',
  cubesat:       'CUBE',
  unknown:       'UNKN',
}

export const SATELLITE_CATEGORY_ORDER: string[] = [
  'space_station', 'active', 'weather', 'navigation',
  'military', 'amateur', 'science', 'cubesat', 'unknown',
]

export const SATELLITE_CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  space_station: 'Space Station',
  active:        'Active',
  weather:       'Weather',
  navigation:    'Navigation',
  military:      'Military',
  amateur:       'Amateur',
  science:       'Science',
  cubesat:       'CubeSat',
  unknown:       'Unknown',
}

export const SATELLITE_CATEGORY_FULL_LABELS: Record<string, string> = {
  space_station: 'Space Stations',
  amateur:       'Amateur Radio',
  weather:       'Weather',
  military:      'Military',
  navigation:    'Navigation',
  science:       'Science',
  cubesat:       'CubeSats',
  active:        'Active',
  unknown:       'Unknown',
}

export const SATELLITE_CATEGORY_SECTION_LABELS: Record<string, string> = {
  space_station: 'SPACE STATION',
  amateur:       'AMATEUR',
  weather:       'WEATHER',
  military:      'MILITARY',
  navigation:    'NAVIGATION',
  science:       'SCIENCE',
  cubesat:       'CUBESAT',
  active:        'ACTIVE',
  unknown:       'UNKNOWN',
}

/**
 * Formats milliseconds until a satellite pass AOS as "IN Xh Ym Zs", "IN Xm Ys", or "IN Xs".
 */
export function formatPassCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours   = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0)   return `IN ${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `IN ${minutes}m ${seconds}s`
  return `IN ${seconds}s`
}

/**
 * Formats a pass duration in seconds as "Xm Ys".
 */
export function formatPassDuration(durationSeconds: number): string {
  return `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`
}

/**
 * Formats a UTC datetime string as a local HH:MM time string.
 */
export function formatPassTime(utcString: string): string {
  return new Date(utcString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Formats a UTC datetime string as a local "Mon D" date string.
 */
export function formatPassDate(utcString: string): string {
  return new Date(utcString).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/**
 * Formats a Unix timestamp (ms) as a human-readable age: "Xs ago", "Xm ago", "Xh ago", "Xd ago".
 */
export function formatTleAge(timestampMs: number): string {
  const secs = Math.floor((Date.now() - timestampMs) / 1000)
  if (secs < 60)    return `${secs}s ago`
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}
