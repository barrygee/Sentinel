/**
 * An airport's airband channels as tunable rows for its FILTER accordion.
 */
import type { AirportResult } from './airFilterTypes'

/** One tunable airport channel. */
export interface AirportFreq {
  label: string
  /** The stored text, which may list more than one frequency. */
  display: string
  mode: 'AM'
  /** The primary (first-listed) frequency in Hz. */
  hz: number
}

/**
 * The airport's tower / radar / approach / ATIS channels, skipping any with no
 * usable frequency. All airband voice/ATIS channels are AM. A stored value may
 * hold more than one frequency ("118.500 / 118.700"); the first is the primary
 * we tune to.
 */
export function airportFreqs(airport: AirportResult): AirportFreq[] {
  const channels: [string, string][] = [
    ['Tower', airport.freqs.tower],
    ['Radar', airport.freqs.radar],
    ['Approach', airport.freqs.approach],
    ['ATIS', airport.freqs.atis],
  ]
  const tunable: AirportFreq[] = []
  for (const [label, raw] of channels) {
    const first = (raw || '').split('/')[0].trim()
    const megahertz = parseFloat(first)
    if (isNaN(megahertz) || megahertz <= 0) continue
    tunable.push({ label, display: raw.trim(), mode: 'AM', hz: Math.round(megahertz * 1e6) })
  }
  return tunable
}
