/**
 * SDR Manager host and device shapes (ADR 0007), shared by the packages that
 * show them: `@sentinel/sdr-manager-remote`, which owns the hosts, and the SDR
 * section, which mirrors their devices into Sentinel's radios. Both read the
 * same wire shapes from `/api/sdr-manager/remote/hosts`; keeping them here
 * means neither package imports the other.
 *
 * Field names are the SDR Manager API's own (snake_case, as sent).
 */

/** One SDR host Sentinel knows about. Never carries the auth token itself. */
export interface SdrManagerHost {
  id: number
  name: string | null
  address: string
  port: number
  enabled: boolean
  auth_token_set: boolean
  /**
   * This machine's own sdr-manager-local, linked by sdr-manager-remote rather
   * than added by the operator: listed as "This machine", only its name can be
   * changed, and it cannot be deleted.
   */
  is_local: boolean
  created_at: number
  last_seen_at: number | null
  last_error: string | null
  reachable: boolean
  api_version: string | null
}

/** Where a host reports itself to be, from its `/api/v1/sdrs` `source.location`. */
export interface SdrManagerHostLocation {
  latitude: number | null
  longitude: number | null
  updated_at: number | null
}

/** A host's own description of itself, from `/api/v1/sdrs`'s `source` block. */
export interface SdrManagerHostSource {
  name: string | null
  version: string | null
  host: string | null
  http_port: number | null
  location: SdrManagerHostLocation | null
}

/**
 * Everything Sentinel knows about one host — `GET /api/sdr-manager/remote/hosts/{id}/info`.
 *
 * A superset of `SdrManagerHost` carrying the poller's telemetry plus a live
 * read of the host's two unauthenticated self-report endpoints: `health` (raw
 * `GET /api/health` body — version, uptime, database/hotplug health, device
 * counts) and `source`/`location` (from `GET /api/v1/sdrs`, the only place the
 * host's latitude/longitude is published).
 *
 * Always resolves for a registered host, reachable or not: an unreachable host
 * comes back with `reachable: false`, a human-readable `detail`, and null live
 * blocks.
 */
export interface SdrManagerHostInfo extends SdrManagerHost {
  detail: string
  last_polled_at: number | null
  last_success_at: number | null
  health: Record<string, unknown> | null
  source: SdrManagerHostSource | null
  location: SdrManagerHostLocation | null
  control_port_offset: number | null
}

/** A device's output ports once the host has allocated/configured them. */
export interface SdrManagerDeviceOutput {
  iq_port: number
  control_port: number
  host: string
}

/** USB identity the host read off the dongle (or last saw, for `usb_last_known`). */
export interface SdrManagerDeviceUsbIdentity {
  manufacturer: string | null
  product: string | null
  serial: string | null
  topology_path: string | null
}

export type SdrManagerDeviceState =
  | 'detected'
  | 'configured'
  | 'starting'
  | 'streaming'
  | 'degraded'
  | 'stopped'
  | 'error'

/**
 * The persisted tuning intent for one device.
 *
 * Field names match the SDR Manager API's `DevicePatch`/`DeviceRecord` schemas
 * exactly — note `sample_rate`, not `sample_rate_hz`, and `gain_auto`, not
 * `agc`. Sentinel's own radio records happen to call the same concept `agc`,
 * which is why the two are easy to confuse; the wire names here are the host's.
 */
export interface SdrManagerDeviceTuning {
  center_hz?: number | null
  sample_rate?: number | null
  gain_db?: number | null
  gain_auto?: boolean
  ppm_correction?: number
  bias_tee?: boolean | null
  direct_sampling?: number | null
}

/**
 * One SDR device as the host reports it in `GET /api/status`'s `sdrs` array.
 *
 * Describes what the device is *doing*, not what it is configured to do:
 * `DeviceStatus` deliberately carries no persisted tuning fields. Those live on
 * `SdrManagerDeviceRecord` and are fetched separately.
 */
export interface SdrManagerDeviceStatus {
  device_id: string
  name: string
  present: boolean
  state: SdrManagerDeviceState
  state_reason: string | null
  enabled: boolean
  visibility: 'public' | 'private'
  notes: string
  antenna: string
  needs_identification: boolean
  output: SdrManagerDeviceOutput | null
  usb: SdrManagerDeviceUsbIdentity | null
  usb_last_known: SdrManagerDeviceUsbIdentity | null
}

/**
 * One device as the host's `GET /api/devices` reports it — the persisted
 * configuration, including the tuning values an edit form needs to pre-fill.
 */
export interface SdrManagerDeviceRecord extends SdrManagerDeviceTuning {
  device_id: string
  record_id: number | null
  name: string
  description: string
  notes: string
  antenna: string
  output_port: number | null
  control_port: number | null
  enabled: boolean
  visibility: 'public' | 'private'
  present: boolean
  state: SdrManagerDeviceState
  needs_identification: boolean
  identity_kind: string
  identity_key: string
  last_serial: string
  last_topology_path: string
}

/** Port rules the host enforces, surfaced so the port field can validate before a round trip. */
export interface SdrManagerPortConstraints {
  min_port: number
  max_port: number
  control_port_offset: number
  reserved_ports: number[]
}

/** Response body of `GET /api/sdr-manager/remote/hosts/{id}/devices/records`. */
export interface SdrManagerDeviceRecordsPayload {
  devices: SdrManagerDeviceRecord[]
  port_suggestion: number | null
  constraints: SdrManagerPortConstraints
}

/** Raw `GET /api/status` body the host returns, cached and relayed verbatim. */
export interface SdrManagerStatusPayload {
  generated_at: number
  sdrs: SdrManagerDeviceStatus[]
}

/** Response for `GET /api/sdr-manager/remote/hosts/{id}/devices` — the poller's cached snapshot. */
export interface SdrManagerDeviceSnapshot {
  reachable: boolean
  last_error: string | null
  last_polled_at: number | null
  last_success_at: number | null
  api_version: string | null
  status: SdrManagerStatusPayload | null
}

/** A partial update forwarded verbatim to the host's `PATCH /api/devices/{id}`. */
export type SdrManagerDevicePatch = Partial<
  Pick<SdrManagerDeviceStatus, 'name' | 'enabled' | 'visibility' | 'notes' | 'antenna'>
> &
  SdrManagerDeviceTuning & { output_port?: number; description?: string }
