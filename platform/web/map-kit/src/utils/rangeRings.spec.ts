import { describe, it, expect } from 'vitest'
import { buildRingsGeoJSON, buildRingTopsGeoJSON, RING_DISTANCES_NM } from './rangeRings'

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

describe('buildRingTopsGeoJSON', () => {
  const pointCoordinates = (feature: GeoJSON.Feature) =>
    (feature.geometry as GeoJSON.Point).coordinates

  it('builds one Point per ring, tagged with its distance in NM', () => {
    const collection = buildRingTopsGeoJSON(-2, 54)
    expect(collection.type).toBe('FeatureCollection')
    expect(collection.features.map((feature) => feature.geometry.type)).toEqual(
      RING_DISTANCES_NM.map(() => 'Point'),
    )
    expect(collection.features.map((feature) => feature.properties?.dist)).toEqual([
      ...RING_DISTANCES_NM,
    ])
  })

  it('places each point due north of the centre, at the ring radius', () => {
    const [firstTop] = buildRingTopsGeoJSON(0, 0).features
    const [longitude, latitude] = pointCoordinates(firstTop!)
    expect(longitude).toBe(0)
    // 50 NM of great-circle arc on a 3440.065 NM Earth, in degrees of latitude.
    expect(latitude).toBeCloseTo(((50 / 3440.065) * 180) / Math.PI, 9)
  })

  it('sits exactly on the top of the ring it labels', () => {
    const rings = buildRingsGeoJSON(-2, 54).features
    const tops = buildRingTopsGeoJSON(-2, 54).features
    tops.forEach((top, ringIndex) => {
      const ringCoordinates = (rings[ringIndex]!.geometry as GeoJSON.LineString).coordinates
      const northernmostLatitude = Math.max(...ringCoordinates.map((point) => point[1]!))
      const [longitude, latitude] = pointCoordinates(top)
      expect(longitude).toBeCloseTo(-2, 9)
      expect(latitude).toBeCloseTo(northernmostLatitude, 9)
    })
  })

  it('climbs further north for each larger ring', () => {
    const latitudes = buildRingTopsGeoJSON(-2, 54).features.map(
      (feature) => pointCoordinates(feature)[1]!,
    )
    latitudes.slice(1).forEach((latitude, index) => {
      expect(latitude).toBeGreaterThan(latitudes[index]!)
    })
  })
})
