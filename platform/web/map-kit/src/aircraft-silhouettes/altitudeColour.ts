/**
 * Colours aircraft by altitude: orange near the ground, through yellow, green
 * and blue, to magenta at cruise height. Sentinel's own ramp, defined here by
 * hue stops rather than taken from another tracker's table.
 *
 * Altitude is quantised into bands because each colour is a separate map image:
 * a band's width is the most an aircraft can climb before its colour changes,
 * so it is finer low down, where height matters most.
 */
import type { SilhouettePalette } from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'

/** Altitude in feet and the hue it takes; hues between stops are interpolated. */
const HUE_STOPS: readonly (readonly [altitudeFeet: number, hueDegrees: number])[] = [
  [0, 20],
  [2_000, 38],
  [4_000, 55],
  [8_000, 110],
  [10_000, 150],
  [20_000, 195],
  [30_000, 235],
  [40_000, 295],
]

const SATURATION_PERCENT = 85

/** Lightness per palette: bright on the dark map, deeper to read on cream land. */
const LIGHTNESS_PERCENT: Readonly<Record<SilhouettePalette, number>> = { dark: 60, light: 38 }

/** Below this altitude bands are {@link LOW_BAND_FEET} wide, above it {@link HIGH_BAND_FEET}. */
const BAND_WIDTH_CHANGE_FEET = 10_000
const LOW_BAND_FEET = 500
const HIGH_BAND_FEET = 2_000
const LOW_BAND_COUNT = BAND_WIDTH_CHANGE_FEET / LOW_BAND_FEET

/** Top of the ramp: everything higher takes the last band. */
const CEILING_FEET = 40_000

/** The highest band number. */
export const ALTITUDE_BAND_MAX =
  LOW_BAND_COUNT + (CEILING_FEET - BAND_WIDTH_CHANGE_FEET) / HIGH_BAND_FEET

/** Altitudes the legend marks, in feet, spaced evenly along it. */
export const ALTITUDE_LEGEND_TICKS_FEET = [
  0, 2_000, 4_000, 6_000, 8_000, 10_000, 20_000, 30_000, 40_000,
] as const

/** The band an altitude falls in, from 0 to {@link ALTITUDE_BAND_MAX}. */
export function altitudeBand(altitudeFeet: number): number {
  const altitude = Math.min(Math.max(altitudeFeet, 0), CEILING_FEET)
  if (altitude < BAND_WIDTH_CHANGE_FEET) return Math.floor(altitude / LOW_BAND_FEET)
  return LOW_BAND_COUNT + Math.floor((altitude - BAND_WIDTH_CHANGE_FEET) / HIGH_BAND_FEET)
}

/** The altitude a band's colour is taken from: its lower edge. */
function bandFloorFeet(band: number): number {
  if (band < LOW_BAND_COUNT) return band * LOW_BAND_FEET
  return BAND_WIDTH_CHANGE_FEET + (band - LOW_BAND_COUNT) * HIGH_BAND_FEET
}

/** The hue for an altitude, interpolated between the two stops around it. */
function hueAt(altitudeFeet: number): number {
  const altitude = Math.min(Math.max(altitudeFeet, 0), CEILING_FEET)
  const upperIndex = HUE_STOPS.findIndex(([stopFeet]) => stopFeet >= altitude)
  if (upperIndex <= 0) return HUE_STOPS[0]![1]
  const [lowerFeet, lowerHue] = HUE_STOPS[upperIndex - 1]!
  const [upperFeet, upperHue] = HUE_STOPS[upperIndex]!
  return lowerHue + ((altitude - lowerFeet) / (upperFeet - lowerFeet)) * (upperHue - lowerHue)
}

/** The ramp's colour for an altitude, as CSS. */
export function altitudeColour(altitudeFeet: number, palette: SilhouettePalette): string {
  const hue = Math.round(hueAt(altitudeFeet))
  return `hsl(${hue}, ${SATURATION_PERCENT}%, ${LIGHTNESS_PERCENT[palette]}%)`
}

/** The ramp's colour for a band, as CSS. */
export function altitudeBandColour(band: number, palette: SilhouettePalette): string {
  return altitudeColour(bandFloorFeet(band), palette)
}
