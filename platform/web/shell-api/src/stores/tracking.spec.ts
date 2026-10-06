import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTrackingStore, type TrackingItem } from './tracking'

const LS_KEY = 'trackingItems'

function makeItem(id: string, overrides: Partial<TrackingItem> = {}): TrackingItem {
  return {
    id,
    name: `Item ${id}`,
    domain: 'air',
    fields: [{ label: 'Alt', value: '10000' }],
    ...overrides,
  }
}

describe('tracking store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has the expected empty initial state', () => {
    const store = useTrackingStore()
    expect(store.panelOpen).toBe(false)
    expect(store.allItems).toEqual([])
    expect(store.count).toBe(0)
  })

  it('register adds a live item, opens the panel, and persists it', () => {
    const store = useTrackingStore()
    store.register(makeItem('a'))
    expect(store.isLive('a')).toBe(true)
    expect(store.getLiveItem('a')?.id).toBe('a')
    expect(store.count).toBe(1)
    expect(store.panelOpen).toBe(true)
    expect(JSON.parse(localStorage.getItem(LS_KEY)!)).toHaveLength(1)
  })

  it('getLiveItem returns undefined for an unknown id', () => {
    const store = useTrackingStore()
    expect(store.getLiveItem('nope')).toBeUndefined()
    expect(store.isLive('nope')).toBe(false)
  })

  it('allItems lists live items first, then read-only stored ones', () => {
    // Seed a stored-only item directly.
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([{ id: 'stored', name: 'Stored', domain: 'space', fields: [] }]),
    )
    const store = useTrackingStore()
    store.register(makeItem('live'))
    const ids = store.allItems.map((item) => item.id)
    expect(ids).toEqual(['live', 'stored'])
  })

  it('does not duplicate an item that is both live and stored', () => {
    const store = useTrackingStore()
    store.register(makeItem('a'))
    // Registering persisted it; re-reading must not list it twice.
    expect(store.allItems.filter((item) => item.id === 'a')).toHaveLength(1)
  })

  describe('unregister', () => {
    it('removes a live item from state and storage', () => {
      const store = useTrackingStore()
      store.register(makeItem('a'))
      store.unregister('a')
      expect(store.isLive('a')).toBe(false)
      expect(store.count).toBe(0)
      expect(JSON.parse(localStorage.getItem(LS_KEY)!)).toEqual([])
    })

    it('removes a stored-only item and re-evaluates allItems', () => {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify([{ id: 'stored', name: 'S', domain: 'space', fields: [] }]),
      )
      const store = useTrackingStore()
      expect(store.count).toBe(1)
      store.unregister('stored')
      expect(store.count).toBe(0)
      expect(store.allItems).toEqual([])
    })
  })

  describe('updateFields', () => {
    it('updates the fields of a live item and persists', () => {
      const store = useTrackingStore()
      store.register(makeItem('a'))
      store.updateFields('a', [{ label: 'Spd', value: '420' }])
      expect(store.getLiveItem('a')?.fields).toEqual([{ label: 'Spd', value: '420' }])
      expect(JSON.parse(localStorage.getItem(LS_KEY)!)[0].fields).toEqual([
        { label: 'Spd', value: '420' },
      ])
    })

    it('is a no-op for an unknown id', () => {
      const store = useTrackingStore()
      expect(() => store.updateFields('nope', [])).not.toThrow()
    })
  })

  describe('deactivate', () => {
    it('drops the live callback but keeps the item visible (read-only)', () => {
      const store = useTrackingStore()
      const onUntrack = vi.fn()
      store.register(makeItem('a', { onUntrack }))
      store.deactivate('a')
      expect(store.isLive('a')).toBe(false)
      // Still present from localStorage as a read-only entry.
      expect(store.allItems.map((item) => item.id)).toContain('a')
    })

    it('is a no-op for an unknown id', () => {
      const store = useTrackingStore()
      expect(() => store.deactivate('nope')).not.toThrow()
    })
  })

  describe('untrackItem', () => {
    it('invokes the live onUntrack callback when present', () => {
      const store = useTrackingStore()
      const onUntrack = vi.fn()
      store.register(makeItem('a', { onUntrack }))
      store.untrackItem('a')
      expect(onUntrack).toHaveBeenCalledOnce()
    })

    it('falls back to unregister when there is no onUntrack callback', () => {
      const store = useTrackingStore()
      store.register(makeItem('a'))
      store.untrackItem('a')
      expect(store.isLive('a')).toBe(false)
    })
  })

  it('togglePanel flips the panel open state', () => {
    const store = useTrackingStore()
    store.togglePanel()
    expect(store.panelOpen).toBe(true)
    store.togglePanel()
    expect(store.panelOpen).toBe(false)
  })

  describe('storage resilience', () => {
    it('treats malformed stored JSON as empty', () => {
      localStorage.setItem(LS_KEY, '{not an array')
      const store = useTrackingStore()
      expect(store.allItems).toEqual([])
    })

    it('swallows write failures on register', () => {
      const store = useTrackingStore()
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      expect(() => store.register(makeItem('a'))).not.toThrow()
    })

    it('swallows write failures on unregister', () => {
      const store = useTrackingStore()
      store.register(makeItem('a'))
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      expect(() => store.unregister('a')).not.toThrow()
    })
  })
})
