/**
 * Plain search and row-text helpers for the Land FILTER pane: what an operator
 * can search a station or repeater by, how each set reads as a list row, and
 * how the listed sets are named in the search box's labels. No Vue, no stores —
 * `useLandFilterResults` feeds them the live snapshot.
 */
import type { FilterPanelItem } from '@sentinel/ui/base/BaseFilterPanel.vue'
import { aprsSymbolIcon } from '@sentinel/ui/utils/aprsSymbols'
import {
  formatRepeaterModes,
  repeaterSearchKey,
  stationBands,
  stationModes,
  stationOffAir,
} from '../constants/repeaters'
import type { RepeaterStation } from '../types/repeaters'
import type { AprsStation } from '../stores/land'
import { formatHeardTime } from '../controls/aprs/AprsStationsControl'

/** Group heading the APRS rows take once another set shares the list. */
export const APRS_STATIONS_GROUP_LABEL = 'APRS STATIONS'

/**
 * Names a list of sets the way a sentence would: `a`, `a and b`,
 * `a, b and c`. An empty list gives an empty string.
 */
export function joinSets(sets: string[]): string {
  if (sets.length <= 1) return sets.join('')
  return `${sets.slice(0, -1).join(', ')} and ${sets[sets.length - 1]}`
}

/** The station's symbol type in words (the label the map's icon carries). */
export function symbolLabel(station: AprsStation): string {
  return aprsSymbolIcon(station.symbol).label
}

/**
 * Whether a station matches the (already trimmed, lower-cased) search text,
 * over callsign, symbol type, path and comment — the fields an operator would
 * recognise a station by.
 */
export function stationMatches(station: AprsStation, needle: string): boolean {
  return [station.callsign, symbolLabel(station), station.path ?? '', station.comment ?? '']
    .join(' ')
    .toLowerCase()
    .includes(needle)
}

/** Callsign, town, bands and modes — what an operator would search a repeater by. */
export function repeaterMatches(station: RepeaterStation, needle: string): boolean {
  return [
    station.callsign,
    station.location ?? '',
    station.locator ?? '',
    stationBands(station).join(' '),
    formatRepeaterModes(stationModes(station)),
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle)
}

/**
 * One APRS station as a list row. `grouped` gives it the APRS STATIONS heading,
 * which stations only take once another set shares the list; alone they read
 * as they always have.
 */
export function stationRow(station: AprsStation, grouped: boolean): FilterPanelItem {
  const heard = formatHeardTime(station.last_heard_ms)
  return {
    key: station.callsign,
    primary: station.callsign,
    secondary: `${symbolLabel(station)} · ${heard}`,
    optionLabel: `${station.callsign}, ${symbolLabel(station)}, heard ${heard}`,
    groupLabel: grouped ? APRS_STATIONS_GROUP_LABEL : undefined,
  }
}

/** One repeater as a list row (a flat list: repeaters never take a heading). */
export function repeaterRow(station: RepeaterStation): FilterPanelItem {
  const bands = stationBands(station).join(' · ')
  const modes = formatRepeaterModes(stationModes(station))
  const offAir = stationOffAir(station)
  return {
    key: repeaterSearchKey(station.callsign),
    idKey: `rpt-${station.callsign}`,
    primary: station.callsign,
    secondary: [station.location, bands, modes, offAir ? 'OFF AIR' : null]
      .filter((part): part is string => Boolean(part))
      .join(' · '),
    optionLabel: `Repeater ${station.callsign}, ${station.location ?? 'location withheld'}, ${bands}, ${modes}${offAir ? ', not operational' : ''}`,
  }
}
