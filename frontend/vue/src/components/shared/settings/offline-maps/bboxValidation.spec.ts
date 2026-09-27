import { describe, it, expect } from 'vitest'
import { computeBboxFieldErrors, isBboxValid } from './bboxValidation'

const VALID = { west: -3.2, south: 54.3, east: -2.9, north: 54.6 }

describe('computeBboxFieldErrors', () => {
  it('reports no errors for a valid, non-degenerate bbox', () => {
    expect(computeBboxFieldErrors(VALID)).toEqual({
      north: null,
      south: null,
      east: null,
      west: null,
    })
  })

  it('flags a north value past the Web Mercator limit', () => {
    const errors = computeBboxFieldErrors({ ...VALID, north: 85.06 })
    expect(errors.north).toMatch(/-85.05113 and 85.05113/)
  })

  it('flags a south value past the negative Web Mercator limit', () => {
    const errors = computeBboxFieldErrors({ ...VALID, south: -85.06 })
    expect(errors.south).toMatch(/-85.05113 and 85.05113/)
  })

  it('flags a non-finite north value', () => {
    const errors = computeBboxFieldErrors({ ...VALID, north: NaN })
    expect(errors.north).not.toBeNull()
  })

  it('flags an east value past 180', () => {
    const errors = computeBboxFieldErrors({ ...VALID, east: 181 })
    expect(errors.east).toMatch(/-180 and 180/)
  })

  it('flags a west value past -180', () => {
    const errors = computeBboxFieldErrors({ ...VALID, west: -181 })
    expect(errors.west).toMatch(/-180 and 180/)
  })

  it('flags north<=south as a degenerate box, blamed on north', () => {
    const errors = computeBboxFieldErrors({ west: -1, south: 10, east: 1, north: 10 })
    expect(errors.north).toBe('North must be greater than South.')
    expect(errors.south).toBeNull()
  })

  it('flags east<=west as a degenerate box, blamed on east', () => {
    const errors = computeBboxFieldErrors({ west: 1, south: -1, east: 1, north: 1 })
    expect(errors.east).toBe('East must be greater than West.')
    expect(errors.west).toBeNull()
  })

  it('does not pile a north/south ordering error on top of an already out-of-range latitude', () => {
    // North is itself invalid (out of range); the ordering check must not
    // additionally overwrite it or otherwise fire once the range error exists.
    const errors = computeBboxFieldErrors({ west: -1, south: 90, east: 1, north: 85.06 })
    expect(errors.south).not.toBeNull()
    // South itself already failed range validation, so the north>south
    // ordering check (which only runs when both are null) never overwrites it.
    expect(errors.south).toMatch(/-85.05113 and 85.05113/)
  })
})

describe('isBboxValid', () => {
  it('is true for a valid, non-degenerate bbox', () => {
    expect(isBboxValid(VALID)).toBe(true)
  })

  it('is false when any edge is out of range', () => {
    expect(isBboxValid({ ...VALID, east: 200 })).toBe(false)
  })

  it('is false for a degenerate (zero-area) bbox', () => {
    expect(isBboxValid({ west: 0, south: 0, east: 0, north: 0 })).toBe(false)
  })
})
