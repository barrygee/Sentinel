import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { usePersistedRef } from './_persist'

/**
 * Which palette the app and its basemaps render in. Dark is the operational
 * default — Sentinel is built to be read in a darkened room — and light exists
 * for daylight and projector use.
 */
export type AppTheme = 'dark' | 'light'

/**
 * The basemap's palette: dark, or light in OpenStreetMap's default colours.
 * (A third, COLOUR, was folded into LIGHT; see `migrateRetiredMapTheme`.)
 */
export type MapTheme = 'dark' | 'light'

/** The palette that replaced the retired COLOUR map. */
const RETIRED_COLOUR_THEME: MapTheme = 'light'

const MAP_LS_KEY = 'sentinel_map_theme'

/**
 * The interface palette. Fixed: Sentinel's panels, rails and chrome are read
 * in a darkened room, and the light build that briefly existed was dropped
 * rather than kept as a setting nobody wanted. The token layer it was built
 * on stays — the settings panel is a light island (`.theme-light`) and reads
 * the same tokens — so re-introducing the choice is a control away.
 */
const INTERFACE_THEME: AppTheme = 'dark'

function isAppTheme(candidate: unknown): candidate is AppTheme {
  return candidate === 'dark' || candidate === 'light'
}

function isMapTheme(candidate: unknown): candidate is MapTheme {
  return isAppTheme(candidate)
}

/**
 * COLOUR was renamed LIGHT (and the old light map removed), so a stored or
 * configured "colour" means today's LIGHT — not an unknown value that would
 * drop the operator back to the dark map.
 */
function normaliseMapTheme(candidate: unknown): unknown {
  return candidate === 'colour' ? RETIRED_COLOUR_THEME : candidate
}

/** Rewrite a persisted "colour" choice before the store reads it. */
function migrateRetiredMapTheme(): void {
  try {
    const raw = localStorage.getItem(MAP_LS_KEY)
    if (raw !== null && JSON.parse(raw) === 'colour') {
      localStorage.setItem(MAP_LS_KEY, JSON.stringify(RETIRED_COLOUR_THEME))
    }
  } catch {}
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
function applyMapThemeAttribute(theme: MapTheme): void {
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
  const theme = ref<AppTheme>(INTERFACE_THEME)
  migrateRetiredMapTheme()
  const mapTheme = usePersistedRef<MapTheme>(MAP_LS_KEY, INTERFACE_THEME, isMapTheme)

  // The pre-paint script in index.html has normally set these already;
  // re-apply so the attributes are still correct when the store is created in
  // a test or any other context that never ran that script.
  applyThemeAttribute(theme.value)
  applyMapThemeAttribute(mapTheme.value)
  watch(mapTheme, applyMapThemeAttribute)

  const isMapLight = computed(() => mapTheme.value === 'light')

  /** Switch the basemap palette. The persisted write is the control's to stage. */
  function setMapTheme(next: MapTheme): void {
    mapTheme.value = next
  }

  /**
   * Boolean face of `setMapTheme`, kept for the older config flag
   * (`app.lightMapTheme`) that some installs still have.
   */
  function setLightMapTheme(light: boolean): void {
    setMapTheme(light ? 'light' : 'dark')
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

  /**
   * Adopt `app.mapTheme`, the value the control writes now (a retired
   * "colour" reads as LIGHT). Falls back to the older boolean
   * `app.lightMapTheme` so an old config still restores the palette it
   * recorded; anything else (including a missing key) leaves the local value
   * alone.
   */
  function hydrateMapTheme(remote: unknown, legacyLightFlag?: unknown): void {
    const normalised = normaliseMapTheme(remote)
    if (isMapTheme(normalised)) {
      setMapTheme(normalised)
      return
    }
    hydrateLightMapTheme(legacyLightFlag)
  }

  /** Re-read the basemap palette, preferring `app.mapTheme` over the flag. */
  async function hydrateMapThemeFromDb(): Promise<void> {
    try {
      const res = await fetch('/api/settings/app')
      if (!res.ok) return
      const data = await res.json()
      hydrateMapTheme(data?.mapTheme, data?.lightMapTheme)
    } catch {
      /* offline / transient — localStorage already holds a usable value */
    }
  }

  return {
    theme,
    mapTheme,
    isMapLight,
    setMapTheme,
    setLightMapTheme,
    hydrateLightMapTheme,
    hydrateMapTheme,
    hydrateMapThemeFromDb,
  }
})

export type ThemeStore = ReturnType<typeof useThemeStore>
