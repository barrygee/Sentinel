/**
 * Shared vocabulary and formatting for the UK repeater layer — used by the
 * map control, the FILTER pane and Settings so a band, mode or frequency is
 * spelled the same everywhere.
 */
import type { RepeaterChannel, RepeaterModeCode, RepeaterStation } from '@/types/repeaters'

/** Human label for each ETCC mode letter (the register's own key). */
export const REPEATER_MODE_LABELS: Readonly<Record<RepeaterModeCode, string>> = {
  A: 'FM',
  D: 'D-STAR',
  M: 'DMR',
  F: 'FUSION',
  P: 'P25',
  N: 'NXDN',
  T: 'TV',
  E: 'TETRA',
  X: 'AX25',
  '7': 'M17',
  S: 'DSB',
}

/** Every mode code, in the order the filter chips show them. */
export const REPEATER_MODE_CODES: readonly RepeaterModeCode[] = [
  'A',
  'M',
  'D',
  'F',
  'P',
  'N',
  '7',
  'E',
  'T',
  'X',
  'S',
]

/** Bands the register covers, lowest frequency first — the chip order. */
export const REPEATER_BAND_ORDER: readonly string[] = [
  '10M',
  '6M',
  '4M',
  '2M',
  '70CM',
  '23CM',
  '13CM',
  '9CM',
  '3CM',
]

/**
 * Colour of each band's badge on a repeater's map label, so a site's bands
 * read at a glance the way an aircraft's civil/military or a vessel's family
 * does. Spectrum order — warm at HF through cool at UHF — each ≥ 4.5:1 on the
 * label's black (WCAG AA for the 12px bold badge text).
 */
export const REPEATER_BAND_COLORS: Readonly<Record<string, string>> = {
  '10M': '#ff7a45',
  '6M': '#ffcc33',
  '4M': '#7fe36b',
  '2M': '#33c2ff',
  '70CM': '#c8ff00',
  '23CM': '#c79bff',
  // The microwave bands (a handful of TV repeaters) share one colour: at three
  // sites each they don't earn a hue of their own, and a common one still
  // separates them from the voice bands.
  '13CM': '#ff8ad8',
  '9CM': '#ff8ad8',
  '3CM': '#ff8ad8',
}

/** Badge colour for a band; an unlisted band falls back to white. */
export function repeaterBandColor(band: string): string {
  return REPEATER_BAND_COLORS[band] ?? '#ffffff'
}

/**
 * SDR demodulation mode a repeater tunes with. Every UK voice repeater is
 * narrow-band FM at RF — the digital modes (DMR, D-STAR, Fusion, …) ride on
 * the same channel and are decoded downstream — so NFM is right for all.
 */
export const REPEATER_SDR_MODE = 'NFM' as const

/**
 * Register mode codes the SDR's digital decoder (dsd-fme) can demodulate:
 * D-STAR, DMR, Fusion (YSF), P25 and NXDN. Tuning a channel carrying any of
 * these switches digital decode on; an analogue-only channel switches it off
 * so FM audio is not left muted behind the decoder.
 */
export const DIGITAL_DECODE_MODE_CODES: readonly RepeaterModeCode[] = ['D', 'M', 'F', 'P', 'N']

/** Whether any of a channel's modes is one the SDR digital decoder handles. */
export function channelHasDigitalDecode(channel: Pick<RepeaterChannel, 'modes'>): boolean {
  return channel.modes.some((mode) => DIGITAL_DECODE_MODE_CODES.includes(mode))
}

/** Frequency Manager group repeater frequencies saved from the Land pane are filed under. */
export const REPEATER_FREQUENCY_GROUP_NAME = 'Repeaters'

/** Repeater frequency in Hz for the SDR (the register lists MHz to 4 places). */
export function repeaterMhzToHz(mhz: number): number {
  return Math.round(mhz * 1_000_000)
}

/** Where the data comes from, for the pane's group note. */
export const REPEATER_SOURCE_NAME = 'ukrepeater.net (RSGB ETCC)'
export const REPEATER_SOURCE_URL = 'https://ukrepeater.net/'

/** Label for a mode code; an unknown letter falls back to itself so nothing is hidden. */
export function repeaterModeLabel(code: string): string {
  return (REPEATER_MODE_LABELS as Record<string, string>)[code] ?? code
}

/** "FM · DMR · FUSION" for a channel's mode list ("—" when the register lists none). */
export function formatRepeaterModes(modes: readonly string[]): string {
  return modes.length === 0 ? '—' : modes.map(repeaterModeLabel).join(' · ')
}

/** Frequency in MHz to four decimals, as the register and every rig display it. */
export function formatMhz(mhz: number): string {
  return `${mhz.toFixed(4)} MHz`
}

/** Signed input offset in MHz ("−7.6000 MHz"), "simplex" when input equals output. */
export function formatRepeaterOffset(channel: Pick<RepeaterChannel, 'txMhz' | 'rxMhz'>): string {
  const offsetMhz = channel.rxMhz - channel.txMhz
  if (Math.abs(offsetMhz) < 0.0001) return 'simplex'
  const sign = offsetMhz > 0 ? '+' : '−'
  return `${sign}${Math.abs(offsetMhz).toFixed(4)} MHz`
}

/**
 * CTCSS tone and/or DMR colour code as one short access string ("118.8 Hz ·
 * CC5") — short so it fits a pane cell; the cell's label says what it is.
 */
export function formatRepeaterAccess(
  channel: Pick<RepeaterChannel, 'ctcssHz' | 'dmrColourCode'>,
): string {
  const parts: string[] = []
  if (channel.ctcssHz !== null) parts.push(`${channel.ctcssHz.toFixed(1)} Hz`)
  if (channel.dmrColourCode !== null) parts.push(`CC${channel.dmrColourCode}`)
  return parts.length === 0 ? '—' : parts.join(' · ')
}

/** Sort a station's bands into register order, deduplicated — "2M · 70CM". */
export function stationBands(station: Pick<RepeaterStation, 'channels'>): string[] {
  const bands = new Set(station.channels.map((channel) => channel.band))
  return [...bands].sort(
    (left, right) => bandSortIndex(left) - bandSortIndex(right) || left.localeCompare(right),
  )
}

/** Every distinct mode a station offers across its channels, in chip order. */
export function stationModes(station: Pick<RepeaterStation, 'channels'>): RepeaterModeCode[] {
  const modes = new Set(station.channels.flatMap((channel) => channel.modes))
  return REPEATER_MODE_CODES.filter((code) => modes.has(code))
}

/** Whether every channel of the site is off air — the map dims such sites. */
export function stationOffAir(station: Pick<RepeaterStation, 'channels'>): boolean {
  return station.channels.every((channel) => channel.status === 'NOT OPERATIONAL')
}

function bandSortIndex(band: string): number {
  const index = REPEATER_BAND_ORDER.indexOf(band)
  return index === -1 ? REPEATER_BAND_ORDER.length : index
}

/**
 * Prefix on a repeater's row key in the Land FILTER pane, so a repeater and
 * an APRS station that share a callsign (a keeper beaconing from the site,
 * say) never collide in the one expanded-row slot the pane holds.
 */
export const REPEATER_SEARCH_KEY_PREFIX = 'rpt:'

/** The FILTER-pane row key for a repeater callsign. */
export function repeaterSearchKey(callsign: string): string {
  return `${REPEATER_SEARCH_KEY_PREFIX}${callsign}`
}

/** The callsign behind a FILTER-pane row key, or null if it is not a repeater row. */
export function repeaterCallsignFromSearchKey(key: string): string | null {
  return key.startsWith(REPEATER_SEARCH_KEY_PREFIX)
    ? key.slice(REPEATER_SEARCH_KEY_PREFIX.length)
    : null
}
