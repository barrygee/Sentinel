/**
 * Types for the UK amateur-radio repeater directory served by
 * `GET /api/land/repeaters` (the ukrepeater.net / RSGB ETCC register,
 * normalised by `backend/services/repeaters.py`).
 */

/**
 * Single-letter mode codes as the ETCC register uses them. The labels live in
 * `constants/repeaters.ts` so the map, the pane and the popup all spell a
 * mode the same way.
 */
export type RepeaterModeCode = 'A' | 'D' | 'M' | 'F' | 'P' | 'N' | 'T' | 'E' | 'X' | '7' | 'S'

/** Licence status as the register reports it; blank upstream becomes UNKNOWN. */
export type RepeaterStatus = 'OPERATIONAL' | 'NOT OPERATIONAL' | 'REDUCED OUTPUT' | 'UNKNOWN'

/** One licensed channel of a repeater site — a dual-band site carries two. */
export interface RepeaterChannel {
  /** ETCC register id — stable across refreshes; null if the export omitted it. */
  id: number | null
  /** Band label as the register spells it: "10M", "6M", "4M", "2M", "70CM", "23CM". */
  band: string
  /** UK channel designator (e.g. "RB0", "RV52", "DVU12"), if allocated. */
  channel: string | null
  /** Repeater output — the frequency you listen on. */
  txMhz: number
  /** Repeater input — the frequency you transmit on. */
  rxMhz: number
  modes: RepeaterModeCode[]
  /** CTCSS access tone for the analogue side, if any. */
  ctcssHz: number | null
  /** DMR colour code, if the site carries DMR. */
  dmrColourCode: number | null
  /** Antenna height above ground level, metres. */
  heightMagl: number | null
  /** Effective radiated power, dBW. */
  erpDbw: number | null
  status: RepeaterStatus
}

/** A repeater site: one callsign, one position, one or more channels. */
export interface RepeaterStation {
  callsign: string
  latitude: number
  longitude: number
  /** Maidenhead locator; keepers who asked for site privacy give 4 characters. */
  locator: string | null
  /** Nearest town as the register names it (upper case upstream). */
  location: string | null
  /** Outward postcode (e.g. "NR2"); null when the keeper withheld it. */
  postcode: string | null
  /** ETCC region code (e.g. "EA", "SCOT"). */
  region: string | null
  /** The keeper's callsign. */
  keeper: string | null
  channels: RepeaterChannel[]
}

/** Where the served list came from — see the backend's `X-Cache` ladder. */
export type RepeaterDataSource = 'online' | 'cached' | 'bundled'

/** Response body of `GET /api/land/repeaters`. */
export interface RepeaterDirectory {
  source: RepeaterDataSource
  /** Unix ms the register was last fetched from upstream; null for the bundled snapshot. */
  fetchedAt: number | null
  stations: RepeaterStation[]
}

/** Status narrowing: every site, only sites with a working channel, or only off-air ones. */
export type RepeaterStatusFilter = 'all' | 'operational' | 'offAir'

/**
 * Which repeaters the Land map plots, persisted as `land.repeaterFilters` in
 * the app config. An empty `bands`/`modes` list means "every band"/"every
 * mode" — the chips in the pane show ALL selected.
 */
export interface RepeaterFilters {
  bands: string[]
  modes: RepeaterModeCode[]
  status: RepeaterStatusFilter
}

/**
 * Which fields a repeater's map label shows, persisted as
 * `land.repeaterLabelFields` in the app config. Every field the register
 * carries for a site is switchable, mirroring the aircraft and vessel label
 * settings — the map stays readable at density because the operator decides
 * what matters.
 */
export interface RepeaterLabelFieldMap {
  /** The tower glyph in the label's leading well. */
  symbol: boolean
  callsign: boolean
  /** One colour-coded badge per band the site carries. */
  band: boolean
  /** Nearest town as the register names it. */
  location: boolean
  modes: boolean
  /** Repeater output frequency — what you listen on. */
  output: boolean
  /** Repeater input frequency — what you transmit on. */
  input: boolean
  /** CTCSS tone and/or DMR colour code. */
  tone: boolean
  channel: boolean
  locator: boolean
  keeper: boolean
  status: boolean
}

/** A valid key of {@link RepeaterLabelFieldMap}. */
export type RepeaterLabelField = keyof RepeaterLabelFieldMap
