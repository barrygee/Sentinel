/**
 * Typed fetch wrappers for `/api/land/feeds/**` — see
 * `docs/plans/land-live-feeds-p0-contract.md` for the exact response shapes.
 *
 * Feed list CRUD itself goes through the generic settings API
 * (`PUT /api/settings/land/feeds`, the whole list); everything else — runtime
 * status, feature snapshots, credentials, the TEST probe — is served from
 * this dedicated router because it isn't a plain settings value.
 */
import * as settingsApi from '@/services/settingsApi'
import type {
  CameraFeatureCollection,
  FeedConfig,
  FeedCredentialInput,
  FeedCredentialStatus,
  FeedTestResult,
  FeedWithStatus,
} from '@/types/landFeeds'

const BASE = '/api/land/feeds'

/** Empty snapshot returned on any read failure, so callers never have to
 *  null-check a feature collection. */
const EMPTY_FEATURE_COLLECTION: CameraFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

/** `GET /api/land/feeds` — every configured feed plus its live status. */
export async function listFeeds(): Promise<FeedWithStatus[]> {
  try {
    const response = await fetch(BASE)
    if (!response.ok) return []
    const payload = (await response.json()) as { feeds?: unknown }
    return Array.isArray(payload.feeds) ? (payload.feeds as FeedWithStatus[]) : []
  } catch {
    return []
  }
}

/** `GET /api/land/feeds/{id}/features` — the feed's latest normalised
 *  GeoJSON snapshot. Empty when the feed is disabled, unknown, or hasn't
 *  fetched yet. */
export async function getFeatures(feedId: string): Promise<CameraFeatureCollection> {
  try {
    const response = await fetch(`${BASE}/${encodeURIComponent(feedId)}/features`)
    if (!response.ok) return EMPTY_FEATURE_COLLECTION
    const payload = (await response.json()) as Partial<CameraFeatureCollection>
    return Array.isArray(payload.features)
      ? { type: 'FeatureCollection', features: payload.features }
      : EMPTY_FEATURE_COLLECTION
  } catch {
    return EMPTY_FEATURE_COLLECTION
  }
}

/**
 * Build the proxied image URL for a camera feature — never the upstream URL
 * itself (that may carry Basic auth or a short-lived token). `cacheBust` adds
 * a query parameter so a `<img>` reload actually re-fetches instead of
 * serving the browser's cache, for the "refreshes while the popup is open"
 * behaviour.
 */
export function imageUrl(feedId: string, ref: string, cacheBust?: number): string {
  const path = `${BASE}/${encodeURIComponent(feedId)}/image/${encodeURIComponent(ref)}`
  return cacheBust === undefined ? path : `${path}?t=${cacheBust}`
}

/** Build the proxied clip (MP4) URL for a camera feature, only meaningful for
 *  providers that expose one (TfL JamCams). */
export function clipUrl(feedId: string, ref: string): string {
  return `${BASE}/${encodeURIComponent(feedId)}/clip/${encodeURIComponent(ref)}`
}

/** `GET /api/land/feeds/{id}/credentials` — whether a secret is stored. */
export async function getCredentialStatus(feedId: string): Promise<FeedCredentialStatus> {
  try {
    const response = await fetch(`${BASE}/${encodeURIComponent(feedId)}/credentials`)
    if (!response.ok) return { configured: false }
    return (await response.json()) as FeedCredentialStatus
  } catch {
    return { configured: false }
  }
}

/** `PUT /api/land/feeds/{id}/credentials` — set/replace the stored secret. */
export async function setCredential(
  feedId: string,
  body: FeedCredentialInput,
): Promise<FeedCredentialStatus> {
  try {
    const response = await fetch(`${BASE}/${encodeURIComponent(feedId)}/credentials`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) return { configured: false }
    return (await response.json()) as FeedCredentialStatus
  } catch {
    return { configured: false }
  }
}

/** `DELETE /api/land/feeds/{id}/credentials` — forget the stored secret. */
export async function clearCredential(feedId: string): Promise<FeedCredentialStatus> {
  try {
    const response = await fetch(`${BASE}/${encodeURIComponent(feedId)}/credentials`, {
      method: 'DELETE',
    })
    if (!response.ok) return { configured: true }
    return (await response.json()) as FeedCredentialStatus
  } catch {
    return { configured: true }
  }
}

/** `POST /api/land/feeds/{id}/test` — probe the feed with its stored
 *  credential (if any) without waiting for the poller's next tick. */
export async function testFeed(feedId: string): Promise<FeedTestResult> {
  try {
    const response = await fetch(`${BASE}/${encodeURIComponent(feedId)}/test`, { method: 'POST' })
    if (!response.ok) return { ok: false, message: 'Test request failed.', featureCount: 0 }
    return (await response.json()) as FeedTestResult
  } catch {
    return { ok: false, message: 'Network error.', featureCount: 0 }
  }
}

/** Persist the whole feed list via the generic settings API — the backend
 *  validates it against `FeedConfig` and the poller resyncs after the write. */
export async function saveFeeds(feeds: FeedConfig[]): Promise<void> {
  await settingsApi.put('land', 'feeds', feeds)
}
