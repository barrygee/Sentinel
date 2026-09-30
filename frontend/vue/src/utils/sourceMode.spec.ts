import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  APP_MODE_STORAGE_KEY,
  SOURCE_MODE_LABELS,
  SOURCE_MODE_OPTIONS,
  SOURCE_MODE_SECTIONS,
  asSourceMode,
  readCachedSectionMode,
  resolveSectionMode,
  sectionModeStorageKey,
} from './sourceMode'

describe('sourceMode', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('offers exactly OFF GRID then ONLINE, labelled from the shared map', () => {
    expect(SOURCE_MODE_OPTIONS).toEqual([
      { value: 'offgrid', label: 'OFF GRID' },
      { value: 'online', label: 'ONLINE' },
    ])
    expect(SOURCE_MODE_LABELS).toEqual({ online: 'ONLINE', offgrid: 'OFF GRID' })
  })

  it('lists the sections that store their own mode — not Land', () => {
    expect([...SOURCE_MODE_SECTIONS]).toEqual(['air', 'space', 'sea'])
  })

  it('builds the per-section cache key', () => {
    expect(sectionModeStorageKey('sea')).toBe('sentinel_sea_sourceOverride')
  })

  describe('asSourceMode', () => {
    it.each(['online', 'offgrid'] as const)('accepts %s', (mode) => {
      expect(asSourceMode(mode)).toBe(mode)
    })

    it.each([['auto'], ['ONLINE'], [''], [null], [undefined], [1], [{}]])('rejects %j', (value) => {
      expect(asSourceMode(value)).toBeNull()
    })
  })

  describe('resolveSectionMode', () => {
    it("uses the section's own mode over the app mode", () => {
      expect(resolveSectionMode('offgrid', 'online')).toBe('offgrid')
      expect(resolveSectionMode('online', 'offgrid')).toBe('online')
    })

    it('falls back to the app mode when the section has none or a legacy auto', () => {
      expect(resolveSectionMode(null, 'offgrid')).toBe('offgrid')
      expect(resolveSectionMode('auto', 'offgrid')).toBe('offgrid')
    })

    it('falls back to online when neither is a valid mode', () => {
      expect(resolveSectionMode(undefined, 'auto')).toBe('online')
    })
  })

  describe('readCachedSectionMode', () => {
    it('reads the section and app modes from localStorage', () => {
      localStorage.setItem(sectionModeStorageKey('air'), 'offgrid')
      localStorage.setItem(APP_MODE_STORAGE_KEY, 'online')
      expect(readCachedSectionMode('air')).toBe('offgrid')
    })

    it('uses the cached app mode when the section has none', () => {
      localStorage.setItem(APP_MODE_STORAGE_KEY, 'offgrid')
      expect(readCachedSectionMode('sea')).toBe('offgrid')
    })

    it('returns online when localStorage is unavailable', () => {
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      expect(readCachedSectionMode('air')).toBe('online')
    })
  })
})
