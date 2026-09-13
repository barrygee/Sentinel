import { describe, it, expect } from 'vitest'
import {
  familyMatchesCategory,
  isSeaFilterCategory,
  isVesselFamily,
  SEA_FILTER_CATEGORIES,
  SEA_MILITARY_COLOR,
  SEA_SAR_COLOR,
  VESSEL_FAMILIES,
  vesselFamilyColor,
  vesselFamilyLabel,
} from './aisShipType'

describe('aisShipType', () => {
  it('recognises every family and rejects anything else', () => {
    for (const family of VESSEL_FAMILIES) expect(isVesselFamily(family)).toBe(true)
    expect(isVesselFamily('battleship')).toBe(false)
    expect(isVesselFamily(42)).toBe(false)
    expect(isVesselFamily(undefined)).toBe(false)
  })

  it('gives each family its own colour, with military and SAR set apart', () => {
    const colours = new Set(VESSEL_FAMILIES.map((family) => vesselFamilyColor(family)))
    expect(colours.size).toBe(VESSEL_FAMILIES.length)
    expect(vesselFamilyColor('military')).toBe(SEA_MILITARY_COLOR)
    expect(vesselFamilyColor('sar')).toBe(SEA_SAR_COLOR)
    expect(SEA_SAR_COLOR).not.toBe(SEA_MILITARY_COLOR)
    // Unknown input takes the default so a vessel is never left uncoloured.
    expect(vesselFamilyColor('nonsense')).toBe(vesselFamilyColor('other'))
    expect(vesselFamilyColor(null)).toBe(vesselFamilyColor('other'))
  })

  it('labels families in uppercase and falls back to OTHER', () => {
    expect(vesselFamilyLabel('cargo')).toBe('CARGO')
    expect(vesselFamilyLabel('sar')).toBe('SAR')
    expect(vesselFamilyLabel('??')).toBe('OTHER')
  })

  it('validates FILTER rail categories', () => {
    for (const category of SEA_FILTER_CATEGORIES) expect(isSeaFilterCategory(category)).toBe(true)
    expect(isSeaFilterCategory('military')).toBe(false)
    expect(isSeaFilterCategory(null)).toBe(false)
  })

  it('matches families to categories, with OTHER catching the rest', () => {
    expect(familyMatchesCategory('cargo', 'all')).toBe(true)
    expect(familyMatchesCategory('cargo', 'cargo')).toBe(true)
    expect(familyMatchesCategory('cargo', 'tanker')).toBe(false)
    expect(familyMatchesCategory('cargo', 'other')).toBe(false)
    expect(familyMatchesCategory('fishing', 'other')).toBe(false)
    for (const family of ['service', 'military', 'sar', 'pleasure', 'other', 'unknown']) {
      expect(familyMatchesCategory(family, 'other')).toBe(true)
    }
  })
})
