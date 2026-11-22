import { describe, it, expect } from 'vitest'
import {
  clampRetentionDays,
  DEFAULT_RETENTION_DAYS,
  isPlaybackSection,
  PLAYBACK_RATES,
  PLAYBACK_SECTIONS,
} from './playbackSections'

describe('playbackSections', () => {
  it('lists the four recording sections and the four speeds', () => {
    expect(PLAYBACK_SECTIONS).toEqual(['air', 'sea', 'land', 'space'])
    expect(PLAYBACK_RATES).toEqual([1, 10, 60, 300])
  })

  it.each([
    [1, 1],
    [7, 7],
    [4.8, 4],
    [0, 1],
    [-3, 1],
    [9, 7],
  ])('clamps %d days to %d', (value, expected) => {
    expect(clampRetentionDays(value)).toBe(expected)
  })

  it.each([undefined, null, '5', Number.NaN, Number.POSITIVE_INFINITY, {}])(
    'treats %j as the default',
    (value) => {
      expect(clampRetentionDays(value)).toBe(DEFAULT_RETENTION_DAYS)
    },
  )

  it('recognises only the recording sections', () => {
    expect(isPlaybackSection('sea')).toBe(true)
    expect(isPlaybackSection('sdr')).toBe(false)
    expect(isPlaybackSection('')).toBe(false)
  })
})
