/**
 * Typed client for `/api/sdr-manager/remote/hosts` — sdr-manager-remote's
 * surface onto the SDR hosts this Sentinel manages (ADR 0007): this machine's
 * own sdr-manager-local and SDR Manager hosts on other machines. One function
 * per route, typed request/response shapes, and — because this surface proxies
 * a second service's rejections — a typed error carrying the parsed
 * `{status, code, message}` envelope so a caller can show the operator
 * exactly what the host said, per the router's doc comment ("surface the
 * host's rejection rather than inventing its own").
 *
 * Every mutating call throws `SdrManagerApiError` on a non-2xx response
 * instead of returning null — callers here (the host and device forms) need
 * the specific rejection message to show inline on the offending field (e.g. a
 * port conflict must name which device holds the port).
 *
 * The host and device shapes live in `@sentinel/shell-api/types/sdrManager`,
 * because the SDR section shows the same devices; the request bodies are this
 * package's alone.
 */
import type { RadioSite } from '@sentinel/shell-api/shell/radioSitesCapability'
import type {
  SdrManagerDevicePatch,
  SdrManagerDeviceRecord,
  SdrManagerDeviceRecordsPayload,
  SdrManagerDeviceSnapshot,
  SdrManagerHost,
  SdrManagerHostInfo,
  SdrManagerTransport,
} from '@sentinel/shell-api/types/sdrManager'

import {
  jsonInit,
  requestJson,
  SdrManagerApiError,
  type SdrManagerErrorContext,
} from '@sentinel/shell-api/services/sdrManagerRequest'

const BASE = '/api/sdr-manager/remote/hosts'

/** Body for `POST /api/sdr-manager/remote/hosts` — register a new host. */
export interface SdrManagerHostCreateInput {
  name?: string | null
  address: string
  port?: number
  auth_token?: string
  enabled?: boolean
  /** Make every public SDR on the host a radio by itself; off when omitted. */
  auto_add_sdrs?: boolean
  /** HTTPS when omitted, which then needs `tls_fingerprint`. */
  transport?: SdrManagerTransport
  /** The certificate authority fingerprint the operator compared (from `previewCertificate`). */
  tls_fingerprint?: string
}

/**
 * Body for `PUT /api/sdr-manager/remote/hosts/{id}` — a patch. Every field is
 * optional; an omitted key keeps the stored value, EXCEPT `name`, where an
 * explicit `null` clears it (send the key with value `null`, not omit it).
 * Omit `auth_token` entirely to keep the currently stored token — the API
 * never returns it, so a caller can't round-trip it anyway.
 */
export interface SdrManagerHostPatchInput {
  name?: string | null
  address?: string
  port?: number
  auth_token?: string
  enabled?: boolean
  auto_add_sdrs?: boolean
  /** A change forgets the trusted certificate authority, as a new address does. */
  transport?: SdrManagerTransport
}

/**
 * What a host presents, from `previewCertificate`/`previewHostCertificate`,
 * for the operator to compare with the fingerprint the host itself shows.
 * `tls_available: false` is a host that serves plain HTTP only.
 */
export interface SdrManagerCertificatePreview {
  tls_available: boolean
  detail: string
  fingerprint?: string | null
  subject?: string | null
  not_valid_after?: string | null
  /** Existing hosts only: whether this is the authority already trusted. */
  matches_pinned?: boolean | null
}

/** Response for `POST /api/sdr-manager/remote/hosts/{id}/test` — always HTTP 200. */
export interface SdrManagerHealthProbeResult {
  reachable: boolean
  detail: string
  api_version?: string | null
  health?: Record<string, unknown> | null
}

export { SdrManagerApiError, type SdrManagerErrorContext }

// ── Host CRUD ────────────────────────────────────────────────────────────────

export async function listHosts(): Promise<SdrManagerHost[]> {
  return requestJson<SdrManagerHost[]>(BASE)
}

/**
 * Every enabled SDR host that reports a position, for plotting on the maps.
 *
 * Served entirely from the backend's poller cache, so it is cheap enough for
 * each domain map to poll while it is open. A host that has gone unreachable
 * keeps its last known position and comes back with `reachable: false` rather
 * than disappearing.
 */
export async function listHostSites(): Promise<RadioSite[]> {
  return requestJson<RadioSite[]>(`${BASE}/locations`)
}

export async function createHost(input: SdrManagerHostCreateInput): Promise<SdrManagerHost> {
  return requestJson<SdrManagerHost>(BASE, jsonInit('POST', input))
}

export async function updateHost(
  hostId: number,
  patch: SdrManagerHostPatchInput,
): Promise<SdrManagerHost> {
  return requestJson<SdrManagerHost>(`${BASE}/${hostId}`, jsonInit('PUT', patch))
}

export async function deleteHost(hostId: number): Promise<void> {
  await requestJson<undefined>(`${BASE}/${hostId}`, { method: 'DELETE' })
}

/**
 * Every known detail of one host, for the details view: the stored record, the
 * poller's telemetry, and a live read of the host's health and `source` blocks.
 *
 * Like `testHost`, never throws for an unreachable host — the backend
 * answers 200 with `reachable: false` — so callers render gaps, not an error.
 */
export async function getHostInfo(hostId: number): Promise<SdrManagerHostInfo> {
  return requestJson<SdrManagerHostInfo>(`${BASE}/${hostId}/info`)
}

/**
 * Probe a host's reachability. Deliberately never throws on an unreachable
 * host — the backend always answers 200 here and reports `reachable: false`
 * instead, so a dead host is a normal result, not an error to catch.
 */
export async function testHost(hostId: number): Promise<SdrManagerHealthProbeResult> {
  return requestJson<SdrManagerHealthProbeResult>(`${BASE}/${hostId}/test`, { method: 'POST' })
}

// ── Certificates (trust on first use) ────────────────────────────────────────

/**
 * Read the certificate authority a host not yet added presents. Stores nothing.
 *
 * @throws SdrManagerApiError (502 `host_unreachable` / `certificate_invalid`)
 */
export async function previewCertificate(input: {
  address: string
  port?: number
}): Promise<SdrManagerCertificatePreview> {
  return requestJson<SdrManagerCertificatePreview>(`${BASE}/certificate`, jsonInit('POST', input))
}

/** Read the certificate authority an existing host presents now. Stores nothing. */
export async function previewHostCertificate(
  hostId: number,
): Promise<SdrManagerCertificatePreview> {
  return requestJson<SdrManagerCertificatePreview>(`${BASE}/${hostId}/certificate`, {
    method: 'POST',
  })
}

/**
 * Trust (pin) a host's certificate authority: the one whose fingerprint the
 * operator compared. The backend reads it again and refuses with 409
 * `certificate_changed` (context `fingerprint`) if it no longer matches.
 */
export async function trustHostCertificate(
  hostId: number,
  fingerprint: string,
): Promise<SdrManagerHost> {
  return requestJson<SdrManagerHost>(
    `${BASE}/${hostId}/certificate`,
    jsonInit('PUT', { fingerprint }),
  )
}

// ── Devices ──────────────────────────────────────────────────────────────────

/** The poller's cached `GET /api/status` snapshot — live presence and state, no tuning. */
export async function getHostDevices(hostId: number): Promise<SdrManagerDeviceSnapshot> {
  return requestJson<SdrManagerDeviceSnapshot>(`${BASE}/${hostId}/devices`)
}

/**
 * The host's persisted device configuration, including the tuning values an edit
 * form must pre-fill.
 *
 * A live round-trip rather than the cached snapshot: the operator is about to
 * edit these values, so they have to be current, and the snapshot does not
 * carry them at all. Fetch when a form opens, not on the poll timer.
 */
export async function getHostDeviceRecords(
  hostId: number,
): Promise<SdrManagerDeviceRecordsPayload> {
  return requestJson<SdrManagerDeviceRecordsPayload>(`${BASE}/${hostId}/devices/records`)
}

/**
 * Apply a partial update. The host answers with a `DeviceRecord` — its persisted
 * configuration, not a `DeviceStatus` — so the caller sees exactly what was
 * stored, including any value the host normalised on the way in.
 */
export async function patchHostDevice(
  hostId: number,
  deviceId: string,
  patch: SdrManagerDevicePatch,
): Promise<SdrManagerDeviceRecord> {
  return requestJson<SdrManagerDeviceRecord>(
    `${BASE}/${hostId}/devices/${encodeURIComponent(deviceId)}`,
    jsonInit('PATCH', patch),
  )
}

export async function deleteHostDevice(hostId: number, deviceId: string): Promise<void> {
  await requestJson<undefined>(`${BASE}/${hostId}/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
  })
}

/**
 * Begin an EEPROM serial flash. Permanent and interruptible — callers must
 * have already obtained explicit operator confirmation before calling this;
 * `confirm: true` is always sent (the backend rejects anything else).
 */
export async function flashHostDeviceSerial(
  hostId: number,
  deviceId: string,
  serial: string,
): Promise<unknown> {
  return requestJson<unknown>(
    `${BASE}/${hostId}/devices/${encodeURIComponent(deviceId)}/serial`,
    jsonInit('POST', { serial, confirm: true }),
  )
}
