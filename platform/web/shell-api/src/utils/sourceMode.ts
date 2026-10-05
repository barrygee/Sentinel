/** A data-source mode: live internet feeds, or local off-grid sources. */
export type SourceMode = 'online' | 'offgrid'

/** How each mode is written on screen. */
export const SOURCE_MODE_LABELS: Readonly<Record<SourceMode, string>> = {
  online: 'ONLINE',
  offgrid: 'OFF GRID',
}

/** The two choices every connectivity picker offers, in display order. */
export const SOURCE_MODE_OPTIONS: ReadonlyArray<{ value: SourceMode; label: string }> = [
  { value: 'offgrid', label: SOURCE_MODE_LABELS.offgrid },
  { value: 'online', label: SOURCE_MODE_LABELS.online },
]

/**
 * Sections that store their own `sourceOverride`. Land has none — its data is
 * the APRS sidecar and the bundled repeater directory, not a switchable feed.
 */
export const SOURCE_MODE_SECTIONS = ['air', 'space', 'sea'] as const

/** localStorage key the app-wide connectivity mode is cached under. */
export const APP_MODE_STORAGE_KEY = 'sentinel_app_connectivityMode'

/** Narrow a stored value to a mode; anything else (e.g. a legacy 'auto') is null. */
export function asSourceMode(value: unknown): SourceMode | null {
  return value === 'online' || value === 'offgrid' ? value : null
}

/** localStorage key a section's mode is cached under (read by the maps' fast paths). */
export function sectionModeStorageKey(section: string): string {
  return `sentinel_${section}_sourceOverride`
}

/**
 * The mode a section actually runs in: its own stored mode, else the app-wide
 * one, else online. Mirrors the backend's `resolve_effective_mode` — the two
 * must agree, or the SPA would e.g. hold a dongle while the backend reads the
 * internet feed.
 */
export function resolveSectionMode(sectionMode: unknown, appMode: unknown): SourceMode {
  return asSourceMode(sectionMode) ?? asSourceMode(appMode) ?? 'online'
}

/** A section's effective mode from the localStorage cache (for code outside Vue reactivity). */
export function readCachedSectionMode(section: string): SourceMode {
  try {
    return resolveSectionMode(
      localStorage.getItem(sectionModeStorageKey(section)),
      localStorage.getItem(APP_MODE_STORAGE_KEY),
    )
  } catch {
    return 'online'
  }
}
