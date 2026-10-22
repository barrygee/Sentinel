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
} from '@sentinel/shell-api/types/sdrManager'

const BASE = '/api/sdr-manager/remote/hosts'

/** Body for `POST /api/sdr-manager/remote/hosts` — register a new host. */
export interface SdrManagerHostCreateInput {
  name?: string | null
  address: string
  port?: number
  auth_token?: string
  enabled?: boolean
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
}

/** Response for `POST /api/sdr-manager/remote/hosts/{id}/test` — always HTTP 200. */
export interface SdrManagerHealthProbeResult {
  reachable: boolean
  detail: string
  api_version?: string | null
  health?: Record<string, unknown> | null
}

/** Extra machine-readable context a host rejection may carry, e.g. `conflicting_device_id`. */
export type SdrManagerErrorContext = Record<string, unknown>

/**
 * Thrown by every mutating call in this module on a non-2xx response. Carries
 * the parsed `{code, message}` from the backend's `{"detail": {...}}`
 * envelope (or FastAPI's own validation-error shape) plus any extra context
 * keys (e.g. `conflicting_device_id` on a `port_conflict`), so a caller can
 * both show `message` verbatim to the operator and branch on `code`/context
 * to highlight the offending field.
 */
export class SdrManagerApiError extends Error {
  readonly status: number
  readonly code: string
  readonly context: SdrManagerErrorContext

  constructor(status: number, code: string, message: string, context: SdrManagerErrorContext = {}) {
    super(message)
    this.name = 'SdrManagerApiError'
    this.status = status
    this.code = code
    this.context = context
  }
}

/** A single FastAPI 422 validation-error entry: `{loc: [...], msg: string}`. */
interface FastApiValidationError {
  loc?: unknown[]
  msg?: unknown
}

/**
 * Parse `{"detail": ...}` into `{code, message, context}`. Mirrors the
 * backend's own `_parse_error_envelope` (`sentinel_sdr_manager_remote/services/sdr_manager_client.py`)
 * so the same three shapes are handled here: the SDR Manager API's own `{code, message}`
 * envelope (proxied verbatim), FastAPI's list-shaped 422 (raised by this
 * router's own Pydantic validation, before ever reaching the host), and a bare
 * string detail.
 */
function parseErrorEnvelope(status: number, body: unknown): SdrManagerApiError {
  const fallbackMessage = `Request failed (HTTP ${status}).`
  if (body === null || typeof body !== 'object' || !('detail' in body)) {
    return new SdrManagerApiError(status, 'unknown_error', fallbackMessage)
  }
  const detail = (body as { detail: unknown }).detail

  if (detail !== null && typeof detail === 'object' && !Array.isArray(detail)) {
    const record = detail as Record<string, unknown>
    const code = typeof record.code === 'string' ? record.code : 'unknown_error'
    const message = typeof record.message === 'string' ? record.message : fallbackMessage
    const context: SdrManagerErrorContext = {}
    for (const [key, value] of Object.entries(record)) {
      if (key !== 'code' && key !== 'message') context[key] = value
    }
    return new SdrManagerApiError(status, code, message, context)
  }

  if (Array.isArray(detail)) {
    const described = (detail as FastApiValidationError[])
      .map((entry) => {
        const message = typeof entry.msg === 'string' ? entry.msg.trim() : ''
        if (!message) return null
        const location = Array.isArray(entry.loc)
          ? entry.loc
              .map((part) => String(part))
              .filter((part) => part !== 'body' && part !== 'query' && part !== 'path')
          : []
        return location.length > 0 ? `${location.join('.')}: ${message}` : message
      })
      .filter((line): line is string => line !== null)
    return new SdrManagerApiError(
      status,
      'validation_error',
      described.length > 0 ? described.join('; ') : fallbackMessage,
      { errors: detail },
    )
  }

  if (typeof detail === 'string') {
    return new SdrManagerApiError(status, 'unknown_error', detail)
  }

  return new SdrManagerApiError(status, 'unknown_error', fallbackMessage)
}

async function requestJson<TResponse>(url: string, init?: RequestInit): Promise<TResponse> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new SdrManagerApiError(0, 'network_error', 'Could not reach Sentinel.')
  }
  if (!response.ok) {
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      /* non-JSON error body — fall through to the generic fallback message */
    }
    throw parseErrorEnvelope(response.status, body)
  }
  if (response.status === 204) return undefined as TResponse
  return (await response.json()) as TResponse
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    /* v8 ignore start -- defensive: every call site in this module always
       passes a body (even an empty patch object); the undefined branch has
       no current caller to exercise it. */
    body: body === undefined ? undefined : JSON.stringify(body),
    /* v8 ignore stop */
  }
}

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
