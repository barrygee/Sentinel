import { describe, it, expect, vi, afterEach } from 'vitest'
import { countryFromMmsi } from './mmsiCountry'

describe('countryFromMmsi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to the bare code when the runtime has no name for it', () => {
    vi.spyOn(Intl.DisplayNames.prototype, 'of').mockReturnValue(undefined)
    expect(countryFromMmsi('235052783')).toEqual({ code: 'GB', name: 'GB' })
  })

  it('resolves a ship MMSI from its leading MID', () => {
    expect(countryFromMmsi('235052783')).toEqual({ code: 'GB', name: 'United Kingdom' })
    expect(countryFromMmsi('246566000')).toMatchObject({ code: 'NL' })
    expect(countryFromMmsi('374275000')).toMatchObject({ code: 'PA' })
  })

  it('resolves the MID behind every other station-kind prefix', () => {
    expect(countryFromMmsi('023500001')).toMatchObject({ code: 'GB' }) // group ship station
    expect(countryFromMmsi('002320001')).toMatchObject({ code: 'GB' }) // coast station
    expect(countryFromMmsi('111232001')).toMatchObject({ code: 'GB' }) // SAR aircraft
    expect(countryFromMmsi('823200001')).toMatchObject({ code: 'GB' }) // handheld VHF
    expect(countryFromMmsi('982320001')).toMatchObject({ code: 'GB' }) // craft on a parent ship
    expect(countryFromMmsi('992320001')).toMatchObject({ code: 'GB' }) // aid to navigation
  })

  it('returns null for a malformed MMSI', () => {
    expect(countryFromMmsi('')).toBeNull()
    expect(countryFromMmsi('12345678')).toBeNull()
    expect(countryFromMmsi('1234567890')).toBeNull()
    expect(countryFromMmsi('23505278x')).toBeNull()
  })

  it('returns null for an unallocated MID', () => {
    expect(countryFromMmsi('100000000')).toBeNull()
    expect(countryFromMmsi('999999999')).toBeNull() // AtoN prefix over an unallocated 999
  })

  it('names every MID with a real region name, never the bare code', () => {
    // A spot check across the table's regions; a typo in a code would fall
    // back to the code itself.
    for (const [mmsi, code] of [
      ['201000000', 'AL'],
      ['306000000', 'CW'],
      ['477000000', 'HK'],
      ['501000000', 'TF'],
      ['608000000', 'SH'],
      ['775000000', 'VE'],
    ] as const) {
      const country = countryFromMmsi(mmsi)
      expect(country?.code).toBe(code)
      expect(country?.name).not.toBe(code)
    }
  })
})
