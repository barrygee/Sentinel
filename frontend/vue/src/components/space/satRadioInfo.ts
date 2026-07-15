/**
 * Shared satellite RADIO-info helpers — the amateur-radio fields
 * (uplink/downlink/beacon frequencies, transponder, packet and status notes)
 * that both the Space search results (`SpaceFilter.vue`, whose `SatEntry`
 * rows come from the satellite DB) and the upcoming-passes list
 * (`SpacePasses.vue`, whose `SatPass` rows come from the pass predictor)
 * render identically. Extracted from (not a rewrite of) the byte-identical
 * function copies those two components each carried.
 */

/**
 * The radio-related fields shared by `SpaceFilter`'s `SatEntry` and
 * `SpacePasses`' `SatPass` (both are structurally assignable). All fields are
 * optional/nullable — most satellites carry only a subset.
 */
export interface SatRadioInfo {
  uplink_hz?: number | null
  uplink_mode?: string | null
  downlink_hz?: number | null
  downlink_mode?: string | null
  ctcss_hz?: number | null
  transponder_type?: string | null
  beacon_hz?: number | null
  packet_info?: string | null
  radio_status?: string | null
  radio_notes?: string | null
}

/** Format a frequency with an auto-scaled GHz/MHz/kHz/Hz unit (3 dp). */
export function formatHz(hz: number | null | undefined): string {
  if (hz == null) return '—'
  if (hz >= 1_000_000_000) return (hz / 1_000_000_000).toFixed(3) + ' GHz'
  if (hz >= 1_000_000) return (hz / 1_000_000).toFixed(3) + ' MHz'
  if (hz >= 1_000) return (hz / 1_000).toFixed(3) + ' kHz'
  return String(hz) + ' Hz'
}

/** Whether a satellite carries any radio info worth rendering a section for. */
export function hasRadioInfo(sat: SatRadioInfo): boolean {
  return !!(
    sat.uplink_hz ||
    sat.downlink_hz ||
    sat.beacon_hz ||
    sat.transponder_type ||
    sat.packet_info ||
    sat.radio_status ||
    sat.radio_notes
  )
}

/** Split a semicolon-separated notes blob into trimmed, non-empty lines. */
export function splitNotes(s: string | null | undefined): string[] {
  if (!s) return []
  return s
    .split(/\s*;\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
}

/** Normalise a radio status blob (ACTIVE/active/…) to sentence case. */
export function formatStatus(s: string | null | undefined): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
