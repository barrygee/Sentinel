/**
 * The Air FILTER pane's search results as BaseFilterPanel rows.
 *
 * Each row's element ids use a per-category, index-based token: a base name
 * can contain spaces, which would split the listbox's space-separated
 * aria-owns list into dangling IDREFs. Airport and base rows also announce
 * their open/closed state in their accessible name, since an option cannot
 * carry aria-expanded.
 */
import type { FilterPanelItem } from '@sentinel/ui/base/BaseFilterPanel.vue'
import type { AirportResult, MilResult, PlaneResult } from './airFilterTypes'

// An aircraft row's second line: hex, registration and squawk, where known.
function planeSecondary(plane: PlaneResult): string {
  const parts: string[] = []
  if (plane.hex) parts.push(plane.hex.toUpperCase())
  if (plane.reg) parts.push(plane.reg)
  if (plane.squawk) parts.push('SQK ' + plane.squawk)
  return parts.join(' · ')
}

/** Aircraft rows; an emergency aircraft's row is flagged for the red callsign. */
export function planeRows(planes: PlaneResult[]): FilterPanelItem[] {
  return planes.map((plane, index) => {
    const primary = plane.callsign || plane.hex
    const secondary = planeSecondary(plane)
    return {
      key: plane.hex,
      idKey: `plane-${index}`,
      primary,
      secondary,
      optionLabel: secondary ? `${primary}, ${secondary}` : primary,
      rowClass: plane.emergency ? 'filter-result-item--emergency' : undefined,
    }
  })
}

/** Airport rows, keyed by ICAO. */
export function airportRows(
  airports: AirportResult[],
  expandedIcao: string | null,
): FilterPanelItem[] {
  return airports.map((airport, index) => {
    const name = airport.name.toUpperCase()
    const state = expandedIcao === airport.icao ? 'expanded' : 'collapsed'
    return {
      key: airport.icao,
      idKey: `airport-${index}`,
      primary: airport.icao,
      secondary: `${name}${airport.iata ? ' · ' + airport.iata : ''}`,
      optionLabel: `${airport.icao}, ${name}${airport.iata ? ` ${airport.iata}` : ''}, ${state}`,
    }
  })
}

/** Military base rows, keyed by name: two bases (Wyton, Alconbury) share an
 *  ICAO code, and Fylingdales has none — so the label falls back to the name. */
export function milBaseRows(bases: MilResult[], expandedName: string | null): FilterPanelItem[] {
  return bases.map((base, index) => {
    const primary = base.icao || base.name.toUpperCase().slice(0, 6)
    const name = base.name.toUpperCase()
    const state = expandedName === base.name ? 'expanded' : 'collapsed'
    return {
      key: base.name,
      idKey: `mil-${index}`,
      primary,
      secondary: name,
      optionLabel: `${primary}, ${name}, ${state}`,
    }
  })
}
