import { aprsSymbolIcon } from '@sentinel/ui/utils/aprsSymbols'
import type {
  AircraftItem,
  AprsStationItem,
  DrawnLayerId,
  LayerItems,
  VesselItem,
} from './globeFeedTypes'
import { aircraftObject, aprsObject, vesselObject } from './globeObjects'

/** One label/value pair in the details panel. */
export interface DetailCell {
  label: string
  value: string
}

/** A titled group of cells. */
export interface DetailSection {
  title: string
  cells: DetailCell[]
}

/** Everything the details panel shows for one object. */
export interface ObjectDetails {
  /** What and where from, e.g. "Aircraft · ADS-B". */
  kindLabel: string
  title: string
  subtitle: string
  /** The object's mark colour, shown as a swatch. */
  colour: string
  sections: DetailSection[]
}

const DASH = '—'

/** A latitude or longitude as `51.4700°N`. */
export function formatCoordinate(degrees: number, positive: string, negative: string): string {
  return `${Math.abs(degrees).toFixed(4)}°${degrees >= 0 ? positive : negative}`
}

function formatNumber(value: number | null, unit: string, decimals = 0): string {
  if (value === null || !Number.isFinite(value)) return DASH
  return `${value.toLocaleString('en-GB', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })} ${unit}`
}

function formatHeading(degrees: number | null): string {
  return degrees === null || !Number.isFinite(degrees) ? DASH : `${Math.round(degrees)}°`
}

/** How long ago a time was, e.g. "45 s ago", "3 min ago". */
export function formatAge(thenMs: number | null, nowMs: number): string {
  if (thenMs === null) return DASH
  const seconds = Math.max(0, Math.round((nowMs - thenMs) / 1000))
  if (seconds < 90) return `${seconds} s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${minutes} min ago`
  return `${Math.round(minutes / 60)} h ago`
}

function positionCells(lat: number, lon: number): DetailCell[] {
  return [
    { label: 'Latitude', value: formatCoordinate(lat, 'N', 'S') },
    { label: 'Longitude', value: formatCoordinate(lon, 'E', 'W') },
  ]
}

function aircraftDetails(aircraft: AircraftItem, nowMs: number): ObjectDetails {
  const object = aircraftObject(aircraft)
  const altitude = aircraft.onGround ? 'Ground' : formatNumber(aircraft.altitudeFt, 'ft')
  return {
    kindLabel: aircraft.military ? 'Military aircraft · ADS-B' : 'Aircraft · ADS-B',
    title: object.label.name,
    subtitle: [aircraft.hex.toUpperCase(), aircraft.registration, aircraft.typeCode]
      .filter(Boolean)
      .join(' · '),
    colour: object.colour,
    sections: [
      {
        title: 'Position',
        cells: [
          ...positionCells(aircraft.lat, aircraft.lon),
          { label: 'Altitude', value: altitude },
          { label: 'Track', value: formatHeading(aircraft.trackDeg) },
          { label: 'Speed', value: formatNumber(aircraft.groundSpeedKt, 'kt') },
          {
            label: 'Last position',
            value:
              aircraft.seenPosSeconds === null
                ? DASH
                : formatAge(nowMs - aircraft.seenPosSeconds * 1000, nowMs),
          },
        ],
      },
      {
        title: 'Flight',
        cells: [
          { label: 'Squawk', value: aircraft.squawk ?? DASH },
          { label: 'Category', value: aircraft.category ?? DASH },
          { label: 'Type', value: aircraft.typeCode ?? DASH },
          {
            label: 'Emergency',
            value:
              aircraft.emergency && aircraft.emergency !== 'none'
                ? aircraft.emergency.toUpperCase()
                : 'None',
          },
        ],
      },
    ],
  }
}

function vesselDetails(vessel: VesselItem, nowMs: number): ObjectDetails {
  const object = vesselObject(vessel)
  return {
    kindLabel: 'Vessel · AIS',
    title: object.label.name,
    subtitle: [vessel.typeLabel ?? vessel.family, `MMSI ${vessel.mmsi}`]
      .filter(Boolean)
      .join(' · '),
    colour: object.colour,
    sections: [
      {
        title: 'Position',
        cells: [
          ...positionCells(vessel.lat, vessel.lon),
          {
            label: 'Course',
            value: formatHeading(
              vessel.courseDeg !== null && vessel.courseDeg < 360 ? vessel.courseDeg : null,
            ),
          },
          {
            label: 'Heading',
            value: formatHeading(
              vessel.headingDeg !== null && vessel.headingDeg < 360 ? vessel.headingDeg : null,
            ),
          },
          { label: 'Speed', value: formatNumber(vessel.speedKt, 'kn', 1) },
          { label: 'Last position', value: formatAge(vessel.lastPositionMs, nowMs) },
        ],
      },
    ],
  }
}

function aprsDetails(station: AprsStationItem, nowMs: number): ObjectDetails {
  const object = aprsObject(station)
  const symbol = aprsSymbolIcon(station.symbol).label
  return {
    kindLabel: 'APRS station',
    title: station.callsign,
    subtitle: symbol,
    colour: object.colour,
    sections: [
      {
        title: 'Position',
        cells: [
          ...positionCells(station.lat, station.lon),
          { label: 'Altitude', value: formatNumber(station.altitudeM, 'm') },
          { label: 'Course', value: formatHeading(station.courseDeg) },
          { label: 'Speed', value: formatNumber(station.speedKmh, 'km/h') },
          { label: 'Last heard', value: formatAge(station.lastHeardMs, nowMs) },
        ],
      },
      ...(station.comment
        ? [{ title: 'Comment', cells: [{ label: 'Comment', value: station.comment }] }]
        : []),
    ],
  }
}

/** The details panel's content for one item of a layer. */
export function objectDetails<Layer extends DrawnLayerId>(
  layer: Layer,
  item: LayerItems[Layer],
  nowMs: number,
): ObjectDetails {
  if (layer === 'air') return aircraftDetails(item as AircraftItem, nowMs)
  if (layer === 'sea') return vesselDetails(item as VesselItem, nowMs)
  return aprsDetails(item as AprsStationItem, nowMs)
}
