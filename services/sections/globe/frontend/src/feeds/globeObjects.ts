import { aprsSymbolIcon } from '@sentinel/ui/utils/aprsSymbols'
import type { GlobeObject } from '../globe/globeObject'
import {
  AIRCRAFT_BADGE,
  altitudeColour,
  APRS_COLOUR,
  CHARCOAL,
  EMERGENCY_COLOUR,
  vesselFamilyColour,
} from '../globe/objectStyles'
import type { AircraftItem, AprsStationItem, VesselItem } from './globeFeedTypes'

/** Squawks that mean hijack, radio failure and general emergency. */
const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700'])

/** Height of a surface object (vessel, APRS station) above the globe, in scene units. */
const SURFACE_HEIGHT = 0.05

/** An aircraft's height in scene units: just above the surface, rising a little with altitude (the site globe's scale). */
function aircraftHeight(altitudeFeet: number | null): number {
  return 0.15 + Math.max(0, altitudeFeet ?? 0) * 3e-6
}

/** True when the aircraft is squawking or reporting an emergency. */
export function isEmergency(aircraft: AircraftItem): boolean {
  if (aircraft.squawk && EMERGENCY_SQUAWKS.has(aircraft.squawk)) return true
  return Boolean(aircraft.emergency && aircraft.emergency !== 'none')
}

/** A finite heading, or null. */
function heading(...candidates: Array<number | null>): number | null {
  for (const value of candidates) if (value !== null && Number.isFinite(value)) return value
  return null
}

/** An aircraft as a drawable object: coloured by altitude, red in an emergency. */
export function aircraftObject(aircraft: AircraftItem): GlobeObject {
  const urgent = isEmergency(aircraft)
  const badgeKind = urgent ? 'emergency' : aircraft.military ? 'military' : 'civil'
  return {
    key: `air:${aircraft.hex}`,
    kind: 'air',
    lat: aircraft.lat,
    lon: aircraft.lon,
    heightAboveSurface: aircraftHeight(aircraft.altitudeFt),
    headingDeg: heading(aircraft.trackDeg),
    colour: urgent ? EMERGENCY_COLOUR : altitudeColour(aircraft.altitudeFt),
    urgent,
    label: {
      name: aircraft.callsign ?? aircraft.registration ?? aircraft.hex.toUpperCase(),
      badge: urgent ? aircraft.squawk : (aircraft.typeCode?.toUpperCase() ?? null),
      badgeColours: AIRCRAFT_BADGE[badgeKind],
      wellBackground: '#000',
    },
  }
}

/** A vessel as a drawable object, in its family's colour, pointing along its heading (or course). */
export function vesselObject(vessel: VesselItem): GlobeObject {
  const colour = vesselFamilyColour(vessel.family)
  // AIS uses 511 for "no heading", which the store passes through as-is.
  const trueHeading =
    vessel.headingDeg !== null && vessel.headingDeg < 360 ? vessel.headingDeg : null
  return {
    key: `sea:${vessel.mmsi}`,
    kind: 'sea',
    lat: vessel.lat,
    lon: vessel.lon,
    heightAboveSurface: SURFACE_HEIGHT,
    headingDeg: heading(
      trueHeading,
      vessel.courseDeg !== null && vessel.courseDeg < 360 ? vessel.courseDeg : null,
    ),
    colour,
    urgent: false,
    label: {
      name: vessel.name ?? vessel.mmsi,
      badge: (vessel.typeLabel ?? vessel.family ?? 'other').toUpperCase(),
      badgeColours: { background: CHARCOAL, text: colour },
      wellBackground: CHARCOAL,
    },
  }
}

/** An APRS station as a drawable object: white, pointing along its course when it moves. */
export function aprsObject(station: AprsStationItem): GlobeObject {
  const moving = (station.speedKmh ?? 0) > 0
  return {
    key: `aprs:${station.callsign}`,
    kind: 'aprs',
    lat: station.lat,
    lon: station.lon,
    heightAboveSurface: SURFACE_HEIGHT,
    headingDeg: moving ? heading(station.courseDeg) : null,
    colour: APRS_COLOUR,
    urgent: false,
    label: {
      name: station.callsign,
      // The symbol's name ("CAR", "DIGIPEATER"), as Land's symbol chip shows it.
      badge: station.symbol ? aprsSymbolIcon(station.symbol).label.toUpperCase() : null,
      badgeColours: { background: CHARCOAL, text: APRS_COLOUR },
      wellBackground: CHARCOAL,
    },
  }
}
