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
 * Cross-cutting appearance state. Held in its own store rather than on `app`
 * because every domain map, the settings panel and the pre-paint script all
 * read it, and none of them are "app connectivity" concerns.
 */
export const useThemeStore = defineStore('theme', () => {
  const theme = usePersistedRef<AppTheme>(LS_KEY, DEFAULT_THEME, isAppTheme)

  // The pre-paint script in index.html has normally set this already; re-apply
  // so the attribute is still correct when the store is created in a test or
  // any other context that never ran that script.
  applyThemeAttribute(theme.value)
  watch(theme, applyThemeAttribute)

  const isLight = computed(() => theme.value === 'light')

  /** Switch theme. The persisted write is the settings control's to stage. */
  function setTheme(next: AppTheme): void {
    theme.value = next
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

  /**
   * Adopt `app.lightTheme` from the config database (startup, or after the
   * app-config JSON is uploaded). A missing or non-boolean value is ignored,
   * leaving whatever localStorage restored.
   */
  function hydrateLightTheme(remote: unknown): void {
    if (typeof remote === 'boolean') setLightTheme(remote)
  }

  /** Re-read `app.lightTheme` from the DB, for the control's staged lifecycle. */
  async function hydrateLightThemeFromDb(): Promise<void> {
    try {
      const res = await fetch('/api/settings/app')
      if (!res.ok) return
      const data = await res.json()
      hydrateLightTheme(data?.lightTheme)
    } catch {
      /* offline / transient — localStorage already holds a usable value */
    }
  }

  return { theme, isLight, setTheme, setLightTheme, hydrateLightTheme, hydrateLightThemeFromDb }
})

export type ThemeStore = ReturnType<typeof useThemeStore>
