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

describe('theme store defaults', () => {
  it('starts dark and publishes that on the document element', () => {
    expect(useThemeStore().theme).toBe('dark')
    expect(useThemeStore().isLight).toBe(false)
    expect(themeAttribute()).toBe('dark')
  })

  it('restores a persisted light theme and publishes it', () => {
    localStorage.setItem(LS_KEY, JSON.stringify('light'))
    setActivePinia(createPinia())
    expect(useThemeStore().theme).toBe('light')
    expect(useThemeStore().isLight).toBe(true)
    expect(themeAttribute()).toBe('light')
  })

  it('falls back to dark when the persisted value is not a known theme', () => {
    localStorage.setItem(LS_KEY, JSON.stringify('solarized'))
    setActivePinia(createPinia())
    expect(useThemeStore().theme).toBe('dark')
    expect(themeAttribute()).toBe('dark')
  })
})

describe('theme store setTheme', () => {
  it('switches to light, persists it, and republishes the attribute', async () => {
    const store = useThemeStore()
    store.setTheme('light')
    await nextTick()
    expect(store.theme).toBe('light')
    expect(store.isLight).toBe(true)
    expect(persisted()).toBe(JSON.stringify('light'))
    expect(themeAttribute()).toBe('light')
  })

  it('switches back to dark', async () => {
    const store = useThemeStore()
    store.setTheme('light')
    await nextTick()
    store.setTheme('dark')
    await nextTick()
    expect(store.theme).toBe('dark')
    expect(themeAttribute()).toBe('dark')
  })
})

describe('theme store setLightTheme', () => {
  it.each([
    [true, 'light'],
    [false, 'dark'],
  ] as const)('maps the %s flag onto the %s theme', async (flag, expected) => {
    const store = useThemeStore()
    store.setLightTheme(flag)
    await nextTick()
    expect(store.theme).toBe(expected)
    expect(themeAttribute()).toBe(expected)
  })
})

describe('theme store hydrateLightTheme', () => {
  it('adopts a true flag from the config database', async () => {
    const store = useThemeStore()
    store.hydrateLightTheme(true)
    await nextTick()
    expect(store.theme).toBe('light')
  })

  it('adopts a false flag, overriding a locally restored light theme', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify('light'))
    setActivePinia(createPinia())
    const store = useThemeStore()
    store.hydrateLightTheme(false)
    await nextTick()
    expect(store.theme).toBe('dark')
  })

  it.each([[undefined], [null], ['light'], [1]])(
    'ignores the non-boolean value %s and keeps the restored theme',
    async (remote) => {
      localStorage.setItem(LS_KEY, JSON.stringify('light'))
      setActivePinia(createPinia())
      const store = useThemeStore()
      store.hydrateLightTheme(remote)
      await nextTick()
      expect(store.theme).toBe('light')
    },
  )
})

describe('theme store hydrateLightThemeFromDb', () => {
  it('adopts the flag the settings endpoint reports', async () => {
    stubFetch({ lightTheme: true })
    const store = useThemeStore()
    await store.hydrateLightThemeFromDb()
    expect(fetch).toHaveBeenCalledWith('/api/settings/app')
    expect(store.theme).toBe('light')
  })

  it('keeps the current theme when the endpoint fails', async () => {
    stubFetch({ lightTheme: true }, false)
    const store = useThemeStore()
    await store.hydrateLightThemeFromDb()
    expect(store.theme).toBe('dark')
  })

  it('keeps the current theme when the request throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const store = useThemeStore()
    await store.hydrateLightThemeFromDb()
    expect(store.theme).toBe('dark')
  })

  it('keeps the current theme when the key is absent from the namespace', async () => {
    stubFetch({})
    const store = useThemeStore()
    await store.hydrateLightThemeFromDb()
    expect(store.theme).toBe('dark')
  })
})

describe('theme store map theme', () => {
  it('starts dark and publishes that on its own attribute', () => {
    const store = useThemeStore()
    expect(store.mapTheme).toBe('dark')
    expect(store.isMapLight).toBe(false)
    expect(document.documentElement.dataset.mapTheme).toBe('dark')
  })

  it('seeds from the interface theme when it has no key of its own', () => {
    // The upgrade path: before the split, one switch drove both, so an
    // operator running the light theme was looking at a light map. Seeding
    // keeps that view through the first load after the split.
    localStorage.setItem(LS_KEY, JSON.stringify('light'))
    const store = useThemeStore()
    expect(store.mapTheme).toBe('light')
    expect(document.documentElement.dataset.mapTheme).toBe('light')
  })

  it('prefers its own persisted value over the interface theme', () => {
    localStorage.setItem(LS_KEY, JSON.stringify('light'))
    localStorage.setItem(MAP_LS_KEY, JSON.stringify('dark'))
    const store = useThemeStore()
    expect(store.theme).toBe('light')
    expect(store.mapTheme).toBe('dark')
  })

  it('switches independently of the interface, persisting its own key', async () => {
    const store = useThemeStore()
    store.setMapTheme('light')
    await nextTick()

    expect(store.mapTheme).toBe('light')
    expect(document.documentElement.dataset.mapTheme).toBe('light')
    expect(localStorage.getItem(MAP_LS_KEY)).toBe(JSON.stringify('light'))
    // The interface is untouched — and its key is never written, because
    // nothing changed it (the store persists on change, not on creation).
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
    localStorage.setItem(LS_KEY, JSON.stringify('light'))
    const store = useThemeStore()
    expect(store.mapTheme).toBe('light')

    // A config written before the split has no map key at all; leaving the
    // seeded value alone is what stops the basemap flipping under the operator.
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

describe('theme store map theme — the colour palette', () => {
  it('accepts colour as a persisted value', () => {
    localStorage.setItem(MAP_LS_KEY, JSON.stringify('colour'))
    expect(useThemeStore().mapTheme).toBe('colour')
    expect(document.documentElement.dataset.mapTheme).toBe('colour')
  })

  it('is not "light" for overlay purposes', () => {
    // Overlay ink asks `isMapLight`; the colour build is mid-toned and, dimmed
    // by the canvas filter, takes the dark palette's lime and white.
    const store = useThemeStore()
    store.setMapTheme('colour')
    expect(store.isMapLight).toBe(false)
  })

  it('adopts the three-way value from the config database', () => {
    const store = useThemeStore()
    store.hydrateMapTheme('colour')
    expect(store.mapTheme).toBe('colour')
  })

  it('falls back to the pre-colour boolean when that is all the config has', () => {
    const store = useThemeStore()
    store.hydrateMapTheme(undefined, true)
    expect(store.mapTheme).toBe('light')
  })

  it('ignores an unknown value rather than guessing', () => {
    const store = useThemeStore()
    store.setMapTheme('colour')
    store.hydrateMapTheme('sepia')
    expect(store.mapTheme).toBe('colour')
  })

  it('prefers the three-way value over the legacy flag', async () => {
    stubFetch({ mapTheme: 'colour', lightMapTheme: true })
    const store = useThemeStore()
    await store.hydrateMapThemeFromDb()
    expect(store.mapTheme).toBe('colour')
  })

  it('reads the legacy flag from the endpoint when the new key is absent', async () => {
    stubFetch({ lightMapTheme: true })
    const store = useThemeStore()
    await store.hydrateMapThemeFromDb()
    expect(store.mapTheme).toBe('light')
  })
})
