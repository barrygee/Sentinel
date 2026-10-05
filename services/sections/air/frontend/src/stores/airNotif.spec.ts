import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAirNotifStore, createNotifEnabledAdapter } from './airNotif'

const HEXES_KEY = 'air_notif_enabled_hexes'
const CALLSIGNS_KEY = 'air_notif_callsigns'

describe('airNotif store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial load from localStorage', () => {
    it('starts empty when nothing is stored', () => {
      const store = useAirNotifStore()
      expect(store.count).toBe(0)
      expect(store.callsigns).toEqual({})
    })

    it('hydrates hexes from a stored string array, filtering non-strings', () => {
      localStorage.setItem(HEXES_KEY, JSON.stringify(['abc', 123, 'def']))
      const store = useAirNotifStore()
      expect([...store.enabledHexes]).toEqual(['abc', 'def'])
    })

    it('ignores a non-array hexes payload', () => {
      localStorage.setItem(HEXES_KEY, JSON.stringify({ not: 'array' }))
      const store = useAirNotifStore()
      expect(store.count).toBe(0)
    })

    it('hydrates callsigns from a stored object', () => {
      localStorage.setItem(CALLSIGNS_KEY, JSON.stringify({ abc: 'BAW123' }))
      const store = useAirNotifStore()
      expect(store.callsigns).toEqual({ abc: 'BAW123' })
    })

    it('ignores an array callsigns payload', () => {
      localStorage.setItem(CALLSIGNS_KEY, JSON.stringify(['nope']))
      const store = useAirNotifStore()
      expect(store.callsigns).toEqual({})
    })

    it('falls back to empties when stored JSON is malformed', () => {
      localStorage.setItem(HEXES_KEY, '[broken')
      localStorage.setItem(CALLSIGNS_KEY, '{broken')
      const store = useAirNotifStore()
      expect(store.count).toBe(0)
      expect(store.callsigns).toEqual({})
    })
  })

  it('isEnabled reflects membership', () => {
    const store = useAirNotifStore()
    expect(store.isEnabled('abc')).toBe(false)
    store.enable('abc')
    expect(store.isEnabled('abc')).toBe(true)
  })

  it('callsignFor returns the cached callsign or the hex itself', () => {
    const store = useAirNotifStore()
    expect(store.callsignFor('abc')).toBe('abc')
    store.enable('abc', 'BAW123')
    expect(store.callsignFor('abc')).toBe('BAW123')
  })

  describe('enable', () => {
    it('adds the hex and persists it', () => {
      const store = useAirNotifStore()
      store.enable('abc')
      expect(store.isEnabled('abc')).toBe(true)
      expect(JSON.parse(localStorage.getItem(HEXES_KEY)!)).toEqual(['abc'])
    })

    it('caches the callsign when it differs from the hex', () => {
      const store = useAirNotifStore()
      store.enable('abc', 'BAW123')
      expect(store.callsigns.abc).toBe('BAW123')
      expect(JSON.parse(localStorage.getItem(CALLSIGNS_KEY)!)).toEqual({ abc: 'BAW123' })
    })

    it('does not cache a callsign equal to the hex', () => {
      const store = useAirNotifStore()
      store.enable('abc', 'abc')
      expect(store.callsigns).toEqual({})
    })

    it('updates the cached callsign even when the hex is already enabled', () => {
      const store = useAirNotifStore()
      store.enable('abc')
      store.enable('abc', 'BAW999')
      expect(store.callsignFor('abc')).toBe('BAW999')
      expect(store.count).toBe(1)
    })
  })

  describe('disable', () => {
    it('removes the hex and persists', () => {
      const store = useAirNotifStore()
      store.enable('abc')
      store.disable('abc')
      expect(store.isEnabled('abc')).toBe(false)
      expect(JSON.parse(localStorage.getItem(HEXES_KEY)!)).toEqual([])
    })

    it('is a no-op when the hex is not enabled', () => {
      const store = useAirNotifStore()
      store.disable('missing')
      expect(store.count).toBe(0)
    })
  })

  describe('clear', () => {
    it('empties all enabled hexes', () => {
      const store = useAirNotifStore()
      store.enable('a')
      store.enable('b')
      store.clear()
      expect(store.count).toBe(0)
    })

    it('is a no-op when already empty', () => {
      const store = useAirNotifStore()
      const setItemSpy = vi.spyOn(localStorage, 'setItem')
      store.clear()
      expect(setItemSpy).not.toHaveBeenCalled()
    })
  })

  it('swallows localStorage write failures', () => {
    const store = useAirNotifStore()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => store.enable('abc', 'BAW123')).not.toThrow()
  })

  describe('createNotifEnabledAdapter', () => {
    it('delegates has/add/delete to the store', () => {
      const store = useAirNotifStore()
      const adapter = createNotifEnabledAdapter(store)
      expect(adapter.has('abc')).toBe(false)
      adapter.add('abc', 'BAW123')
      expect(adapter.has('abc')).toBe(true)
      expect(store.callsignFor('abc')).toBe('BAW123')
      adapter.delete('abc')
      expect(adapter.has('abc')).toBe(false)
    })
  })
})
