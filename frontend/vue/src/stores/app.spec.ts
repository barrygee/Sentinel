import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from './app'

describe('app store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('has the expected initial state', () => {
    const store = useAppStore()
    expect(store.connectivityMode).toBe('auto')
    expect(store.isOnline).toBe(true)
    expect(store.enabledDomains).toEqual(['air', 'space', 'sea', 'land', 'sdr'])
    expect(store.notificationSound).toBe(false)
    expect(store.sideMenuOpen).toBe(true)
  })

  it('toggleSideMenu flips the map right-rail visibility', () => {
    const store = useAppStore()
    expect(store.sideMenuOpen).toBe(true)
    store.toggleSideMenu()
    expect(store.sideMenuOpen).toBe(false)
    store.toggleSideMenu()
    expect(store.sideMenuOpen).toBe(true)
  })

  it('reads notificationSound=true from localStorage on creation', () => {
    localStorage.setItem('appNotificationSound', '1')
    const store = useAppStore()
    expect(store.notificationSound).toBe(true)
  })

  it('defaults notificationSound to false when localStorage access throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    const store = useAppStore()
    expect(store.notificationSound).toBe(false)
  })

  it('setNotificationSound updates state and persists to localStorage', () => {
    const store = useAppStore()
    store.setNotificationSound(true)
    expect(store.notificationSound).toBe(true)
    expect(localStorage.getItem('appNotificationSound')).toBe('1')
    store.setNotificationSound(false)
    expect(store.notificationSound).toBe(false)
    expect(localStorage.getItem('appNotificationSound')).toBe('0')
  })

  it('setConnectivityMode changes the mode and dispatches an event', () => {
    const store = useAppStore()
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    store.setConnectivityMode('online')
    expect(store.connectivityMode).toBe('online')
    expect(dispatchSpy).toHaveBeenCalledOnce()
    const event = dispatchSpy.mock.calls[0]![0] as CustomEvent
    expect(event.type).toBe('sentinel:connectivityModeChanged')
    expect(event.detail).toEqual({ mode: 'online' })
  })

  it('setConnectivityMode is a no-op (no event) when the mode is unchanged', () => {
    const store = useAppStore()
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    store.setConnectivityMode('auto') // already 'auto'
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('setOnline toggles the online flag', () => {
    const store = useAppStore()
    store.setOnline(false)
    expect(store.isOnline).toBe(false)
  })

  it('setEnabledDomains replaces the enabled domains', () => {
    const store = useAppStore()
    store.setEnabledDomains(['sdr'])
    expect(store.enabledDomains).toEqual(['sdr'])
  })

  it('firstEnabledDomain returns the first enabled domain', () => {
    const store = useAppStore()
    store.setEnabledDomains(['space', 'air'])
    expect(store.firstEnabledDomain()).toBe('space')
  })

  it('firstEnabledDomain falls back to "air" when none are enabled', () => {
    const store = useAppStore()
    store.setEnabledDomains([])
    expect(store.firstEnabledDomain()).toBe('air')
  })

  describe('hydrateNotificationSoundFromDb', () => {
    it('adopts the DB value when it differs from the current state', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notificationSound: true }) }),
      )
      const store = useAppStore()
      await store.hydrateNotificationSoundFromDb()
      expect(store.notificationSound).toBe(true)
      expect(localStorage.getItem('appNotificationSound')).toBe('1')
    })

    it('leaves state unchanged when the response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
      const store = useAppStore()
      await store.hydrateNotificationSoundFromDb()
      expect(store.notificationSound).toBe(false)
    })

    it('leaves state unchanged when the DB value matches the current state', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notificationSound: false }) }),
      )
      const store = useAppStore()
      const setSpy = vi.spyOn(store, 'setNotificationSound')
      await store.hydrateNotificationSoundFromDb()
      expect(store.notificationSound).toBe(false)
      expect(setSpy).not.toHaveBeenCalled()
    })

    it('swallows fetch errors (offline / transient)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
      const store = useAppStore()
      await expect(store.hydrateNotificationSoundFromDb()).resolves.toBeUndefined()
      expect(store.notificationSound).toBe(false)
    })
  })
})
