/**
 * Wire shapes of the SDR Manager API as this machine's sdr-manager-local
 * serves them under `/api/sdr-manager/local` (ADR 0007), for the THIS MACHINE
 * screens. Field names are the API's own (snake_case, as sent); the backend
 * schemas they mirror live in `sentinel_sdr_manager_local/schemas/`.
 *
 * A device's status builds on the shared `SdrManagerDeviceStatus`
 * (`@sentinel/shell-api/types/sdrManager`), which sdr-manager-remote relays
 * for every host; this machine's screens read the fields the remote view
 * leaves out (the record id, the tuner and processes).
 */
import type {
  SdrManagerDeviceRecord,
  SdrManagerDeviceStatus,
  SdrManagerDeviceTuning,
} from '@sentinel/shell-api/types/sdrManager'

/** What the tuner last reported on the device's control port. */
export interface LocalTunerInfo {
  center_hz: number
  sample_rate: number
  gain_db: number
  gain_auto: boolean
  /** Whether another owner currently holds the tuning token. */
  locked: boolean
  observed_at: number
}

/** One device, as `GET /status`, the `snapshot` and `device_changed` events describe it. */
export interface LocalDeviceStatus extends SdrManagerDeviceStatus {
  /** Null for a detected device that has never been configured. */
  record_id: number | null
  state_since: number
  tuner: LocalTunerInfo | null
  last_seen_at: number | null
}

/** This machine's position, from core's `app.location`; both null until it is set. */
export interface LocalLocation {
  latitude: number | null
  longitude: number | null
}

/** `GET /status`. */
export interface LocalStatusResponse {
  generated_at: number
  location: LocalLocation
  sdrs: LocalDeviceStatus[]
}

/** The port rules `GET /devices` reports, so the port field can check before a round trip. */
export interface LocalPortConstraints {
  port_min: number
  port_max: number
  reserved: number[]
  /** `[start, end)` of the loopback ports rtl_tcp itself uses. */
  internal_range: [number, number]
  /** Every IQ and control port a configured device holds. */
  in_use: number[]
}

/** `GET /devices`. */
export interface LocalDevicesListResponse {
  devices: SdrManagerDeviceRecord[]
  port_suggestion: number | null
  constraints: LocalPortConstraints
}

/** `PATCH /devices/{id}`: every field optional, at least one present. */
export interface LocalDevicePatch extends SdrManagerDeviceTuning {
  name?: string
  description?: string
  notes?: string
  antenna?: string
  output_port?: number
  enabled?: boolean
  visibility?: 'public' | 'private'
}

/** `POST /devices/{id}/serial` answers 202; the outcome arrives later as a `notice`. */
export interface LocalSerialFlashAccepted {
  device_id: string
  operation_id: string
  status: 'in_progress'
  /** Whether the dongle must be unplugged and replugged before the new serial is read. */
  requires_replug: boolean
}

/** `GET /auth/state`: enough to choose between "sign in", "set a password" and carry on. */
export interface LocalAuthState {
  password_set: boolean
  authenticated: boolean
  /** Unix ms the password last changed; 0 if never. */
  updated_at: number
  minimum_password_length: number
}

export type LocalNoticeLevel = 'info' | 'warn' | 'error'

/** The `notice` event. */
export interface LocalNoticeEvent {
  level: LocalNoticeLevel
  code: string
  message: string
  device_id: string | null
  ts: number
}

/** The `device_removed` event: an unconfigured device was unplugged. */
export interface LocalDeviceRemovedEvent {
  device_id: string
  record_id: number | null
}

export type LocalHotspotSecurity = 'wpa2' | 'wpa3'
export type LocalHotspotBand = 'bg' | 'a'

/** The last hotspot command that failed. */
export interface LocalHotspotErrorSummary {
  code: string
  message: string
  ts: number
  stderr_tail: string | null
}

/** `GET /hotspot` and every hotspot action's reply. Never carries the passphrase. */
export interface LocalHotspotState {
  /** Whether access-point control works on this host at all (NetworkManager reachable). */
  available: boolean
  /** Whether the operator has let this API reconfigure the host's Wi-Fi. */
  control_enabled: boolean
  /** Whether a console password is set; a hotspot may not start without one. */
  auth_token_configured: boolean
  configured: boolean
  /** Whether the profile comes up on boot. */
  enabled: boolean
  /** Whether the hotspot is running right now. */
  active: boolean
  interface: string | null
  ssid: string | null
  hidden: boolean
  security: LocalHotspotSecurity
  band: LocalHotspotBand
  channel: number
  gateway_address: string | null
  gateway_cidr: string | null
  passphrase_set: boolean
  /** Whether starting the hotspot takes down this host's own network connection. */
  uplink_interface_is_hotspot_interface: boolean
  /** Whether a change is up on trial and rolls back unless confirmed. */
  pending_confirmation: boolean
  confirm_deadline_ms: number | null
  last_error: LocalHotspotErrorSummary | null
  warnings: string[]
  generated_at: number
}

/** `PUT /hotspot`. Omitting `passphrase` keeps the stored one. */
export interface LocalHotspotConfigRequest {
  ssid: string
  passphrase?: string
  security: LocalHotspotSecurity
  hidden: boolean
  enabled: boolean
  interface: string | null
  band: LocalHotspotBand
  channel: number
  gateway_cidr: string | null
  confirm_uplink_loss: boolean
}

/** One wireless interface `GET /hotspot/interfaces` lists. */
export interface LocalWirelessInterface {
  name: string
  mac_address: string | null
  supports_ap: boolean | null
  state: string
  station_ssid: string | null
  carries_default_route: boolean
  in_use_by: string | null
}

/** One DHCP lease on the hotspot. */
export interface LocalHotspotClient {
  mac_address: string
  ip_address: string
  hostname: string | null
  lease_expires_at_ms: number
  expired: boolean
}

/** `GET /hotspot/clients`: `clients` is null when the lease file can't be read. */
export interface LocalHotspotClientsResponse {
  clients: LocalHotspotClient[] | null
  generated_at: number
}

/** `PUT /hotspot/control`. */
export interface LocalHotspotControlResponse {
  control_enabled: boolean
  forced_by_environment: boolean
}

/**
 * A configuration file as `GET /config` exports it. Kept opaque past its
 * header: the screens show it and send it back, they never edit its fields.
 */
export interface LocalConfigFile {
  version?: number
  generated_at?: number
  sdr_manager_version?: string
  devices?: unknown[]
  hotspot?: unknown
  [key: string]: unknown
}

/** `POST /config`. */
export interface LocalConfigImportRequest {
  config: LocalConfigFile
  apply_devices: boolean
  apply_hotspot: boolean
}

/** How one device in an imported file fared. */
export interface LocalDeviceImportOutcome {
  identity_kind: string
  identity_key: string
  outcome: 'applied' | 'skipped' | 'failed'
  detail: string
}

/** `POST /config`'s reply. */
export interface LocalConfigImportResult {
  devices: LocalDeviceImportOutcome[]
  devices_applied: number
  devices_skipped: number
  devices_failed: number
  hotspot_applied: boolean
  hotspot_detail: string
  console_password_applied: boolean
  console_password_detail: string
  generated_at: number
}
