import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLandStore } from './stores/land'
import { hydrateLandFromSettings } from './landSettingsHydration'

// Land's boot hydration (moved out of main.ts): the APRS station label fields.
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  fetchSpy = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('hydrateLandFromSettings', () => {
  it('merges the stored label fields over the current ones', () => {
    const landStore = useLandStore()
    const before = { ...landStore.aprsLabelFields }

    hydrateLandFromSettings({ land: { labelDataPoints: { comment: true } } })

    expect(landStore.aprsLabelFields).toEqual({ ...before, comment: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', {}],
    ['not an object', { labelDataPoints: 3 }],
    ['an array', { labelDataPoints: ['comment'] }],
  ])(
    "seeds this browser's fields into the settings when the stored ones are %s",
    (_label, land) => {
      const landStore = useLandStore()

      hydrateLandFromSettings({ land })

      expect(fetchSpy).toHaveBeenCalledExactlyOnceWith('/api/settings/land/labelDataPoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: landStore.aprsLabelFields }),
      })
    },
  )

  it('swallows a failed seed write', async () => {
    fetchSpy.mockRejectedValue(new Error('offline'))
    expect(() => hydrateLandFromSettings({})).not.toThrow()
    await Promise.resolve()
  })
})
