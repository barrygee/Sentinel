import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { useThemeStore } from './theme'

const LS_KEY = 'sentinel_theme'
const MAP_LS_KEY = 'sentinel_map_theme'

/** What the store persisted to localStorage, as the raw JSON string. */
function persisted(): string | null {
  return localStorage.getItem(LS_KEY)
}

/** The attribute the stylesheets and the map controls read the theme from. */
function themeAttribute(): string | undefined {
  return document.documentElement.dataset.theme
}

function stubFetch(payload: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => payload }))
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.mapTheme
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('theme store interface palette', () => {
  it('is dark, and publishes that on the document element', () => {
    const store = useThemeStore()
    expect(store.theme).toBe('dark')
    expect(themeAttribute()).toBe('dark')
  })

  it('stays dark whatever the old light-theme key says', () => {
    // The light interface was dropped; an install that had it switched on
    // still has the key, and must not resurrect a palette the app no longer
    // ships a control for.
    localStorage.setItem(LS_KEY, JSON.stringify('light'))
    const store = useThemeStore()
    expect(store.theme).toBe('dark')
    expect(themeAttribute()).toBe('dark')
  })

  it('does not write the retired key back', () => {
    useThemeStore()
    expect(persisted()).toBeNull()
  })
})

describe('theme store map theme', () => {
  it('starts dark and publishes that on its own attribute', () => {
    const store = useThemeStore()
    expect(store.mapTheme).toBe('dark')
    expect(store.isMapLight).toBe(false)
    expect(document.documentElement.dataset.mapTheme).toBe('dark')
  })

  it('restores its own persisted value, ignoring the retired interface key', () => {
    localStorage.setItem(LS_KEY, JSON.stringify('light'))
    localStorage.setItem(MAP_LS_KEY, JSON.stringify('light'))
    const store = useThemeStore()
    expect(store.mapTheme).toBe('light')
    expect(store.theme).toBe('dark')
  })

  it('switches without touching the interface, persisting its own key', async () => {
    const store = useThemeStore()
    store.setMapTheme('light')
    await nextTick()

    expect(store.mapTheme).toBe('light')
    expect(document.documentElement.dataset.mapTheme).toBe('light')
    expect(localStorage.getItem(MAP_LS_KEY)).toBe(JSON.stringify('light'))
    // The interface is fixed dark and has no key to write.
    expect(store.theme).toBe('dark')
    expect(themeAttribute()).toBe('dark')
    expect(persisted()).toBeNull()
  })

  it('takes a boolean from the light-map switch', () => {
    const store = useThemeStore()
    store.setLightMapTheme(true)
    expect(store.mapTheme).toBe('light')
    store.setLightMapTheme(false)
    expect(store.mapTheme).toBe('dark')
  })

  it('adopts a flag from the config database, and ignores a missing one', () => {
    localStorage.setItem(MAP_LS_KEY, JSON.stringify('light'))
    const store = useThemeStore()
    expect(store.mapTheme).toBe('light')

    // A config written before the map had its own control has no key at all;
    // leaving the restored value alone is what stops the basemap flipping
    // under the operator.
    store.hydrateLightMapTheme(undefined)
    expect(store.mapTheme).toBe('light')

    store.hydrateLightMapTheme(false)
    expect(store.mapTheme).toBe('dark')
  })

  it('re-reads its own key from the settings endpoint', async () => {
    stubFetch({ lightTheme: false, mapTheme: 'light' })
    const store = useThemeStore()
    await store.hydrateMapThemeFromDb()
    expect(store.mapTheme).toBe('light')
    expect(store.theme).toBe('dark')
  })

  it('keeps the current map theme when the endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const store = useThemeStore()
    await store.hydrateMapThemeFromDb()
    expect(store.mapTheme).toBe('dark')
  })

  it('keeps the current map theme when the response is not ok', async () => {
    stubFetch({ mapTheme: 'light' }, false)
    const store = useThemeStore()
    await store.hydrateMapThemeFromDb()
    expect(store.mapTheme).toBe('dark')
  })
})

describe('theme store map theme — the retired COLOUR palette', () => {
  // COLOUR was renamed LIGHT (and the old light map removed), so a saved
  // "colour" must come back as LIGHT, never fall back to the dark map.
  it('loads a persisted "colour" as light and rewrites the stored value', () => {
    localStorage.setItem(MAP_LS_KEY, JSON.stringify('colour'))
    const store = useThemeStore()
    expect(store.mapTheme).toBe('light')
    expect(store.isMapLight).toBe(true)
    expect(document.documentElement.dataset.mapTheme).toBe('light')
    expect(localStorage.getItem(MAP_LS_KEY)).toBe(JSON.stringify('light'))
  })

  it.each(['light', 'dark'])('leaves a persisted "%s" as it is', (stored) => {
    localStorage.setItem(MAP_LS_KEY, JSON.stringify(stored))
    expect(useThemeStore().mapTheme).toBe(stored)
    expect(localStorage.getItem(MAP_LS_KEY)).toBe(JSON.stringify(stored))
  })

  it('survives an unreadable stored value, starting dark', () => {
    localStorage.setItem(MAP_LS_KEY, '{not json')
    expect(useThemeStore().mapTheme).toBe('dark')
  })

  it('adopts a configured "colour" as light', () => {
    const store = useThemeStore()
    store.hydrateMapTheme('colour')
    expect(store.mapTheme).toBe('light')
  })

  it('reads "colour" from the settings endpoint as light', async () => {
    stubFetch({ mapTheme: 'colour' })
    const store = useThemeStore()
    await store.hydrateMapThemeFromDb()
    expect(store.mapTheme).toBe('light')
  })

  it('falls back to the older boolean when that is all the config has', () => {
    const store = useThemeStore()
    store.hydrateMapTheme(undefined, true)
    expect(store.mapTheme).toBe('light')
  })

  it('ignores an unknown value rather than guessing', () => {
    const store = useThemeStore()
    store.setMapTheme('light')
    store.hydrateMapTheme('sepia')
    expect(store.mapTheme).toBe('light')
  })

  it('prefers app.mapTheme over the legacy flag', async () => {
    stubFetch({ mapTheme: 'dark', lightMapTheme: true })
    const store = useThemeStore()
    await store.hydrateMapThemeFromDb()
    expect(store.mapTheme).toBe('dark')
  })

  it('reads the legacy flag from the endpoint when the new key is absent', async () => {
    stubFetch({ lightMapTheme: true })
    const store = useThemeStore()
    await store.hydrateMapThemeFromDb()
    expect(store.mapTheme).toBe('light')
  })
})
