/**
 * Shapes the Air FILTER pane works with: one search result per category, the
 * raw ADS-B feature it reads aircraft from, and the formatted telemetry an
 * expanded aircraft row shows.
 */

/** An aircraft row, read from one ADS-B feature. */
export interface PlaneResult {
  kind: 'plane'
  hex: string
  callsign: string
  reg: string
  squawk: string
  emergency: boolean
  coords: [number, number]
}

/** A civil airport row, with the airband channels its accordion tunes. */
export interface AirportResult {
  kind: 'airport'
  icao: string
  iata: string
  name: string
  bounds: [number, number, number, number]
  coords: [number, number]
  freqs: { tower: string; radar: string; approach: string; atis: string }
}

/** A military base row. */
export interface MilResult {
  kind: 'mil'
  icao: string
  name: string
  bounds: [number, number, number, number]
  coords: [number, number]
}

/** One aircraft feature as the ADS-B control holds it. */
export interface AircraftFeature {
  properties: Record<string, unknown>
  geometry: { coordinates: [number, number] }
}

/** The labelled telemetry values an expanded aircraft row shows. */
export interface AircraftLiveData {
  lat: string
  lon: string
  hdg: string
  alt: string
  spd: string
  vrate: string
  type: string
  reg: string
  category: string
  squawk: string
}

/** Placeholder shown for any field with no live value (em dashes throughout). */
export const EMPTY_AIRCRAFT_DATA: AircraftLiveData = {
  lat: '—',
  lon: '—',
  hdg: '—',
  alt: '—',
  spd: '—',
  vrate: '—',
  type: '—',
  reg: '—',
  category: '—',
  squawk: '—',
}
