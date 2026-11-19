/**
 * The Air FILTER pane's search results, per category: aircraft from the live
 * ADS-B mirror (gated like the map's ALL / CIVIL / MILITARY filter), airports
 * and military bases from the bundled data — each narrowed by the query.
 */
import { computed, type Ref } from 'vue'
import { AIRPORTS_DATA } from '../controls/airports/AirportsControl'
import { MILITARY_BASES_DATA } from '../controls/military-bases/MilitaryBasesControl'
import type { AircraftFeature, AirportResult, MilResult, PlaneResult } from './airFilterTypes'

/** The map's aircraft filter, mirrored so the list shows what the map shows. */
export type AircraftTypeFilter = 'all' | 'civil' | 'mil'

// Row ordering: by callsign (falling back to the immutable hex when an aircraft
// has not broadcast one yet), then hex as a stable tie-break.
function comparePlanes(first: PlaneResult, second: PlaneResult): number {
  return (
    (first.callsign || first.hex).localeCompare(second.callsign || second.hex) ||
    first.hex.localeCompare(second.hex)
  )
}

// Whether any of the fields contains the (already lower-cased) query.
function matchesQuery(normalisedQuery: string, fields: Array<string | undefined>): boolean {
  return !normalisedQuery || fields.some((field) => field?.toLowerCase().includes(normalisedQuery))
}

/**
 * @param query          The search text.
 * @param aircraftFeatures The live ADS-B features.
 * @param typeFilter     The map's ALL / CIVIL / MILITARY mode.
 * @param allHidden      The map is hiding every aircraft.
 */
export function useAirFilterResults(
  query: Ref<string>,
  aircraftFeatures: Ref<AircraftFeature[]>,
  typeFilter: Ref<AircraftTypeFilter>,
  allHidden: Ref<boolean>,
) {
  const normalisedQuery = computed(() => query.value.trim().toLowerCase())

  /** Matching aircraft in a stable order, so rows keep their place as the feed
   *  reorders/repopulates each poll and an open accordion doesn't jump. */
  const planes = computed<PlaneResult[]>(() => {
    // The map hides everything: so does the list.
    if (allHidden.value) return []
    const matched: PlaneResult[] = []
    for (const feature of aircraftFeatures.value) {
      const properties = feature.properties
      const category = ((properties.category as string) || '').trim()
      const typeCode = ((properties.t as string) || '').trim()
      // The list shows only aircraft — never ground vehicles (C1/C2) or
      // tower/static emitters (C3-C5, TWR), regardless of the ALL/CIVIL/MIL filter.
      const isGroundVehicle = category === 'C1' || category === 'C2'
      const isTower = ['C3', 'C4', 'C5'].includes(category) || typeCode === 'TWR'
      if (isGroundVehicle || isTower) continue
      if (typeFilter.value !== 'all') {
        const isMilitary = !!properties.military
        if (typeFilter.value === 'mil' && !isMilitary) continue
        if (typeFilter.value === 'civil' && isMilitary) continue
      }
      const callsign = ((properties.flight as string) || '').trim()
      const hex = ((properties.hex as string) || '').trim()
      const reg = ((properties.r as string) || '').trim()
      const squawk = ((properties.squawk as string) || '').trim()
      if (!matchesQuery(normalisedQuery.value, [callsign, hex, reg, squawk])) continue
      matched.push({
        kind: 'plane',
        hex,
        callsign,
        reg,
        squawk,
        // The map's own test: an emergency squawk (7500/7600/7700) counts as
        // much as the transponder's emergency field, so the row and its
        // headings go red whenever the map's label does.
        emergency:
          properties.squawkEmerg === 1 ||
          (!!properties.emergency && properties.emergency !== 'none'),
        coords: feature.geometry.coordinates,
      })
    }
    return matched.sort(comparePlanes)
  })

  /** Matching civil airports, in the bundled data's order. */
  const airports = computed<AirportResult[]>(() =>
    AIRPORTS_DATA.features
      .filter((feature) => {
        const properties = feature.properties
        return matchesQuery(normalisedQuery.value, [
          properties.icao,
          properties.iata,
          properties.name,
        ])
      })
      .map((feature) => ({
        kind: 'airport',
        icao: feature.properties.icao,
        iata: feature.properties.iata,
        name: feature.properties.name,
        bounds: feature.properties.bounds,
        coords: feature.geometry.coordinates as [number, number],
        freqs: feature.properties.freqs,
      })),
  )

  /** Matching military bases, in the bundled data's order. */
  const milBases = computed<MilResult[]>(() =>
    MILITARY_BASES_DATA.features
      .filter((feature) =>
        matchesQuery(normalisedQuery.value, [feature.properties.icao, feature.properties.name]),
      )
      .map((feature) => ({
        kind: 'mil',
        icao: feature.properties.icao,
        name: feature.properties.name,
        bounds: feature.properties.bounds,
        coords: feature.geometry.coordinates as [number, number],
      })),
  )

  return { planes, airports, milBases }
}
