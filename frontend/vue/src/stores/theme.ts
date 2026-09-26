import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { usePersistedRef } from './_persist'

/**
 * Which palette the app and its basemaps render in. Dark is the operational
 * default — Sentinel is built to be read in a darkened room — and light exists
 * for daylight and projector use.
 */
export type AppTheme = 'dark' | 'light'

const LS_KEY = 'sentinel_theme'
const MAP_LS_KEY = 'sentinel_map_theme'

const DEFAULT_THEME: AppTheme = 'dark'

function isAppTheme(candidate: unknown): candidate is AppTheme {
  return candidate === 'dark' || candidate === 'light'
}

/**
 * Publish the theme as `<html data-theme="…">`, which is what the stylesheets
 * key their light-palette overrides off. An attribute rather than a class so
 * the same hook works from CSS, from a Playwright selector, and from the
 * pre-paint script in `index.html` that sets it before Vue has booted.
 */
function applyThemeAttribute(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme
}

/**
 * The same for the map, as `<html data-map-theme="…">`. Map overlays are drawn
 * by class-based `IControl`s that cannot read a store, so they read this
 * attribute (see `utils/mapTheme.ts`) exactly as the stylesheets read the
 * interface one.
 */
function applyMapThemeAttribute(theme: AppTheme): void {
  document.documentElement.dataset.mapTheme = theme
}

/**
 * Cross-cutting appearance state: the INTERFACE palette and the MAP's, which
 * are set independently. A dark map under a light interface is the common
 * pairing — the basemap is dimmed ground for the overlays either way, while
 * the panels around it are read at length.
 *
 * Held in its own store rather than on `app` because every domain map, the
 * settings panel and the pre-paint script all read it, and none of them are
 * "app connectivity" concerns.
 */
export const useThemeStore = defineStore('theme', () => {
  const theme = usePersistedRef<AppTheme>(LS_KEY, DEFAULT_THEME, isAppTheme)

  // The map had no palette of its own until the two were split, so an operator
  // who had turned the light theme on was looking at a light map. Seeding the
  // map from the interface theme when its own key is absent keeps that view
  // intact through the upgrade; from then on the two move independently.
  const mapTheme = usePersistedRef<AppTheme>(MAP_LS_KEY, theme.value, isAppTheme)

  // The pre-paint script in index.html has normally set these already;
  // re-apply so the attributes are still correct when the store is created in
  // a test or any other context that never ran that script.
  applyThemeAttribute(theme.value)
  watch(theme, applyThemeAttribute)
  applyMapThemeAttribute(mapTheme.value)
  watch(mapTheme, applyMapThemeAttribute)

  const isLight = computed(() => theme.value === 'light')
  const isMapLight = computed(() => mapTheme.value === 'light')

  /** Switch theme. The persisted write is the settings control's to stage. */
  function setTheme(next: AppTheme): void {
    theme.value = next
  }

  /** The same for the basemap, which has its own control and its own key. */
  function setMapTheme(next: AppTheme): void {
    mapTheme.value = next
  }

  /**
   * Boolean face of `setTheme`, for the Settings toggle. The database stores
   * the preference as `app.lightTheme` — a flag rather than the theme name,
   * so it drops straight onto the shared toggle plumbing every other on/off
   * setting uses.
   */
  function setLightTheme(light: boolean): void {
    setTheme(light ? 'light' : 'dark')
  }

  /** Boolean face of `setMapTheme`, stored as `app.lightMapTheme`. */
  function setLightMapTheme(light: boolean): void {
    setMapTheme(light ? 'light' : 'dark')
  }

  /**
   * Adopt `app.lightTheme` from the config database (startup, or after the
   * app-config JSON is uploaded). A missing or non-boolean value is ignored,
   * leaving whatever localStorage restored.
   */
  function hydrateLightTheme(remote: unknown): void {
    if (typeof remote === 'boolean') setLightTheme(remote)
  }

  /**
   * Adopt `app.lightMapTheme`. A missing value is ignored rather than treated
   * as dark: a config written before the split has no map key, and falling
   * back would flip the basemap out from under an operator whose interface is
   * light. localStorage's seeded value stands until the control writes one.
   */
  function hydrateLightMapTheme(remote: unknown): void {
    if (typeof remote === 'boolean') setLightMapTheme(remote)
  }

  /** Re-read `app.lightTheme` from the DB, for the control's staged lifecycle. */
  async function hydrateLightThemeFromDb(): Promise<void> {
    await hydrateFromDb(hydrateLightTheme, 'lightTheme')
  }

  /** The same for `app.lightMapTheme`. */
  async function hydrateLightMapThemeFromDb(): Promise<void> {
    await hydrateFromDb(hydrateLightMapTheme, 'lightMapTheme')
  }

  /** Shared fetch for the two staged controls' re-hydration. */
  async function hydrateFromDb(adopt: (value: unknown) => void, key: string): Promise<void> {
    try {
      const res = await fetch('/api/settings/app')
      if (!res.ok) return
      const data = await res.json()
      adopt(data?.[key])
    } catch {
      /* offline / transient — localStorage already holds a usable value */
    }
  }

  return {
    theme,
    isLight,
    setTheme,
    setLightTheme,
    hydrateLightTheme,
    hydrateLightThemeFromDb,
    mapTheme,
    isMapLight,
    setMapTheme,
    setLightMapTheme,
    hydrateLightMapTheme,
    hydrateLightMapThemeFromDb,
  }
})

export type ThemeStore = ReturnType<typeof useThemeStore>
