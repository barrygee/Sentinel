import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/services/settingsApi', () => ({ getNamespace: vi.fn() }))

interface GeoCallbacks {
  success?: PositionCallback
  error?: PositionErrorCallback
  watchCount: number
}

function installGeolocation(present: boolean): GeoCallbacks {
  const captured: GeoCallbacks = { watchCount: 0 }
  const geolocation = present
    ? {
        watchPosition: vi.fn((success: PositionCallback, error: PositionErrorCallback) => {
          captured.success = success
          captured.error = error
          captured.watchCount++
          return captured.watchCount
        }),
        clearWatch: vi.fn(),
      }
    : undefined
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geolocation })
  return captured
}

async function load() {
  const mod = await import('./useUserLocation')
  const api = await import('@/services/settingsApi')
  return { mod, getNamespace: vi.mocked(api.getNamespace) }
}

describe('useUserLocation', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('initial load from storage', () => {
    it('is null when nothing is stored', async () => {
      installGeolocation(false)
      const { mod } = await load()
      expect(mod.useUserLocation().location.value).toBeNull()
    })

    it('loads a manual location regardless of age', async () => {
      localStorage.setItem(
        'sentinel_user_location',
        JSON.stringify({ longitude: 2, latitude: 48, ts: 0, manual: true }),
      )
      installGeolocation(false)
      const { mod } = await load()
      expect(mod.useUserLocation().location.value).toEqual({ lon: 2, lat: 48, accuracy: 0 })
    })

    it('loads a fresh GPS fix', async () => {
      localStorage.setItem(
        'sentinel_user_location',
        JSON.stringify({ longitude: 2, latitude: 48, ts: Date.now() }),
      )
      installGeolocation(false)
      const { mod } = await load()
      expect(mod.useUserLocation().location.value).not.toBeNull()
    })

    it('discards an expired non-manual GPS fix', async () => {
      localStorage.setItem(
        'sentinel_user_location',
        JSON.stringify({ longitude: 2, latitude: 48, ts: 1 }),
      )
      installGeolocation(false)
      const { mod } = await load()
      expect(mod.useUserLocation().location.value).toBeNull()
    })

    it('returns null for a record missing coordinates', async () => {
      localStorage.setItem('sentinel_user_location', JSON.stringify({ ts: Date.now() }))
      installGeolocation(false)
      const { mod } = await load()
      expect(mod.useUserLocation().location.value).toBeNull()
    })

    it('returns null for malformed JSON', async () => {
      localStorage.setItem('sentinel_user_location', '{broken')
      installGeolocation(false)
      const { mod } = await load()
      expect(mod.useUserLocation().location.value).toBeNull()
    })

    it('treats a missing timestamp as 0 (expired) for a non-manual fix', async () => {
      localStorage.setItem(
        'sentinel_user_location',
        JSON.stringify({ longitude: 2, latitude: 48 }), // no ts, no manual
      )
      installGeolocation(false)
      const { mod } = await load()
      expect(mod.useUserLocation().location.value).toBeNull()
    })
  })

  describe('sentinel:setUserLocation event', () => {
    it('sets, persists and syncs the location, and PUTs it to the API', async () => {
      installGeolocation(false)
      const { mod } = await load()
      const synced = vi.fn()
      window.addEventListener('settings:locationSynced', synced)
      window.dispatchEvent(
        new CustomEvent('sentinel:setUserLocation', {
          detail: { longitude: 5, latitude: 50 },
        }),
      )
      expect(mod.useUserLocation().location.value).toEqual({ lon: 5, lat: 50, accuracy: 0 })
      expect(synced).toHaveBeenCalled()
      expect(fetch).toHaveBeenCalledWith('/api/settings/app/location', expect.any(Object))
      const stored = JSON.parse(localStorage.getItem('sentinel_user_location')!)
      expect(stored.manual).toBe(true)
      window.removeEventListener('settings:locationSynced', synced)
    })

    it('does not PUT when persist is false', async () => {
      installGeolocation(false)
      await load()
      ;(fetch as ReturnType<typeof vi.fn>).mockClear()
      window.dispatchEvent(
        new CustomEvent('sentinel:setUserLocation', {
          detail: { longitude: 5, latitude: 50, persist: false, manual: false },
        }),
      )
      expect(fetch).not.toHaveBeenCalled()
    })

    it('swallows a failed persist PUT', async () => {
      installGeolocation(false)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const { mod } = await load()
      window.dispatchEvent(
        new CustomEvent('sentinel:setUserLocation', { detail: { longitude: 5, latitude: 50 } }),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(mod.useUserLocation().location.value).not.toBeNull()
    })
  })

  it('sentinel:userLocationCleared event clears stored and in-memory state', async () => {
    localStorage.setItem(
      'sentinel_user_location',
      JSON.stringify({ longitude: 2, latitude: 48, ts: Date.now(), manual: true }),
    )
    installGeolocation(false)
    const { mod } = await load()
    expect(mod.useUserLocation().location.value).not.toBeNull()
    window.dispatchEvent(new CustomEvent('sentinel:userLocationCleared'))
    expect(mod.useUserLocation().location.value).toBeNull()
    expect(localStorage.getItem('sentinel_user_location')).toBeNull()
  })

  describe('startGps', () => {
    it('flags location unavailable when geolocation is unsupported', async () => {
      installGeolocation(false)
      const { mod } = await load()
      const composable = mod.useUserLocation()
      composable.start()
      expect(composable.locationUnavailable.value).toBe(true)
    })

    it('starts a watch and ignores a second start', async () => {
      const geo = installGeolocation(true)
      const { mod } = await load()
      mod.useUserLocation().start()
      mod.useUserLocation().start()
      expect(geo.watchCount).toBe(1)
    })

    it('updates the location on a successful position', async () => {
      const geo = installGeolocation(true)
      const { mod } = await load()
      const composable = mod.useUserLocation()
      composable.start()
      geo.success?.({
        coords: { latitude: 10, longitude: 20, accuracy: 5 },
      } as GeolocationPosition)
      expect(composable.location.value).toEqual({ lat: 10, lon: 20, accuracy: 5 })
    })

    it('ignores GPS updates when a manual override is set', async () => {
      localStorage.setItem(
        'sentinel_user_location',
        JSON.stringify({ longitude: 2, latitude: 48, ts: Date.now(), manual: true }),
      )
      const geo = installGeolocation(true)
      const { mod } = await load()
      const composable = mod.useUserLocation()
      composable.start()
      geo.success?.({
        coords: { latitude: 99, longitude: 99, accuracy: 5 },
      } as GeolocationPosition)
      expect(composable.location.value).toEqual({ lon: 2, lat: 48, accuracy: 0 }) // unchanged
    })

    it('retries with network accuracy when high-accuracy GPS times out', async () => {
      const geo = installGeolocation(true)
      const { mod } = await load()
      mod.useUserLocation().start()
      geo.error?.({ code: 3, TIMEOUT: 3 } as unknown as GeolocationPositionError)
      expect(geo.watchCount).toBe(2) // re-watched with low accuracy
    })

    it('flags location unavailable on a non-timeout error with no fix', async () => {
      const geo = installGeolocation(true)
      const { mod } = await load()
      const composable = mod.useUserLocation()
      composable.start()
      geo.error?.({ code: 1, TIMEOUT: 3 } as unknown as GeolocationPositionError)
      expect(composable.locationUnavailable.value).toBe(true)
    })
  })

  describe('GPS edge cases', () => {
    it('throttles repeated GPS persists and swallows a failed one', async () => {
      const geo = installGeolocation(true)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const { mod } = await load()
      mod.useUserLocation().start()
      const pos = {
        coords: { latitude: 1, longitude: 1, accuracy: 5 },
      } as GeolocationPosition
      geo.success?.(pos) // first fix persists (PUT rejects → swallowed)
      geo.success?.(pos) // immediate second fix is throttled (no PUT)
      await new Promise((resolve) => setTimeout(resolve, 0))
      const putCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0] === '/api/settings/app/location',
      )
      expect(putCalls).toHaveLength(1)
    })

    it('handles a timeout error when no watch id was returned', async () => {
      const captured: { error?: PositionErrorCallback; count: number } = { count: 0 }
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          watchPosition: vi.fn((_s: PositionCallback, error: PositionErrorCallback) => {
            captured.error = error
            captured.count++
            return null // no watch id
          }),
          clearWatch: vi.fn(),
        },
      })
      const { mod } = await load()
      mod.useUserLocation().start()
      captured.error?.({ code: 3, TIMEOUT: 3 } as unknown as GeolocationPositionError)
      expect(captured.count).toBe(2) // retried with low accuracy
    })

    it('does not flag unavailable on an error when a location already exists', async () => {
      const geo = installGeolocation(true)
      const { mod } = await load()
      const composable = mod.useUserLocation()
      window.dispatchEvent(
        new CustomEvent('sentinel:setUserLocation', {
          detail: { longitude: 5, latitude: 50, persist: false },
        }),
      )
      composable.start()
      geo.error?.({ code: 1, TIMEOUT: 3 } as unknown as GeolocationPositionError)
      expect(composable.locationUnavailable.value).toBe(false)
    })

    it('does not flag unavailable without geolocation when a location exists', async () => {
      installGeolocation(false)
      const { mod } = await load()
      const composable = mod.useUserLocation()
      window.dispatchEvent(
        new CustomEvent('sentinel:setUserLocation', {
          detail: { longitude: 5, latitude: 50, persist: false },
        }),
      )
      composable.start()
      expect(composable.locationUnavailable.value).toBe(false)
    })
  })

  describe('hydrateFromConfig', () => {
    it('does nothing when the config has no location key', async () => {
      installGeolocation(false)
      const { mod, getNamespace } = await load()
      getNamespace.mockResolvedValue({ other: 1 })
      const composable = mod.useUserLocation()
      await composable.hydrateFromConfig()
      expect(composable.location.value).toBeNull()
    })

    it('does nothing when getNamespace returns nothing', async () => {
      installGeolocation(false)
      const { mod, getNamespace } = await load()
      getNamespace.mockResolvedValue(null as unknown as Record<string, unknown>)
      const composable = mod.useUserLocation()
      await composable.hydrateFromConfig()
      expect(composable.location.value).toBeNull()
    })

    it('seeds the marker from a valid config location', async () => {
      installGeolocation(false)
      const { mod, getNamespace } = await load()
      getNamespace.mockResolvedValue({ location: { latitude: 51, longitude: -0.1 } })
      const composable = mod.useUserLocation()
      await composable.hydrateFromConfig()
      expect(composable.location.value).toEqual({ lon: -0.1, lat: 51, accuracy: 0 })
    })

    it('keeps an in-session manual override over a valid config location', async () => {
      installGeolocation(false)
      const { mod, getNamespace } = await load()
      const composable = mod.useUserLocation()
      // A manual set establishes the override.
      window.dispatchEvent(
        new CustomEvent('sentinel:setUserLocation', {
          detail: { longitude: 1, latitude: 2, persist: false },
        }),
      )
      getNamespace.mockResolvedValue({ location: { latitude: 51, longitude: -0.1 } })
      await composable.hydrateFromConfig()
      // Override wins — the manual location is untouched.
      expect(composable.location.value).toEqual({ lon: 1, lat: 2, accuracy: 0 })
    })

    it('clears the location when the config location is empty/invalid', async () => {
      localStorage.setItem(
        'sentinel_user_location',
        JSON.stringify({ longitude: 2, latitude: 48, ts: Date.now(), manual: false }),
      )
      installGeolocation(false)
      const { mod, getNamespace } = await load()
      getNamespace.mockResolvedValue({ location: { latitude: null, longitude: null } })
      const composable = mod.useUserLocation()
      await composable.hydrateFromConfig()
      expect(composable.location.value).toBeNull()
    })
  })
})
