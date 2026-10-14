import { useAppStore } from '@sentinel/shell-api/stores/app'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useThemeStore } from '@sentinel/shell-api/stores/theme'
import { APP_MODE_STORAGE_KEY, asSourceMode } from '@sentinel/shell-api/utils/sourceMode'
import { getEnabledSectionIds } from '@sentinel/shell-api/shell/sectionRegistry'
import { runSettingsHydrators, type AllSettings } from '@sentinel/shell-api/shell/settingsHydration'

/**
 * Applying the stored settings to the running app — at boot, and again after
 * the settings change underneath it (APPLY CHANGES in Settings, a hand-edit of
 * the live `sentinel_config.json`), so that never needs a page reload.
 *
 * Core state (enabled sections, connectivity mode, theme, sound, base-map
 * layers) is applied here; each section's own stores by the hydrators it
 * registered. The same routine both times, so a refresh leaves the app exactly
 * as a fresh boot would.
 */

/** Applies a `GET /api/settings` payload to the core stores and every section's hydrator. */
export function applySettingsPayload(data: AllSettings): void {
  const settingsStore = useSettingsStore()
  const appStore = useAppStore()
  // Seed the settings store from this same payload so reads like
  // sdr.bandPlan (waterfall band strip) resolve to the persisted values
  // instead of their fallbacks.
  settingsStore.allSettings = data
  // Per-section enabled state: a stored `<id>.enabled` wins, else each
  // registered section's own default (Air/Space/SDR on, Sea/Land off).
  const enabled = getEnabledSectionIds(data)
  if (enabled.length > 0) appStore.setEnabledDomains(enabled)

  // Sync connectivity mode from backend — backend is authoritative so a mode
  // set from another session doesn't get overridden by a stale localStorage value.
  const backendMode = asSourceMode(data.app?.connectivityMode)
  if (backendMode) {
    try {
      localStorage.setItem(APP_MODE_STORAGE_KEY, backendMode)
    } catch {}
    appStore.setConnectivityMode(backendMode)
  }

  // Theme — the backend is authoritative, so a choice made on another
  // device wins over this browser's localStorage. Absent means dark.
  // No defaulting here: a config written before the map got its own
  // control has neither key, and falling back would drag the basemap away
  // from the palette the operator is looking at. An absent value leaves
  // the seeded one alone; the boolean is the pre-COLOUR form.
  useThemeStore().hydrateMapTheme(data.app?.mapTheme, data.app?.lightMapTheme)

  // Notification blip sound — default OFF when absent from the DB.
  const soundOn = data.app?.notificationSound
  appStore.setNotificationSound(typeof soundOn === 'boolean' ? soundOn : false)

  // The shared base-map layers — adopt the config so a choice made in the
  // app-config JSON or on another device is what the maps draw from the
  // first frame.
  useBasemapStore().hydrateLayers(data.app?.mapLayers)

  // Each section's own stored settings (Air's map layers and label fields,
  // Land's APRS label fields…) — registered by the section (F1).
  runSettingsHydrators(data)
}

/**
 * Re-reads every setting and applies it to the running app, in place of a page
 * reload: the core stores and section hydrators as at boot, then
 * `sentinel:config-uploaded` so every control, map and store that loads its
 * own setting re-reads it. Returns false (changing nothing) when the settings
 * can't be read.
 */
export async function refreshSettingsFromBackend(): Promise<boolean> {
  let data: AllSettings
  try {
    const response = await fetch('/api/settings')
    if (!response.ok) return false
    data = (await response.json()) as AllSettings
  } catch {
    return false
  }
  applySettingsPayload(data)
  document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
  return true
}
