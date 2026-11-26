/**
 * The colours the flat maps give live objects, so the globe reads the same:
 * aircraft by altitude (Air's ramp), vessels by family (Sea's), APRS in
 * white (Land's monochrome pill), plus the label badges' colours.
 *
 * The globe can't import map-kit (it would load MapLibre), so the two small
 * tables are copied here. Their sources: map-kit
 * `aircraft-silhouettes/altitudeColour.ts` and Sea's `utils/aisShipType.ts`.
 */

/** Altitude in feet and its hue, from Air's ramp (orange low, magenta at cruise). */
const ALTITUDE_HUE_STOPS: readonly (readonly [altitudeFeet: number, hueDegrees: number])[] = [
  [0, 20],
  [2_000, 38],
  [4_000, 55],
  [8_000, 110],
  [10_000, 150],
  [20_000, 195],
  [30_000, 235],
  [40_000, 295],
]
const ALTITUDE_CEILING_FEET = 40_000

/** Emergency squawks (7500/7600/7700) on every map. */
export const EMERGENCY_COLOUR = '#ff2222'

/** An aircraft with no reported altitude: the ramp's ground colour would claim it's low. */
export const UNKNOWN_ALTITUDE_COLOUR = '#c8ccd4'

/**
 * Air's ramp colour for an altitude, as CSS `hsl()` (the dark map's lightness).
 * Continuous rather than banded: the globe draws dots, not one sprite per band.
 */
export function altitudeColour(altitudeFeet: number | null): string {
  if (altitudeFeet === null) return UNKNOWN_ALTITUDE_COLOUR
  const altitude = Math.min(Math.max(altitudeFeet, 0), ALTITUDE_CEILING_FEET)
  const upperIndex = ALTITUDE_HUE_STOPS.findIndex(([stopFeet]) => stopFeet >= altitude)
  let hue = ALTITUDE_HUE_STOPS[0]![1]
  if (upperIndex > 0) {
    const [lowerFeet, lowerHue] = ALTITUDE_HUE_STOPS[upperIndex - 1]!
    const [upperFeet, upperHue] = ALTITUDE_HUE_STOPS[upperIndex]!
    hue = lowerHue + ((altitude - lowerFeet) / (upperFeet - lowerFeet)) * (upperHue - lowerHue)
  }
  return `hsl(${Math.round(hue)}, 85%, 60%)`
}

/** Sea's vessel family colours. */
const VESSEL_FAMILY_COLOURS: Readonly<Record<string, string>> = {
  cargo: '#39d5ff',
  tanker: '#ffb347',
  passenger: '#ff7adf',
  fishing: '#7cff9b',
  service: '#f7f0a3',
  military: '#c8ff00',
  sar: '#ff6a13',
  pleasure: '#c9c9ff',
  other: '#9fb3c8',
}

/** The colour of a vessel family (Sea's `other` for an unknown one). */
export function vesselFamilyColour(family: string | null): string {
  return VESSEL_FAMILY_COLOURS[family ?? 'other'] ?? VESSEL_FAMILY_COLOURS.other!
}

/** APRS stations: white glyph and callsign on charcoal, as Land draws them. */
export const APRS_COLOUR = '#ffffff'

/** A label badge: its background and text colour. */
export interface BadgeColours {
  background: string
  text: string
}

/** Charcoal behind vessel and APRS glyphs and badges. */
export const CHARCOAL = '#15171d'

/** Aircraft type badges: civil blue, military lime, emergency red (Air's label pill). */
export const AIRCRAFT_BADGE: Readonly<Record<'civil' | 'military' | 'emergency', BadgeColours>> = {
  civil: { background: '#002244', text: '#00aaff' },
  military: { background: '#4d6600', text: '#c8ff00' },
  emergency: { background: '#4d0000', text: EMERGENCY_COLOUR },
}
