import { describe, it, expect } from 'vitest'
import {
  formatBwHz,
  parseFreqMhz,
  defaultBwHz,
  isTunableHz,
  snapToValidSampleRate,
  SDR_MAX_TUNE_HZ,
  SDR_MIN_TUNE_HZ,
} from './sdrPanelUtils'

describe('formatBwHz', () => {
  it('formats values at or above 1 MHz with two decimals', () => {
    expect(formatBwHz(1_000_000)).toBe('1.00 MHz')
    expect(formatBwHz(2_048_000)).toBe('2.05 MHz')
  })

  it('formats values from 1 kHz up to (but not including) 1 MHz in rounded kHz', () => {
    expect(formatBwHz(1_000)).toBe('1 kHz')
    expect(formatBwHz(12_500)).toBe('13 kHz') // rounds to nearest kHz
    expect(formatBwHz(999_999)).toBe('1000 kHz')
  })

  it('formats sub-kHz values in raw Hz', () => {
    expect(formatBwHz(999)).toBe('999 Hz')
    expect(formatBwHz(0)).toBe('0 Hz')
  })
})

describe('parseFreqMhz', () => {
  it('returns null for non-numeric or non-positive input', () => {
    expect(parseFreqMhz('')).toBeNull() // → NaN
    expect(parseFreqMhz('abc')).toBeNull() // strips to '' → NaN
    expect(parseFreqMhz('0')).toBeNull() // parses to 0 → not > 0
    expect(parseFreqMhz('...')).toBeNull() // strips to '...' → parseFloat NaN
  })

  it('treats values at or below 30000 as MHz and converts to Hz', () => {
    expect(parseFreqMhz('100.5')).toBe(100_500_000)
    expect(parseFreqMhz('2200')).toBe(2_200_000_000)
  })

  it('treats values above 30000 as raw Hz', () => {
    expect(parseFreqMhz('500000')).toBe(500_000)
    expect(parseFreqMhz('145800000')).toBe(145_800_000)
  })

  it('refuses a frequency no tuner can reach', () => {
    expect(parseFreqMhz('7812')).toBeNull() // 7.812 GHz — the value that wedged a dongle
    expect(parseFreqMhz('2200.000001')).toBeNull()
    expect(parseFreqMhz('30000')).toBeNull() // 30 GHz
    expect(parseFreqMhz('30001')).toBeNull() // 30 kHz as raw Hz: below the floor
    expect(parseFreqMhz('0.4999')).toBeNull()
  })

  it('strips surrounding units and symbols before parsing', () => {
    expect(parseFreqMhz('100.5 MHz')).toBe(100_500_000)
    expect(parseFreqMhz('  88.1  ')).toBe(88_100_000)
  })
})

describe('defaultBwHz', () => {
  it('returns the wide-FM broadcast bandwidth for WFM', () => {
    expect(defaultBwHz('WFM')).toBe(500_000)
  })

  it('returns the per-mode bandwidth for the narrow modes', () => {
    expect(defaultBwHz('NFM')).toBe(12_500)
    expect(defaultBwHz('AM')).toBe(10_000)
    expect(defaultBwHz('USB')).toBe(3_000)
    expect(defaultBwHz('LSB')).toBe(3_000)
    expect(defaultBwHz('CW')).toBe(500)
  })

  it('falls back to 10 kHz for an unknown mode', () => {
    expect(defaultBwHz('UNKNOWN')).toBe(10_000)
    expect(defaultBwHz('')).toBe(10_000)
  })
})

describe('snapToValidSampleRate', () => {
  it('floors low rates up to 1.024 MHz', () => {
    expect(snapToValidSampleRate(0)).toBe(1_024_000)
    expect(snapToValidSampleRate(250_000)).toBe(1_024_000)
    expect(snapToValidSampleRate(1_474_000)).toBe(1_024_000) // boundary inclusive
  })

  it('snaps up to 1.536 MHz', () => {
    expect(snapToValidSampleRate(1_474_001)).toBe(1_536_000)
    expect(snapToValidSampleRate(1_761_000)).toBe(1_536_000) // boundary inclusive
  })

  it('snaps up to 1.792 MHz', () => {
    expect(snapToValidSampleRate(1_761_001)).toBe(1_792_000)
    expect(snapToValidSampleRate(1_921_000)).toBe(1_792_000) // boundary inclusive
  })

  it('snaps anything above 1.921 MHz to 2.048 MHz', () => {
    expect(snapToValidSampleRate(1_921_001)).toBe(2_048_000)
    expect(snapToValidSampleRate(5_000_000)).toBe(2_048_000)
  })
})

describe('isTunableHz', () => {
  it.each([SDR_MIN_TUNE_HZ, SDR_MAX_TUNE_HZ, 145_500_000])('accepts %d Hz', (hz) => {
    expect(isTunableHz(hz)).toBe(true)
  })

  it.each([
    SDR_MIN_TUNE_HZ - 1,
    SDR_MAX_TUNE_HZ + 1,
    7_812_000_000,
    0,
    -1,
    145_500_000.5,
    NaN,
    '145500000',
    null,
  ])('refuses %s', (hz) => {
    expect(isTunableHz(hz)).toBe(false)
  })

  it('matches the backend range (radio_hub/services/sdr.py MIN_TUNE_HZ / MAX_TUNE_HZ)', () => {
    expect([SDR_MIN_TUNE_HZ, SDR_MAX_TUNE_HZ]).toEqual([500_000, 2_200_000_000])
  })
})
