import { describe, it, expect } from 'vitest'
import { formatHz, formatStatus, hasRadioInfo, splitNotes } from './satRadioInfo'

describe('formatHz', () => {
  it('auto-scales to GHz, MHz, kHz and Hz with 3 decimals', () => {
    expect(formatHz(2_400_000_000)).toBe('2.400 GHz')
    expect(formatHz(145_800_000)).toBe('145.800 MHz')
    expect(formatHz(437_500)).toBe('437.500 kHz')
    expect(formatHz(800)).toBe('800 Hz')
  })

  it('returns an em dash for null/undefined', () => {
    expect(formatHz(null)).toBe('—')
    expect(formatHz(undefined)).toBe('—')
  })
})

describe('hasRadioInfo', () => {
  it('is true when any radio field is set', () => {
    expect(hasRadioInfo({ uplink_hz: 145_800_000 })).toBe(true)
    expect(hasRadioInfo({ downlink_hz: 437_800_000 })).toBe(true)
    expect(hasRadioInfo({ beacon_hz: 145_825_000 })).toBe(true)
    expect(hasRadioInfo({ transponder_type: 'Linear' })).toBe(true)
    expect(hasRadioInfo({ packet_info: 'APRS 1200bd' })).toBe(true)
    expect(hasRadioInfo({ radio_status: 'active' })).toBe(true)
    expect(hasRadioInfo({ radio_notes: 'Weekends only' })).toBe(true)
  })

  it('is false when no radio field is set', () => {
    expect(hasRadioInfo({})).toBe(false)
    expect(hasRadioInfo({ uplink_hz: null, radio_notes: null })).toBe(false)
  })
})

describe('splitNotes', () => {
  it('splits on semicolons, trimming and dropping empty segments', () => {
    expect(splitNotes('APRS 1200bd ; digipeater ;; SSTV ')).toEqual([
      'APRS 1200bd',
      'digipeater',
      'SSTV',
    ])
  })

  it('returns an empty list for empty/nullish input', () => {
    expect(splitNotes('')).toEqual([])
    expect(splitNotes(null)).toEqual([])
    expect(splitNotes(undefined)).toEqual([])
  })
})

describe('formatStatus', () => {
  it('normalises to sentence case', () => {
    expect(formatStatus('ACTIVE')).toBe('Active')
    expect(formatStatus('inactive')).toBe('Inactive')
  })

  it('returns an empty string for empty/nullish input', () => {
    expect(formatStatus('')).toBe('')
    expect(formatStatus(null)).toBe('')
    expect(formatStatus(undefined)).toBe('')
  })
})
