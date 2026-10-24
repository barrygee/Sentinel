/**
 * Requests to the SDR Manager surfaces (ADR 0007) — sdr-manager-remote's
 * `/api/sdr-manager/remote` and sdr-manager-local's `/api/sdr-manager/local` —
 * and the typed error both throw on a non-2xx response.
 *
 * Shared because both packages show a host's own rejection to the operator
 * verbatim (a port conflict must name the device that holds the port), so
 * both parse the same `{"detail": {...}}` envelope the same way.
 */

/** Extra machine-readable context a host rejection may carry, e.g. `conflicting_device_id`. */
export type SdrManagerErrorContext = Record<string, unknown>

/**
 * Thrown by `requestJson` on a non-2xx response or an unreachable server. Carries
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
 * envelope (proxied verbatim by sdr-manager-remote), FastAPI's list-shaped
 * 422 (a request body that failed validation; the SDR Manager API never echoes
 * the rejected value), and a bare string detail.
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

/**
 * Fetch `url` and parse its JSON body (`undefined` for a 204).
 *
 * @throws SdrManagerApiError on a non-2xx response, or with status 0 and code
 *   `network_error` when the request never got an answer.
 */
export async function requestJson<TResponse>(url: string, init?: RequestInit): Promise<TResponse> {
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

/** `RequestInit` for a JSON request: the method, the content type and the serialised body. */
export function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    // A bodiless POST (sign out, confirm the hotspot) sends no body at all.
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}
