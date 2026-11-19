/**
 * Formatting for the values an Air FILTER accordion shows — coordinates and an
 * aircraft's raw ADS-B properties turned into labelled strings. Missing or
 * non-numeric feed values render as an em dash rather than "0".
 */
import type { AircraftFeature, AircraftLiveData } from './airFilterTypes'

/** A latitude as `51.4700°N`. */
export function formatLat(latitude: number): string {
  return `${Math.abs(latitude).toFixed(4)}°${latitude >= 0 ? 'N' : 'S'}`
}

/** A longitude as `0.4543°W`. */
export function formatLon(longitude: number): string {
  return `${Math.abs(longitude).toFixed(4)}°${longitude >= 0 ? 'E' : 'W'}`
}

// Coerce a feed value to a finite number, or null when absent/non-numeric.
function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatHeading(track: unknown): string {
  const value = asFiniteNumber(track)
  return value === null ? '—' : `${Math.round(value)}°`
}

function formatAltitude(altBaro: unknown): string {
  const value = asFiniteNumber(altBaro)
  if (value === null) return '—'
  // alt_baro of 0 (or below) means on/near the ground in the ADS-B feed.
  return value <= 0 ? 'GND' : `${Math.round(value).toLocaleString('en-US')} ft`
}

function formatSpeed(groundSpeed: unknown): string {
  const value = asFiniteNumber(groundSpeed)
  return value === null ? '—' : `${Math.round(value)} kt`
}

function formatVerticalRate(baroRate: unknown): string {
  const value = asFiniteNumber(baroRate)
  if (value === null) return '—'
  const rounded = Math.round(value)
  // Show an explicit + for climbs so the sign reads at a glance.
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toLocaleString('en-US')} fpm`
}

// A trimmed text property, or an em dash when it is empty or absent.
function textOrDash(value: unknown): string {
  return ((value as string) || '').trim() || '—'
}

/** An aircraft feature's properties as the labelled values its accordion shows. */
export function formatAircraftLiveData(feature: AircraftFeature): AircraftLiveData {
  const properties = feature.properties
  const [longitude, latitude] = feature.geometry.coordinates
  return {
    lat: formatLat(latitude),
    lon: formatLon(longitude),
    hdg: formatHeading(properties.track),
    alt: formatAltitude(properties.alt_baro),
    spd: formatSpeed(properties.gs),
    vrate: formatVerticalRate(properties.baro_rate),
    type: textOrDash(properties.t),
    reg: textOrDash(properties.r),
    category: textOrDash(properties.category),
    squawk: textOrDash(properties.squawk),
  }
}
