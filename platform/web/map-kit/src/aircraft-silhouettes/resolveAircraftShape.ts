/**
 * Decides which silhouette to draw for one aircraft, from what its ADS-B
 * report says about it.
 *
 * Most specific first:
 *
 * 1. **Type designator** (`t`, e.g. `A321`) found in Sentinel's type table —
 *    the family drawing stretched to that type's real length and span.
 * 2. **Emitter category** (`category`, e.g. `A3`) the transponder broadcasts —
 *    a family's reference drawing chosen for that weight class.
 * 3. **Anything else that is an aircraft** — a light single, since an aircraft
 *    that broadcasts no usable category and has a type Sentinel doesn't know is
 *    almost always a light aircraft (every such aircraft in a sample of UK
 *    traffic was).
 *
 * Only things that are not aircraft resolve to `null` — ground vehicles,
 * towers, obstacles, parachutists, space vehicles — and the caller keeps
 * drawing them the way it always has.
 */
import type { AircraftFamilyId } from '@sentinel/map-kit/aircraft-silhouettes/aircraftFamilies'
import type { AircraftDimensions } from '@sentinel/map-kit/aircraft-silhouettes/aircraftSilhouette'
import { AIRCRAFT_TYPE_DIMENSIONS } from '@sentinel/map-kit/aircraft-silhouettes/aircraftTypeDimensions'

/** The shape chosen for an aircraft. */
export interface ResolvedAircraftShape {
  /**
   * Stable identifier for this exact drawing — `type:A321` or `family:helicopter`.
   * Two aircraft with the same key draw identically, so it doubles as a cache key.
   */
  shapeKey: string
  familyId: AircraftFamilyId
  /** The type's real size, when known; absent for a category fallback. */
  dimensions?: AircraftDimensions
}

/**
 * Family for each ADS-B emitter category (DO-260B). The categories are weight
 * and kind classes, not types, so each maps to the family most aircraft in
 * that class look like:
 *
 * - A1 light (< 7 t) → light single; A2 small (< 34 t) → business jet;
 *   A3 large / A4 high-vortex large (< 136 t) → narrow-body; A5 heavy → wide-body;
 *   A6 high performance → fast jet; A7 rotorcraft → helicopter.
 * - B1 glider, B2 lighter-than-air, B4 ultralight, B6 UAV.
 *
 * Deliberately absent: A0/B0/C0 ("no information"), B3 parachutist and B7
 * space vehicle (nothing sensible to draw), and the C surface categories,
 * which Sentinel already draws as ground-vehicle and tower symbols.
 */
const CATEGORY_FAMILIES: Readonly<Record<string, AircraftFamilyId>> = {
  A1: 'lightSingleProp',
  A2: 'businessJet',
  A3: 'narrowbodyTwin',
  A4: 'narrowbodyTwin',
  A5: 'widebodyTwin',
  A6: 'fighterSingleFin',
  A7: 'helicopter',
  B1: 'glider',
  B2: 'balloon',
  B4: 'microlight',
  B6: 'uav',
}

/** Designators feeds give things that are not aircraft: a tower, ground units. */
const NON_AIRCRAFT_DESIGNATORS: ReadonlySet<string> = new Set(['TWR', 'GND', 'SERV'])

/** Categories that are not aircraft: B3 parachutist, B7 space vehicle. */
const NON_AIRCRAFT_CATEGORIES: ReadonlySet<string> = new Set(['B3', 'B7'])

/** Drawn for an aircraft nothing else identifies (see the module comment). */
const UNIDENTIFIED_AIRCRAFT_FAMILY: AircraftFamilyId = 'lightSingleProp'

/** Surface categories (C1–C7) are vehicles and obstacles, never aircraft. */
function isSurfaceCategory(category: string): boolean {
  return category.startsWith('C')
}

/**
 * Pick the silhouette for one aircraft.
 *
 * @param typeDesignator - ICAO type designator from the feed's `t` field; may be empty.
 * @param category - ADS-B emitter category from the feed's `category` field; may be empty.
 * @returns The shape to draw, or `null` for something that is not an aircraft.
 */
export function resolveAircraftShape(
  typeDesignator: string,
  category: string,
): ResolvedAircraftShape | null {
  const normalisedCategory = category.trim().toUpperCase()
  // A surface report wins over a type: a tug or fuel truck can carry the type
  // of the aircraft it serves, and must not be drawn as one.
  if (isSurfaceCategory(normalisedCategory)) return null

  const normalisedDesignator = typeDesignator.trim().toUpperCase()
  const typeEntry = AIRCRAFT_TYPE_DIMENSIONS[normalisedDesignator]
  if (typeEntry) {
    return {
      shapeKey: `type:${normalisedDesignator}`,
      familyId: typeEntry.familyId,
      dimensions: { length: typeEntry.length, span: typeEntry.span },
    }
  }

  const categoryFamily = CATEGORY_FAMILIES[normalisedCategory]
  if (categoryFamily) {
    return { shapeKey: `family:${categoryFamily}`, familyId: categoryFamily }
  }

  if (
    NON_AIRCRAFT_DESIGNATORS.has(normalisedDesignator) ||
    NON_AIRCRAFT_CATEGORIES.has(normalisedCategory)
  ) {
    return null
  }
  return {
    shapeKey: `family:${UNIDENTIFIED_AIRCRAFT_FAMILY}`,
    familyId: UNIDENTIFIED_AIRCRAFT_FAMILY,
  }
}
