/**
 * Shapes the SDR store holds and its callers pass around: radios, stored
 * frequencies and groups, tuning modes, spectrum frames and decoded events.
 * Re-exported from `stores/sdr` so existing imports keep working.
 */

export interface SdrRadio {
  id: number
  name: string
  host: string
  port: number
  enabled: boolean
  description?: string
  bandwidth?: number | null
  rf_gain?: number | null
  agc?: boolean | null
  // SDR host mirror fields (ADR-0009). `sdr_manager_host_id` is null for a radio the
  // operator typed in by hand; when set, this radio mirrors one device on
  // that SDR host (`sdr_manager_device_id`, e.g. "usb:1-1.4.2" or "serial:AIS-01").
  sdr_manager_host_id?: number | null
  sdr_manager_device_id?: string | null
  notes?: string
  antenna?: string
  // A 'private' device still runs and holds its port but is hidden from the
  // operational radio list (SdrDeviceSelector filters it out) — see ADR-0009.
  visibility?: 'public' | 'private'
  // Where a radio added by IP and port is, so maps show it (both or neither).
  latitude?: number | null
  longitude?: number | null
  // Whether the backend can currently reach this radio's device (a mirrored
  // dongle unplugged, or its SDR host down, reports false) and why not.
  device_available?: boolean
  unavailable_reason?: string
}

export interface SdrFrequencyGroup {
  id: number
  name: string
  slug: string
  color: string
  sort_order: number
}

export interface SdrStoredFrequency {
  id: number
  // Legacy single-group id (kept for callers that only need one group);
  // `group_ids` is the current many-to-many representation returned by the
  // backend and is what the Frequency Manager's group filtering/editing uses.
  group_id: number | null
  group_ids?: number[]
  label: string
  frequency_hz: number
  mode: string
  // Per-frequency tuning settings, applied when the frequency is clicked or a
  // scan stops on it. bandwidth/sample_rate may be null (fall back to the live
  // / per-mode default); the rest carry concrete values.
  squelch?: number
  gain?: number
  bandwidth?: number | null
  sample_rate?: number | null
  volume?: number
  zoom?: number
  zmin?: number
  zmax?: number
  scannable?: boolean
  // Whether the user has starred this frequency for the RADIO panel's
  // FAVOURITES accordion. Optional (not `boolean`) so pre-migration payloads
  // — rows fetched before the backend column existed — still narrow cleanly,
  // matching how `scannable?` is declared.
  favourite?: boolean
  notes?: string
}

export type SdrMode = 'NFM' | 'WFM' | 'AM' | 'USB' | 'LSB' | 'CW'

export type SdrTab = 'radio' | 'frequency-manager' | 'search-ranges' | 'groups' | 'recordings'

export interface SdrSpectrumFrame {
  bins: number[]
  center_hz: number
  sample_rate: number
  ts: number
}

// A decoded digital event relayed from the dsd-fme sidecar via the backend.
// All call fields are optional — a single dsd-fme log line may carry any subset.
export interface DecodeEvent {
  type: string
  mode?: string
  talkgroup?: number
  source?: number
  color_code?: number
  sync?: boolean
  decoder_reachable?: boolean
  vocoder?: string
  // Measured playback rate (Hz) for decoded voice, reported by the backend on
  // `decode_status` frames (see DigitalDecodeBridge._measure_audio_rate). The
  // decode-audio player schedules PCM at this rate. Present once measured.
  audio_sample_rate?: number
  // Present only on `type: "log"` frames — one raw dsd-fme output line.
  line?: string
  // Present only on `type: "aprs"` frames (APRS packet decode). The source
  // callsign, decoded position, and optional movement/status fields; the same
  // shape the Land map plots. `raw` is the TNC2 packet the fix was parsed from.
  from?: string
  latitude?: number
  longitude?: number
  symbol?: string
  comment?: string
  course?: number
  speed?: number
  altitude?: number
  path?: string
  raw?: string
  ts: number
}
