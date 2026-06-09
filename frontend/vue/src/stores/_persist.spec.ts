import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { usePersistedObject, usePersistedRef, usePersistedStringSet } from './_persist'

describe('_persist', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('usePersistedObject', () => {
    interface Prefs {
      open: boolean
      label: string
    }
    const defaults: Prefs = { open: false, label: 'x' }

    it('returns a copy of the defaults when storage is empty', () => {
      const state = usePersistedObject('k', defaults)
      expect(state.value).toEqual({ open: false, label: 'x' })
      // Must be a copy, not the defaults object itself.
      expect(state.value).not.toBe(defaults)
    })

    it('merges a stored partial over the defaults', () => {
      localStorage.setItem('k', JSON.stringify({ open: true }))
      const state = usePersistedObject('k', defaults)
      expect(state.value).toEqual({ open: true, label: 'x' })
    })

    it('falls back to defaults when the stored JSON is malformed', () => {
      localStorage.setItem('k', '{not valid json')
      const state = usePersistedObject('k', defaults)
      expect(state.value).toEqual(defaults)
    })

    it.each([
      ['null', 'null'],
      ['an array', '[1,2,3]'],
    ])('falls back to defaults when the stored value is %s', (_label, raw) => {
      localStorage.setItem('k', raw)
      const state = usePersistedObject('k', defaults)
      expect(state.value).toEqual(defaults)
    })

    it('applies a migrate function to the parsed value', () => {
      localStorage.setItem('k', JSON.stringify({ legacyOpen: true }))
      const migrate = vi.fn(() => ({ open: true }))
      const state = usePersistedObject('k', defaults, migrate)
      expect(migrate).toHaveBeenCalledOnce()
      expect(state.value).toEqual({ open: true, label: 'x' })
    })

    it('uses the parsed value when migrate returns null', () => {
      localStorage.setItem('k', JSON.stringify({ label: 'kept' }))
      const state = usePersistedObject('k', defaults, () => null)
      expect(state.value).toEqual({ open: false, label: 'kept' })
    })

    it('writes to storage synchronously on a deep mutation', () => {
      const state = usePersistedObject('k', defaults)
      state.value.open = true
      // flush:'sync' — no tick needed; the write already happened.
      expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ open: true, label: 'x' })
    })

    it('writes to storage on reassignment', () => {
      const state = usePersistedObject('k', defaults)
      state.value = { open: true, label: 'y' }
      expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ open: true, label: 'y' })
    })

    it('swallows write failures without throwing', () => {
      const state = usePersistedObject('k', defaults)
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })
      expect(() => {
        state.value = { open: true, label: 'z' }
      }).not.toThrow()
    })
  })

  describe('usePersistedRef', () => {
    it('returns the fallback when storage is empty', () => {
      const state = usePersistedRef('n', 7)
      expect(state.value).toBe(7)
    })

    it('reads a stored value', () => {
      localStorage.setItem('n', JSON.stringify(42))
      const state = usePersistedRef('n', 7)
      expect(state.value).toBe(42)
    })

    it('rejects a stored value that fails validation, using the fallback', () => {
      localStorage.setItem('tab', JSON.stringify('ghost'))
      const isKnownTab = (value: unknown): value is 'a' | 'b' => value === 'a' || value === 'b'
      const state = usePersistedRef<'a' | 'b'>('tab', 'a', isKnownTab)
      expect(state.value).toBe('a')
    })

    it('accepts a stored value that passes validation', () => {
      localStorage.setItem('tab', JSON.stringify('b'))
      const isKnownTab = (value: unknown): value is 'a' | 'b' => value === 'a' || value === 'b'
      const state = usePersistedRef<'a' | 'b'>('tab', 'a', isKnownTab)
      expect(state.value).toBe('b')
    })

    it('falls back when the stored JSON is malformed', () => {
      localStorage.setItem('n', 'NaN-ish garbage')
      const state = usePersistedRef('n', 7)
      expect(state.value).toBe(7)
    })

    it('persists changes synchronously', () => {
      const state = usePersistedRef<number>('n', 7)
      state.value = 99
      expect(JSON.parse(localStorage.getItem('n')!)).toBe(99)
    })
  })

  describe('usePersistedStringSet', () => {
    it('starts empty when storage is empty', () => {
      const state = usePersistedStringSet('chips')
      expect(state.value).toBeInstanceOf(Set)
      expect(state.value.size).toBe(0)
    })

    it('hydrates from a stored string array', () => {
      localStorage.setItem('chips', JSON.stringify(['one', 'two']))
      const state = usePersistedStringSet('chips')
      expect([...state.value]).toEqual(['one', 'two'])
    })

    it('filters out non-string entries', () => {
      localStorage.setItem('chips', JSON.stringify(['ok', 5, null, 'fine']))
      const state = usePersistedStringSet('chips')
      expect([...state.value]).toEqual(['ok', 'fine'])
    })

    it('starts empty when the stored value is not an array', () => {
      localStorage.setItem('chips', JSON.stringify({ not: 'an array' }))
      const state = usePersistedStringSet('chips')
      expect(state.value.size).toBe(0)
    })

    it('starts empty when the stored JSON is malformed', () => {
      localStorage.setItem('chips', '[broken')
      const state = usePersistedStringSet('chips')
      expect(state.value.size).toBe(0)
    })

    it('persists as a JSON array when reassigned', async () => {
      const state = usePersistedStringSet('chips')
      state.value = new Set(['added'])
      await nextTick()
      expect(JSON.parse(localStorage.getItem('chips')!)).toEqual(['added'])
    })
  })
})
