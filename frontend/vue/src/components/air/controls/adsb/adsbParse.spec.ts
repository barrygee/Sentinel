import { describe, it, expect } from 'vitest'
import { parseAlt, isMilitary, parseAircraftList, type AdsbApiEntry } from './adsbParse'

describe('parseAlt', () => {
  it('treats the literal "ground" string as zero altitude', () => {
    expect(parseAlt('ground')).toBe(0)
  })

  it('treats an empty string as zero altitude', () => {
    expect(parseAlt('')).toBe(0)
  })

  it('treats null and undefined as zero altitude', () => {
    expect(parseAlt(null)).toBe(0)
    expect(parseAlt(undefined)).toBe(0)
  })

  it('returns a numeric altitude unchanged', () => {
    expect(parseAlt(35000)).toBe(35000)
  })

  it('parses a numeric string altitude', () => {
    expect(parseAlt('12500')).toBe(12500)
  })

  it('falls back to zero when a string cannot be parsed as a number', () => {
    expect(parseAlt('not-a-number')).toBe(0)
  })

  it('clamps negative altitudes to zero', () => {
    expect(parseAlt(-200)).toBe(0)
  })
})

describe('isMilitary', () => {
  it('classifies a LAAD ground/airfield entry as non-military regardless of flag', () => {
    expect(isMilitary('43c123', true, 'LAAD')).toBe(false)
  })

  it('honours an explicit military flag', () => {
    // 0x000001 is outside the military hex blocks, so only the flag can make it true.
    expect(isMilitary('000001', true, undefined)).toBe(true)
  })

  it('classifies a hex inside the 0x43C000–0x43FFFF block as military', () => {
    expect(isMilitary('43c000', undefined, undefined)).toBe(true)
    expect(isMilitary('43ffff', false, undefined)).toBe(true)
  })

  it('classifies a hex inside the 0xAE0000–0xAFFFFF block as military', () => {
    expect(isMilitary('ae0000', undefined, undefined)).toBe(true)
    expect(isMilitary('afffff', undefined, undefined)).toBe(true)
  })

  it('classifies a civilian hex with no flag as non-military', () => {
    expect(isMilitary('400000', false, 'A320')).toBe(false)
  })
})

describe('parseAircraftList', () => {
  const baseEntry = (overrides: Partial<AdsbApiEntry> = {}): AdsbApiEntry => ({
    hex: 'abc123',
    lat: 51.5,
    lon: -0.1,
    ...overrides,
  })

  it('maps a complete entry to a normalised aircraft, trimming the flight number', () => {
    const result = parseAircraftList([
      baseEntry({ flight: ' BAW123 ', r: 'G-ABCD', gs: 420, alt_baro: 36000, military: false }),
    ])
    expect(result).toEqual([
      {
        hex: 'abc123',
        lat: 51.5,
        lon: -0.1,
        alt: 36000,
        gs: 420,
        flight: 'BAW123',
        r: 'G-ABCD',
        military: false,
      },
    ])
  })

  it('skips entries missing latitude or longitude', () => {
    expect(parseAircraftList([{ hex: 'abc123', lat: 51.5 }])).toEqual([])
    expect(parseAircraftList([{ hex: 'abc123', lon: -0.1 }])).toEqual([])
  })

  it('drops ground-noise categories A0, B0 and C0 case-insensitively', () => {
    expect(parseAircraftList([baseEntry({ category: 'a0' })])).toEqual([])
    expect(parseAircraftList([baseEntry({ category: 'B0' })])).toEqual([])
    expect(parseAircraftList([baseEntry({ category: 'c0' })])).toEqual([])
  })

  it('skips entries with no hex identifier', () => {
    expect(parseAircraftList([{ hex: '', lat: 51.5, lon: -0.1 }])).toEqual([])
  })

  it('defaults missing ground speed, flight, registration and altitude fields', () => {
    const [aircraft] = parseAircraftList([{ hex: 'abc123', lat: 1, lon: 2 }])
    expect(aircraft).toMatchObject({ gs: 0, flight: '', r: '', alt: 0 })
  })

  it('derives the military flag from the hex block when no explicit flag is given', () => {
    const [aircraft] = parseAircraftList([{ hex: '43c000', lat: 1, lon: 2 }])
    expect(aircraft!.military).toBe(true)
  })
})
