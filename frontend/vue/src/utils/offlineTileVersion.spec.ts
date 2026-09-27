import { describe, it, expect } from 'vitest'
import { withTierVersion } from './offlineTileVersion'

describe('withTierVersion', () => {
  it('returns the template unchanged when tiersVersion is null', () => {
    expect(withTierVersion('/api/offline-map/basemap/{z}/{x}/{y}', null)).toBe(
      '/api/offline-map/basemap/{z}/{x}/{y}',
    )
  })

  it('returns the template unchanged when tiersVersion is the empty string', () => {
    expect(withTierVersion('/api/offline-map/basemap/{z}/{x}/{y}', '')).toBe(
      '/api/offline-map/basemap/{z}/{x}/{y}',
    )
  })

  it('appends ?v=<version> when the template has no existing query string', () => {
    expect(withTierVersion('/api/offline-map/basemap/{z}/{x}/{y}', 'abc123')).toBe(
      '/api/offline-map/basemap/{z}/{x}/{y}?v=abc123',
    )
  })

  it('appends &v=<version> when the template already has a query string', () => {
    expect(withTierVersion('/api/offline-map/basemap/{z}/{x}/{y}?foo=bar', 'abc123')).toBe(
      '/api/offline-map/basemap/{z}/{x}/{y}?foo=bar&v=abc123',
    )
  })

  it('percent-encodes a version value that needs it', () => {
    expect(withTierVersion('/template', 'has space&amp')).toBe(
      `/template?v=${encodeURIComponent('has space&amp')}`,
    )
  })
})
