/**
 * Client for the Sea domain's own endpoints (`/api/sea/*`) — the AISStream
 * key (a secret, kept off the generic settings API) and the feed status.
 * The vessel snapshot itself is polled by the Sea store.
 */
import type { SeaFeedInfo } from '@/stores/sea'

const BASE = '/api/sea'

/** What GET /api/sea/ais-key reports: never the key, only whether one exists. */
export interface AisKeyStatus {
  configured: boolean
  source: 'settings' | 'env' | null
  fingerprint: string | null
}

/** The outcome of a write; `error` is operator-readable. */
export type WriteResult = { ok: true } | { ok: false; error: string }

/** Whether an AISStream key is configured and where it came from. */
export async function getAisKeyStatus(): Promise<AisKeyStatus> {
  try {
    const res = await fetch(`${BASE}/ais-key`, { cache: 'no-store' })
    if (!res.ok) return { configured: false, source: null, fingerprint: null }
    return (await res.json()) as AisKeyStatus
  } catch {
    return { configured: false, source: null, fingerprint: null }
  }
}

/** Save (or replace) the AISStream key. Takes effect on the next watchdog tick. */
export async function putAisKey(key: string): Promise<WriteResult> {
  try {
    const res = await fetch(`${BASE}/ais-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    if (res.ok) return { ok: true }
    return { ok: false, error: await readError(res, 'Could not save the key') }
  } catch {
    return { ok: false, error: 'Could not reach the Sentinel backend' }
  }
}

/** Forget the saved key; a `.env` key, if any, applies again. */
export async function deleteAisKey(): Promise<WriteResult> {
  try {
    const res = await fetch(`${BASE}/ais-key`, { method: 'DELETE' })
    if (res.ok) return { ok: true }
    return { ok: false, error: await readError(res, 'Could not forget the key') }
  } catch {
    return { ok: false, error: 'Could not reach the Sentinel backend' }
  }
}

/** The feed's current health, or null when the backend cannot be reached. */
export async function getFeedStatus(): Promise<SeaFeedInfo | null> {
  try {
    const res = await fetch(`${BASE}/status`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as SeaFeedInfo
  } catch {
    return null
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown }
    if (typeof body.detail === 'string' && body.detail) return body.detail
  } catch {
    /* non-JSON error body */
  }
  return `${fallback} (HTTP ${res.status})`
}
