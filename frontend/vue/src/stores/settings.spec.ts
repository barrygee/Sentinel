import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from './settings'

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('has the expected initial state', () => {
    const store = useSettingsStore()
    expect(store.open).toBe(false)
    expect(store.activeSection).toBeNull()
    expect(store.allSettings).toEqual({})
  })

  it('openPanel opens the panel and sets the active section when given one', () => {
    const store = useSettingsStore()
    store.openPanel('air')
    expect(store.open).toBe(true)
    expect(store.activeSection).toBe('air')
  })

  it('openPanel without a section leaves the active section unchanged', () => {
    const store = useSettingsStore()
    store.openPanel('air')
    store.openPanel()
    expect(store.open).toBe(true)
    expect(store.activeSection).toBe('air')
  })

  it('closePanel closes the panel and dispatches a close event', () => {
    const store = useSettingsStore()
    store.openPanel()
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent')
    store.closePanel()
    expect(store.open).toBe(false)
    expect(dispatchSpy).toHaveBeenCalledOnce()
    expect((dispatchSpy.mock.calls[0]![0] as Event).type).toBe('settings-panel-closed')
  })

  it('togglePanel flips the open state', () => {
    const store = useSettingsStore()
    store.togglePanel()
    expect(store.open).toBe(true)
    store.togglePanel()
    expect(store.open).toBe(false)
  })

  it('setSetting creates the namespace when absent and stores the value', () => {
    const store = useSettingsStore()
    store.setSetting('air', 'showLabels', true)
    expect(store.allSettings).toEqual({ air: { showLabels: true } })
  })

  it('setSetting reuses an existing namespace', () => {
    const store = useSettingsStore()
    store.setSetting('air', 'a', 1)
    store.setSetting('air', 'b', 2)
    expect(store.allSettings.air).toEqual({ a: 1, b: 2 })
  })

  it('getSetting returns the stored value or the fallback', () => {
    const store = useSettingsStore()
    store.setSetting('air', 'count', 5)
    expect(store.getSetting('air', 'count', 0)).toBe(5)
    expect(store.getSetting('air', 'missing', 9)).toBe(9)
    expect(store.getSetting('absent', 'x', 'fallback')).toBe('fallback')
  })

  describe('loadAll', () => {
    it('replaces allSettings on a successful response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ air: { x: 1 } }) }),
      )
      const store = useSettingsStore()
      await store.loadAll()
      expect(store.allSettings).toEqual({ air: { x: 1 } })
    })

    it('leaves allSettings unchanged when the response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
      const store = useSettingsStore()
      await store.loadAll()
      expect(store.allSettings).toEqual({})
    })

    it('swallows fetch errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const store = useSettingsStore()
      await expect(store.loadAll()).resolves.toBeUndefined()
      expect(store.allSettings).toEqual({})
    })
  })

  describe('put', () => {
    it('updates local state and PUTs the value to the API', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      const store = useSettingsStore()
      await store.put('air', 'showLabels', false)
      expect(store.getSetting('air', 'showLabels', true)).toBe(false)
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/settings/air/showLabels',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ value: false }) }),
      )
    })

    it('still updates local state when the request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const store = useSettingsStore()
      await store.put('air', 'showLabels', false)
      expect(store.getSetting('air', 'showLabels', true)).toBe(false)
    })
  })
})
