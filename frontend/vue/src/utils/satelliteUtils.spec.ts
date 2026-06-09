import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  SATELLITE_CATEGORY_SHORT_LABELS,
  SATELLITE_CATEGORY_ORDER,
  SATELLITE_CATEGORY_DISPLAY_NAMES,
  SATELLITE_CATEGORY_FULL_LABELS,
  SATELLITE_CATEGORY_SECTION_LABELS,
  formatPassCountdown,
  formatPassDuration,
  formatPassTime,
  formatPassDate,
  formatTleAge,
} from './satelliteUtils'

describe('satellite category tables', () => {
  it('expose consistent labels for each ordered category', () => {
    expect(SATELLITE_CATEGORY_ORDER).toContain('space_station')
    for (const category of SATELLITE_CATEGORY_ORDER) {
      expect(SATELLITE_CATEGORY_SHORT_LABELS[category]).toBeTruthy()
      expect(SATELLITE_CATEGORY_DISPLAY_NAMES[category]).toBeTruthy()
      expect(SATELLITE_CATEGORY_FULL_LABELS[category]).toBeTruthy()
      expect(SATELLITE_CATEGORY_SECTION_LABELS[category]).toBeTruthy()
    }
  })
})

describe('formatPassCountdown', () => {
  it('formats hours, minutes and seconds', () => {
    expect(formatPassCountdown((3 * 3600 + 4 * 60 + 5) * 1000)).toBe('IN 3h 4m 5s')
  })
  it('omits hours when under an hour', () => {
    expect(formatPassCountdown((4 * 60 + 5) * 1000)).toBe('IN 4m 5s')
  })
  it('shows only seconds when under a minute', () => {
    expect(formatPassCountdown(5000)).toBe('IN 5s')
  })
  it('clamps negative values to zero seconds', () => {
    expect(formatPassCountdown(-1000)).toBe('IN 0s')
  })
})

describe('formatPassDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatPassDuration(125)).toBe('2m 5s')
    expect(formatPassDuration(45)).toBe('0m 45s')
  })
})

describe('formatPassTime / formatPassDate', () => {
  it('formats a UTC string as a local HH:MM time', () => {
    expect(formatPassTime('2026-06-09T12:34:00Z')).toMatch(/\d{1,2}:\d{2}/)
  })
  it('formats a UTC string as a short month/day date', () => {
    // Locale ordering varies (e.g. "Jun 9" vs "9 Jun"); assert both parts exist.
    const result = formatPassDate('2026-06-09T12:34:00Z')
    expect(result).toMatch(/[A-Za-z]{3}/) // month abbreviation
    expect(result).toMatch(/\d{1,2}/) // day of month
  })
})

describe('formatTleAge', () => {
  const now = 1_000_000_000_000
  afterEach(() => vi.restoreAllMocks())

  it.each([
    [30 * 1000, '30s ago'],
    [5 * 60 * 1000, '5m ago'],
    [3 * 3600 * 1000, '3h ago'],
    [2 * 86400 * 1000, '2d ago'],
  ])('formats an age of %i ms as %s', (ageMs, expected) => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(formatTleAge(now - ageMs)).toBe(expected)
  })
})
