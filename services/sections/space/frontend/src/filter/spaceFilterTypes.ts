/** Shapes shared by the Space FILTER pane and its `filter/` modules. */

/** One satellite from `/api/space/tle/list`, with its radio fields. */
export interface SatEntry {
  norad_id: string
  name: string
  category: string | null
  updated_at: number | null
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

/**
 * An upcoming pass of another auto-tune-armed satellite: only the fields the
 * overlap test needs, tagged with the satellite it belongs to.
 */
export interface ArmedPass {
  norad_id: string
  name: string
  aos_unix_ms: number
  los_unix_ms: number
}
