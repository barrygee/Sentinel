import { describe, it, expect } from 'vitest'
import { isValidLatLon } from './locationUtils'

describe('isValidLatLon', () => {
  it('accepts coordinates within bounds', () => {
    expect(isValidLatLon(51.5, -0.12)).toBe(true)
    expect(isValidLatLon(0, 0)).toBe(true)
  })

  it('accepts the exact boundary values', () => {
    expect(isValidLatLon(90, 180)).toBe(true)
    expect(isValidLatLon(-90, -180)).toBe(true)
  })

  it('rejects out-of-range latitude', () => {
    expect(isValidLatLon(90.1, 0)).toBe(false)
    expect(isValidLatLon(-90.1, 0)).toBe(false)
  })

  it('rejects out-of-range longitude', () => {
    expect(isValidLatLon(0, 180.1)).toBe(false)
    expect(isValidLatLon(0, -180.1)).toBe(false)
  })

  it('rejects NaN latitude or longitude', () => {
    expect(isValidLatLon(Number.NaN, 0)).toBe(false)
    expect(isValidLatLon(0, Number.NaN)).toBe(false)
  })
})
