/**
 * Presentation of AIS vessel families on the Sea map.
 *
 * The backend classifies each vessel's ITU-R M.1371 ship-type code into a
 * family (see `backend/services/ais_store.py`); this module maps that family to
 * the colour its chevron and label chip take. The hues follow the source
 * project's palette so tankers, cargo, passenger and fishing vessels read the
 * same way an analyst used to God's Eye View expects — except military, which
 * takes Sentinel's own military accent so the meaning of that lime is the same
 * on every map, and SAR, which takes lifeboat orange.
 */

/** A vessel family as reported by GET /api/sea/vessels. */
export type VesselFamily =
  | 'cargo'
  | 'tanker'
  | 'passenger'
  | 'fishing'
  | 'service'
  | 'military'
  | 'sar'
  | 'pleasure'
  | 'other'

/** Every family, in the order the FILTER rail and legend present them. */
export const VESSEL_FAMILIES: readonly VesselFamily[] = [
  'cargo',
  'tanker',
  'passenger',
  'fishing',
  'service',
  'military',
  'sar',
  'pleasure',
  'other',
]

/** The lime used for military aircraft on the Air map — reused so colour keeps
 *  one meaning across domains. */
export const SEA_MILITARY_COLOR = '#c8ff00'

/** Search-and-rescue craft — lifeboats — in the RNLI's orange, the colour a
 *  lifeboat actually is, so one reads at a glance among the commercial hues. */
export const SEA_SAR_COLOR = '#ff6a13'

const FAMILY_COLORS: Record<VesselFamily, string> = {
  cargo: '#39d5ff',
  tanker: '#ffb347',
  passenger: '#ff7adf',
  fishing: '#7cff9b',
  service: '#f7f0a3',
  military: SEA_MILITARY_COLOR,
  sar: SEA_SAR_COLOR,
  pleasure: '#c9c9ff',
  other: '#9fb3c8',
}

const FAMILY_LABELS: Record<VesselFamily, string> = {
  cargo: 'CARGO',
  tanker: 'TANKER',
  passenger: 'PASSENGER',
  fishing: 'FISHING',
  service: 'SERVICE',
  military: 'MILITARY',
  sar: 'SAR',
  pleasure: 'PLEASURE',
  other: 'OTHER',
}

/** Whether a string is a known {@link VesselFamily}. */
export function isVesselFamily(value: unknown): value is VesselFamily {
  return typeof value === 'string' && (VESSEL_FAMILIES as readonly string[]).includes(value)
}

/** The chevron / chip colour for a family; unknown values take the default. */
export function vesselFamilyColor(family: unknown): string {
  return isVesselFamily(family) ? FAMILY_COLORS[family] : FAMILY_COLORS.other
}

/** The uppercase display name of a family. */
export function vesselFamilyLabel(family: unknown): string {
  return isVesselFamily(family) ? FAMILY_LABELS[family] : FAMILY_LABELS.other
}

/**
 * The FILTER rail's categories: the four big commercial families each get a
 * button, everything else is grouped so the rail stays a glanceable size.
 */
export type SeaFilterCategory = 'all' | 'cargo' | 'tanker' | 'passenger' | 'fishing' | 'other'
export const SEA_FILTER_CATEGORIES: readonly SeaFilterCategory[] = [
  'all',
  'cargo',
  'tanker',
  'passenger',
  'fishing',
  'other',
]

/** Whether a string is a known {@link SeaFilterCategory}. */
export function isSeaFilterCategory(value: unknown): value is SeaFilterCategory {
  return typeof value === 'string' && (SEA_FILTER_CATEGORIES as readonly string[]).includes(value)
}

/** Whether a vessel of `family` belongs under the given FILTER category. */
export function familyMatchesCategory(family: unknown, category: SeaFilterCategory): boolean {
  if (category === 'all') return true
  if (category === 'other') {
    return !['cargo', 'tanker', 'passenger', 'fishing'].includes(String(family))
  }
  return family === category
}
