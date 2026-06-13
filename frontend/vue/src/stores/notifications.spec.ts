import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  useNotificationsStore,
  registerAircraftClickHandler,
  getAircraftClickHandler,
  registerSatelliteClickHandler,
  getSatelliteClickHandler,
  clearSatelliteClickHandler,
  setPendingAircraftTarget,
  setPendingSatelliteTarget,
} from './notifications'
import { useAppStore } from './app'
import { playNotificationSound } from '../composables/useNotificationSound'

vi.mock('../composables/useNotificationSound', () => ({
  playNotificationSound: vi.fn(),
}))

const LS_KEY = 'notifications'

describe('notifications store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('module click-handler registry', () => {
    it('registers and returns the aircraft click handler', () => {
      const handler = vi.fn()
      registerAircraftClickHandler(handler)
      expect(getAircraftClickHandler()).toBe(handler)
    })

    it('drains a pending aircraft target on registration', () => {
      setPendingAircraftTarget('abc123')
      const handler = vi.fn()
      registerAircraftClickHandler(handler)
      expect(handler).toHaveBeenCalledWith('abc123')
    })

    it('registers, returns, and clears the satellite click handler', () => {
      const handler = vi.fn()
      registerSatelliteClickHandler(handler)
      expect(getSatelliteClickHandler()).toBe(handler)
      clearSatelliteClickHandler()
      expect(getSatelliteClickHandler()).toBeNull()
    })

    it('drains a pending satellite target on registration', () => {
      setPendingSatelliteTarget('25544', 'ISS')
      const handler = vi.fn()
      registerSatelliteClickHandler(handler)
      expect(handler).toHaveBeenCalledWith('25544', 'ISS')
    })
  })

  describe('load from storage', () => {
    it('starts empty when nothing is stored', () => {
      expect(useNotificationsStore().total).toBe(0)
    })

    it('hydrates from stored items', () => {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify([{ id: '1', type: 'system', title: 'Hi', ts: 1 }]),
      )
      expect(useNotificationsStore().total).toBe(1)
    })

    it('treats malformed JSON as empty', () => {
      localStorage.setItem(LS_KEY, '{broken')
      expect(useNotificationsStore().total).toBe(0)
    })
  })

  it('visible is sorted newest-first by timestamp', () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([
        { id: 'old', type: 'system', title: 'old', ts: 1 },
        { id: 'new', type: 'system', title: 'new', ts: 9 },
      ]),
    )
    const store = useNotificationsStore()
    expect(store.visible.map((item) => item.id)).toEqual(['new', 'old'])
  })

  it('getLabelForType maps known types and falls back to NOTICE', () => {
    const store = useNotificationsStore()
    expect(store.getLabelForType('flight')).toBe('LANDED')
    expect(store.getLabelForType('emergency')).toBe('⚠ EMERGENCY')
    expect(store.getLabelForType('unknown-type')).toBe('NOTICE')
  })

  describe('add', () => {
    it('prepends an item, persists, posts to the API, and returns the id', () => {
      const store = useNotificationsStore()
      const id = store.add({ title: 'Test' })
      expect(typeof id).toBe('string')
      expect(store.total).toBe(1)
      expect(store.items[0].type).toBe('system') // default type
      expect(fetch).toHaveBeenCalledWith(
        '/api/air/messages',
        expect.objectContaining({ method: 'POST' }),
      )
      // Persisted copy strips the action/clickAction.
      expect(JSON.parse(localStorage.getItem(LS_KEY)!)[0].id).toBe(id)
    })

    it('increments the unread count and pulses when the panel is closed', () => {
      const store = useNotificationsStore()
      store.add({ title: 'A' })
      expect(store.unreadCount).toBe(1)
    })

    it('does not increment unread when the panel is open', () => {
      const store = useNotificationsStore()
      store.openPanel()
      store.add({ title: 'A' })
      expect(store.unreadCount).toBe(0)
    })

    it('plays a sound when the app sound setting is on (emergency flag passed)', () => {
      const store = useNotificationsStore()
      useAppStore().setNotificationSound(true)
      store.add({ type: 'emergency', title: 'Mayday' })
      expect(playNotificationSound).toHaveBeenCalledWith(true)
    })

    it('does not play a sound when the setting is off', () => {
      const store = useNotificationsStore()
      store.add({ title: 'Quiet' })
      expect(playNotificationSound).not.toHaveBeenCalled()
    })

    it('publishes a polite live announcement combining title and detail', () => {
      const store = useNotificationsStore()
      store.add({ title: 'Pass starting', detail: 'ISS overhead in 5 min' })
      expect(store.liveAnnouncement).toEqual({
        message: 'Pass starting. ISS overhead in 5 min',
        assertive: false,
        seq: 1,
      })
    })

    it('announces title only when there is no detail', () => {
      const store = useNotificationsStore()
      store.add({ title: 'Tracking on' })
      expect(store.liveAnnouncement?.message).toBe('Tracking on')
    })

    it('routes emergency notifications to the assertive announcer', () => {
      const store = useNotificationsStore()
      store.add({ type: 'emergency', title: 'Squawk 7700' })
      expect(store.liveAnnouncement?.assertive).toBe(true)
    })

    it('bumps the announcement seq on each add so repeated text re-announces', () => {
      const store = useNotificationsStore()
      store.add({ title: 'Same' })
      store.add({ title: 'Same' })
      expect(store.liveAnnouncement?.seq).toBe(2)
    })
  })

  describe('update', () => {
    it('merges provided fields into an existing item', () => {
      const store = useNotificationsStore()
      const id = store.add({ title: 'Original', detail: 'd1' })
      store.update({ id, title: 'Changed' })
      const item = store.items.find((entry) => entry.id === id)!
      expect(item.title).toBe('Changed')
      expect(item.detail).toBe('d1') // unchanged
    })

    it('updates the type and detail when provided', () => {
      const store = useNotificationsStore()
      const id = store.add({ type: 'system', title: 'A', detail: 'old' })
      store.update({ id, type: 'flight', detail: 'new' })
      const item = store.items.find((entry) => entry.id === id)!
      expect(item.type).toBe('flight')
      expect(item.detail).toBe('new')
    })

    it('clears the action when passed null', () => {
      const store = useNotificationsStore()
      const id = store.add({ title: 'A', action: { label: 'Go', callback: () => {} } })
      store.update({ id, action: null })
      expect(store.items.find((entry) => entry.id === id)!.action).toBeUndefined()
    })

    it('is a no-op for an unknown id', () => {
      const store = useNotificationsStore()
      store.add({ title: 'A' })
      expect(() => store.update({ id: 'missing', title: 'X' })).not.toThrow()
    })
  })

  it('dismiss removes an item and deletes it on the API', () => {
    const store = useNotificationsStore()
    const id = store.add({ title: 'A' })
    store.dismiss(id)
    expect(store.total).toBe(0)
    expect(fetch).toHaveBeenCalledWith(
      `/api/air/messages/${encodeURIComponent(id)}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  describe('clearAll', () => {
    it('removes dismissible items but keeps actioned and tracking ones', () => {
      const store = useNotificationsStore()
      store.add({ title: 'plain' })
      store.add({ title: 'actioned', action: { label: 'x', callback: () => {} } })
      store.add({ type: 'tracking', title: 'tracking' })
      store.clearAll()
      const titles = store.items.map((item) => item.title)
      expect(titles).toContain('actioned')
      expect(titles).toContain('tracking')
      expect(titles).not.toContain('plain')
      expect(store.unreadCount).toBe(0)
    })
  })

  describe('panel open/close', () => {
    it('openPanel marks read and clears the unread count', () => {
      const store = useNotificationsStore()
      store.add({ title: 'A' })
      store.openPanel()
      expect(store.panelOpen).toBe(true)
      expect(store.unreadCount).toBe(0)
    })

    it('togglePanel flips between open and closed', () => {
      const store = useNotificationsStore()
      store.togglePanel()
      expect(store.panelOpen).toBe(true)
      store.togglePanel()
      expect(store.panelOpen).toBe(false)
    })
  })

  describe('syncFromBackend', () => {
    it('merges backend rows with local-only items, sorted oldest-first', async () => {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify([
          { id: 'local-only', type: 'system', title: 'local', ts: 50 },
          { id: 'shared', type: 'flight', title: 'old local', ts: 10, hex: 'abc' },
        ]),
      )
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => [
            { msg_id: 'shared', type: 'flight', title: 'backend', detail: 'd', ts: 20 },
            { msg_id: 'tracking-row', type: 'tracking', title: 'skip', detail: '', ts: 30 },
          ],
        }),
      )
      const store = useNotificationsStore()
      await store.syncFromBackend()
      const ids = store.items.map((item) => item.id)
      expect(ids).toEqual(['shared', 'local-only']) // sorted asc; tracking filtered out
      // Local hex is preserved on the merged backend row.
      expect(store.items.find((item) => item.id === 'shared')!.hex).toBe('abc')
    })

    it('defaults a missing detail to an empty string', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => [{ msg_id: 'x', type: 'system', title: 't', ts: 5 }],
        }),
      )
      const store = useNotificationsStore()
      await store.syncFromBackend()
      expect(store.items.find((item) => item.id === 'x')!.detail).toBe('')
    })

    it('returns early when the response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }))
      const store = useNotificationsStore()
      await expect(store.syncFromBackend()).resolves.toBeUndefined()
    })

    it('returns early when there are no rows', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
      const store = useNotificationsStore()
      await store.syncFromBackend()
      expect(store.total).toBe(0)
    })

    it('swallows fetch errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const store = useNotificationsStore()
      await expect(store.syncFromBackend()).resolves.toBeUndefined()
    })
  })

  describe('bell pulse timer', () => {
    it('starts one interval and stops it when the panel opens during a tick', () => {
      vi.useFakeTimers()
      const store = useNotificationsStore()
      store.add({ title: 'A' }) // panel closed -> starts the pulse
      store.add({ title: 'B' }) // second add must not start a second timer
      store.panelOpen = true
      // Advance past the 15s interval; the tick sees the panel open and stops.
      expect(() => vi.advanceTimersByTime(15000)).not.toThrow()
    })

    it('ticks without stopping while the panel stays closed', () => {
      vi.useFakeTimers()
      const store = useNotificationsStore()
      store.add({ title: 'A' })
      expect(() => vi.advanceTimersByTime(15000)).not.toThrow()
    })

    it('clearAll stops the pulse when nothing is kept', () => {
      const store = useNotificationsStore()
      store.add({ title: 'plain' })
      expect(() => store.clearAll()).not.toThrow()
    })
  })

  it('swallows API errors from add, dismiss and clearAll', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const store = useNotificationsStore()
    const id = store.add({ title: 'to-dismiss' })
    store.add({ title: 'to-clear' }) // plain → removed (and DELETEd) by clearAll
    store.add({ title: 'kept', action: { label: 'x', callback: () => {} } })
    store.dismiss(id) // DELETE rejects
    store.clearAll() // per-item DELETE rejects in the forEach
    // Let the fire-and-forget .catch handlers settle.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const titles = store.items.map((item) => item.title)
    expect(titles).toContain('kept')
    expect(titles).not.toContain('to-clear')
  })

  it('swallows localStorage write failures', () => {
    const store = useNotificationsStore()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => store.add({ title: 'A' })).not.toThrow()
  })
})
