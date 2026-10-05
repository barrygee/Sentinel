import { describe, it, expect } from 'vitest'
import { haversineNm, buildCirclePolygon } from './distanceUtils'

describe('haversineNm', () => {
  it('is zero for identical points', () => {
    expect(haversineNm(51.5, -0.1, 51.5, -0.1)).toBe(0)
  })

  it('matches a known great-circle distance (~60 nm per degree of latitude)', () => {
    // One degree of latitude is ~60.04 nm.
    expect(haversineNm(0, 0, 1, 0)).toBeCloseTo(60.04, 1)
  })

  it('is symmetric', () => {
    const ab = haversineNm(51.5, -0.1, 48.85, 2.35)
    const ba = haversineNm(48.85, 2.35, 51.5, -0.1)
    expect(ab).toBeCloseTo(ba, 6)
  })
})

describe('buildCirclePolygon', () => {
  it('returns a closed polygon feature with steps+1 points (default 64)', () => {
    const feature = buildCirclePolygon(0, 0, 100)
    expect(feature.type).toBe('Feature')
    expect(feature.geometry.type).toBe('Polygon')
    expect(feature.geometry.coordinates[0]).toHaveLength(65)
    expect(feature.properties).toEqual({ radiusNm: 100 })
  })

  it('honours a custom step count', () => {
    const feature = buildCirclePolygon(10, 20, 50, 8)
    expect(feature.geometry.coordinates[0]).toHaveLength(9)
  })

  it('places every vertex approximately the requested radius from the centre', () => {
    const radiusNm = 100
    const feature = buildCirclePolygon(5, 45, radiusNm, 16)
    for (const [lng, lat] of feature.geometry.coordinates[0]) {
      expect(haversineNm(45, 5, lat, lng)).toBeCloseTo(radiusNm, 0)
    }
  })
})
