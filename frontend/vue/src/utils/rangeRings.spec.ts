import { describe, it, expect } from 'vitest'
import { buildRingsGeoJSON, RING_DISTANCES_NM } from './rangeRings'

describe('buildRingsGeoJSON', () => {
  it('builds one closed LineString ring per configured distance', () => {
    const fc = buildRingsGeoJSON(-2, 54)
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(RING_DISTANCES_NM.length)
    for (const feature of fc.features) {
      expect(feature.geometry.type).toBe('LineString')
      const coords = (feature.geometry as GeoJSON.LineString).coordinates
      expect(coords).toHaveLength(65) // 64 steps + closing point
      // Closed ring: first and last points coincide (within float tolerance).
      const last = coords[coords.length - 1]
      expect(coords[0][0]).toBeCloseTo(last[0], 9)
      expect(coords[0][1]).toBeCloseTo(last[1], 9)
    }
  })

  it('tags each ring with its distance in NM', () => {
    const fc = buildRingsGeoJSON(0, 0)
    expect(fc.features.map((feature) => feature.properties?.dist)).toEqual([...RING_DISTANCES_NM])
  })

  it('centres the rings on the given point (larger radius spans wider)', () => {
    const fc = buildRingsGeoJSON(-2, 54)
    const spanLat = (feature: GeoJSON.Feature) => {
      const lats = (feature.geometry as GeoJSON.LineString).coordinates.map((point) => point[1])
      return Math.max(...lats) - Math.min(...lats)
    }
    // The 250 NM ring must be visibly wider than the 50 NM ring.
    expect(spanLat(fc.features[4])).toBeGreaterThan(spanLat(fc.features[0]))
  })
})
