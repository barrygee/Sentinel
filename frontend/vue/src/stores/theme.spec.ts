import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { useThemeStore } from './theme'

const LS_KEY = 'sentinel_theme'

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
