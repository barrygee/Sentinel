import { describe, it, expect } from 'vitest'
import { onlineKey, offgridKey } from './domainKeys'

describe('domainKeys', () => {
  it('returns the air-specific online key and the generic fallback', () => {
    expect(onlineKey('air')).toBe('onlineDataSourceURL')
    expect(onlineKey('space')).toBe('onlineUrl')
  })

  it('returns the air-specific offgrid key and the generic fallback', () => {
    expect(offgridKey('air')).toBe('offgridDataSourceURL')
    expect(offgridKey('sdr')).toBe('offgridSource')
  })
})
