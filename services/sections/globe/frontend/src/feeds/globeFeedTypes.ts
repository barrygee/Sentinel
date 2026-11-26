/**
 * The shapes of `GET /api/globe/objects`, mirroring the globe backend's
 * Pydantic models (`sentinel_globe/schemas.py`). Keep the two in step: a field
 * added there is added here.
 */

/** A layer of the combined feed. */
export type GlobeLayerId = 'air' | 'space' | 'sea' | 'aprs'

/** The layers this page draws, in the order the layer bar lists them. */
export const DRAWN_LAYERS = ['air', 'sea', 'aprs'] as const satisfies readonly GlobeLayerId[]

/** A layer the page draws (space joins in the satellites step). */
export type DrawnLayerId = (typeof DRAWN_LAYERS)[number]

/** One aircraft from Air's snapshot around home. */
export interface AircraftItem {
  hex: string
  callsign: string | null
  registration: string | null
  typeCode: string | null
  lat: number
  lon: number
  /** Barometric altitude in feet; 0 on the ground, null when not reported. */
  altitudeFt: number | null
  onGround: boolean
  groundSpeedKt: number | null
  trackDeg: number | null
  squawk: string | null
  category: string | null
  emergency: string | null
  military: boolean
  seenPosSeconds: number | null
}

/** One vessel's latest position from Sea's store. */
export interface VesselItem {
  mmsi: string
  name: string | null
  typeLabel: string | null
  family: string | null
  lat: number
  lon: number
  speedKt: number | null
  courseDeg: number | null
  headingDeg: number | null
  lastPositionMs: number | null
}

/** One APRS station's latest fix from Land's store. */
export interface AprsStationItem {
  callsign: string
  lat: number
  lon: number
  altitudeM: number | null
  courseDeg: number | null
  speedKmh: number | null
  symbol: string | null
  comment: string | null
  lastHeardMs: number | null
}

/** The items each drawn layer carries. */
export interface LayerItems {
  air: AircraftItem
  sea: VesselItem
  aprs: AprsStationItem
}

/**
 * One layer of the feed: its items, or why there are none. `reason` comes
 * from a fixed vocabulary (`section-unavailable`, `timeout`, `error`,
 * `no-location`, `no-tle-data`, and Air's `daily-limit`, `no-source`,
 * `upstream`, `settings`).
 */
export interface LayerResult<Item = unknown> {
  status: 'ok' | 'unavailable'
  reason: string | null
  items: Item[]
  meta: Record<string, unknown>
}

/** The whole response. Only the requested layers are present. */
export interface GlobeObjectsResponse {
  generatedAtMs: number
  layers: Partial<Record<GlobeLayerId, LayerResult>>
}

/** South, west, north, east in degrees; west > east crosses the antimeridian. */
export type Bbox = readonly [south: number, west: number, north: number, east: number]
