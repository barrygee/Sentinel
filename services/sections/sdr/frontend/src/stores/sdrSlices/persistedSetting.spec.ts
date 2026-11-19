import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { getNamespaceMock } = vi.hoisted(() => ({ getNamespaceMock: vi.fn() }))
vi.mock('@sentinel/shell-api/services/settingsApi', () => ({ getNamespace: getNamespaceMock }))

import { usePersistedFlag, usePersistedWholeNumber } from './persistedSetting'

function throwingStorage(method: 'getItem' | 'setItem') {
  vi.spyOn(localStorage, method).mockImplementation(() => {
    throw new Error('storage blocked')
  })
}

describe('persistedSetting', () => {
  beforeEach(() => {
    localStorage.clear()
    getNamespaceMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('usePersistedFlag', () => {
    describe('reading the cache', () => {
      it.each([
        { cached: null, expected: true },
        { cached: '1', expected: true },
        { cached: 'garbage', expected: true },
        { cached: '0', expected: false },
      ])('a default-ON flag reads $cached as $expected', ({ cached, expected }) => {
        if (cached !== null) localStorage.setItem('flagKey', cached)
        expect(usePersistedFlag({ storageKey: 'flagKey', defaultValue: true }).value.value).toBe(
          expected,
        )
      })

      it.each([
        { cached: null, expected: false },
        { cached: '0', expected: false },
        { cached: 'garbage', expected: false },
        { cached: '1', expected: true },
      ])('a default-OFF flag reads $cached as $expected', ({ cached, expected }) => {
        if (cached !== null) localStorage.setItem('flagKey', cached)
        expect(usePersistedFlag({ storageKey: 'flagKey', defaultValue: false }).value.value).toBe(
          expected,
        )
      })

      it.each([true, false])('falls back to the default %s when the cache cannot be read', (on) => {
        localStorage.setItem('flagKey', on ? '0' : '1')
        throwingStorage('getItem')
        expect(usePersistedFlag({ storageKey: 'flagKey', defaultValue: on }).value.value).toBe(on)
      })
    })

    describe('set', () => {
      it('updates the value and caches it as 1 / 0', () => {
        const flag = usePersistedFlag({ storageKey: 'flagKey', defaultValue: true })
        flag.set(false)
        expect(flag.value.value).toBe(false)
        expect(localStorage.getItem('flagKey')).toBe('0')
        flag.set(true)
        expect(flag.value.value).toBe(true)
        expect(localStorage.getItem('flagKey')).toBe('1')
      })

      it('still updates the value and runs afterSet when the cache write fails', () => {
        const afterSet = vi.fn()
        const flag = usePersistedFlag({ storageKey: 'flagKey', defaultValue: true, afterSet })
        throwingStorage('setItem')
        expect(() => flag.set(false)).not.toThrow()
        expect(flag.value.value).toBe(false)
        expect(afterSet).toHaveBeenCalledWith(false)
      })

      it('runs afterSet after the value is written', () => {
        let valueSeenByAfterSet: boolean | undefined
        const flag = usePersistedFlag({
          storageKey: 'flagKey',
          defaultValue: true,
          afterSet: () => {
            valueSeenByAfterSet = flag.value.value
          },
        })
        flag.set(false)
        expect(valueSeenByAfterSet).toBe(false)
      })
    })

    describe('hydrateFromDb', () => {
      const makeFlag = (afterSet = vi.fn()) => ({
        afterSet,
        flag: usePersistedFlag({
          storageKey: 'flagKey',
          defaultValue: true,
          settingKey: 'flagSetting',
          afterSet,
        }),
      })

      it('reads the sdr namespace and adopts a different stored boolean', async () => {
        getNamespaceMock.mockResolvedValue({ flagSetting: false })
        const { flag, afterSet } = makeFlag()
        await flag.hydrateFromDb()
        expect(getNamespaceMock).toHaveBeenCalledWith('sdr')
        expect(flag.value.value).toBe(false)
        expect(localStorage.getItem('flagKey')).toBe('0')
        expect(afterSet).toHaveBeenCalledWith(false)
      })

      it('does not set again when the stored value already matches', async () => {
        getNamespaceMock.mockResolvedValue({ flagSetting: true })
        const { flag, afterSet } = makeFlag()
        await flag.hydrateFromDb()
        expect(afterSet).not.toHaveBeenCalled()
        expect(localStorage.getItem('flagKey')).toBeNull()
      })

      it.each([
        { label: 'a missing namespace', namespace: null },
        { label: 'a missing key', namespace: {} },
        { label: 'a non-boolean value', namespace: { flagSetting: 'false' } },
      ])('ignores $label', async ({ namespace }) => {
        getNamespaceMock.mockResolvedValue(namespace)
        const { flag, afterSet } = makeFlag()
        await flag.hydrateFromDb()
        expect(flag.value.value).toBe(true)
        expect(afterSet).not.toHaveBeenCalled()
      })

      it('never reads the database for a flag without a setting key', async () => {
        const flag = usePersistedFlag({ storageKey: 'flagKey', defaultValue: false })
        await flag.hydrateFromDb()
        expect(getNamespaceMock).not.toHaveBeenCalled()
        expect(flag.value.value).toBe(false)
      })
    })
  })

  describe('usePersistedWholeNumber', () => {
    const cachedOptions = {
      storageKey: 'numberKey',
      settingKey: 'numberSetting',
      minimum: 1,
      defaultValue: 5,
    }

    describe('reading the cache', () => {
      it.each([
        { cached: null, expected: 5 },
        { cached: '12', expected: 12 },
        { cached: '1', expected: 1 },
        { cached: '0', expected: 5 },
        { cached: '-3', expected: 5 },
        { cached: 'abc', expected: 5 },
        { cached: '7.9', expected: 7 },
      ])('reads $cached as $expected', ({ cached, expected }) => {
        if (cached !== null) localStorage.setItem('numberKey', cached)
        expect(usePersistedWholeNumber(cachedOptions).value.value).toBe(expected)
      })

      it('falls back to the default when the cache cannot be read', () => {
        localStorage.setItem('numberKey', '9')
        throwingStorage('getItem')
        expect(usePersistedWholeNumber(cachedOptions).value.value).toBe(5)
      })

      it('starts at the default and never touches storage without a storage key', () => {
        const getItem = vi.spyOn(localStorage, 'getItem')
        const setting = usePersistedWholeNumber({ ...cachedOptions, storageKey: null })
        expect(setting.value.value).toBe(5)
        expect(getItem).not.toHaveBeenCalled()
      })
    })

    describe('set', () => {
      it.each([
        { next: 30, expected: 30 },
        { next: 1, expected: 1 },
        { next: 2.9, expected: 2 },
        { next: 0.5, expected: 5 },
        { next: 0, expected: 5 },
        { next: -4, expected: 5 },
        { next: Number.NaN, expected: 5 },
        { next: Number.POSITIVE_INFINITY, expected: 5 },
      ])('sets $next as $expected and caches it', ({ next, expected }) => {
        const setting = usePersistedWholeNumber(cachedOptions)
        setting.set(next)
        expect(setting.value.value).toBe(expected)
        expect(localStorage.getItem('numberKey')).toBe(String(expected))
      })

      it('keeps the value when the cache write fails', () => {
        const setting = usePersistedWholeNumber(cachedOptions)
        throwingStorage('setItem')
        expect(() => setting.set(8)).not.toThrow()
        expect(setting.value.value).toBe(8)
      })

      it('accepts zero when the minimum is zero', () => {
        const setting = usePersistedWholeNumber({ ...cachedOptions, minimum: 0, defaultValue: 3 })
        setting.set(0)
        expect(setting.value.value).toBe(0)
      })

      it('writes nothing to storage without a storage key', () => {
        const setItem = vi.spyOn(localStorage, 'setItem')
        const setting = usePersistedWholeNumber({ ...cachedOptions, storageKey: null })
        setting.set(9)
        expect(setting.value.value).toBe(9)
        expect(setItem).not.toHaveBeenCalled()
      })
    })

    describe('hydrateFromDb', () => {
      it('reads the sdr namespace and adopts a different valid number', async () => {
        getNamespaceMock.mockResolvedValue({ numberSetting: 20 })
        const setting = usePersistedWholeNumber(cachedOptions)
        await setting.hydrateFromDb()
        expect(getNamespaceMock).toHaveBeenCalledWith('sdr')
        expect(setting.value.value).toBe(20)
        expect(localStorage.getItem('numberKey')).toBe('20')
      })

      it('adopts a stored value equal to the minimum', async () => {
        getNamespaceMock.mockResolvedValue({ numberSetting: 1 })
        const setting = usePersistedWholeNumber(cachedOptions)
        await setting.hydrateFromDb()
        expect(setting.value.value).toBe(1)
      })

      it('does not write again when the stored value already matches', async () => {
        getNamespaceMock.mockResolvedValue({ numberSetting: 5 })
        const setting = usePersistedWholeNumber(cachedOptions)
        await setting.hydrateFromDb()
        expect(localStorage.getItem('numberKey')).toBeNull()
      })

      it.each([
        { label: 'a missing namespace', namespace: null },
        { label: 'a missing key', namespace: {} },
        { label: 'a non-number', namespace: { numberSetting: '20' } },
        { label: 'a value below the minimum', namespace: { numberSetting: 0 } },
      ])('ignores $label', async ({ namespace }) => {
        localStorage.setItem('numberKey', '7')
        getNamespaceMock.mockResolvedValue(namespace)
        const setting = usePersistedWholeNumber(cachedOptions)
        await setting.hydrateFromDb()
        expect(setting.value.value).toBe(7)
        expect(localStorage.getItem('numberKey')).toBe('7')
      })
    })
  })
})
