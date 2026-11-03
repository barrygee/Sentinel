import { describe, expect, it } from 'vitest'
import { AIRCRAFT_TYPE_DIMENSIONS } from './aircraftTypeDimensions'
import { AIRCRAFT_FAMILY_IDS } from './aircraftFamilies'
import { silhouetteForShape } from './silhouetteImage'

const ENTRIES = Object.entries(AIRCRAFT_TYPE_DIMENSIONS)

describe('AIRCRAFT_TYPE_DIMENSIONS', () => {
  it('keys every entry by an upper-case ICAO designator', () => {
    for (const [designator] of ENTRIES) expect(designator).toMatch(/^[A-Z0-9]{2,4}$/)
  })

  it('draws every type as a known family, at a plausible real size', () => {
    for (const [designator, entry] of ENTRIES) {
      expect(AIRCRAFT_FAMILY_IDS, designator).toContain(entry.familyId)
      // From a 5 m microlight to an 88 m An-225, in metres.
      expect(entry.length, designator).toBeGreaterThan(4)
      expect(entry.length, designator).toBeLessThan(90)
      expect(entry.span, designator).toBeGreaterThan(4)
      expect(entry.span, designator).toBeLessThan(90)
    }
  })

  it('builds a drawing for every type', () => {
    for (const [designator] of ENTRIES) {
      expect(silhouetteForShape(`type:${designator}`), designator).not.toBeNull()
    }
  })
})
