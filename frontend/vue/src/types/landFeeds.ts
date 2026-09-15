/**
 * Shared types for the Land "live feeds" feature (traffic cameras, traffic
 * data, webcams) — see `docs/plans/land-live-feeds.md` and its P0 contract.
 *
 * Mirrors the backend's `backend/services/land_feeds/schema.py` Pydantic
 * models exactly; keep the two in step when the contract changes.
 */

/** Which map layer/sidebar section a feed's features belong to. */
export type FeedCategory = 'traffic-cameras' | 'traffic-data' | 'webcams'

/** Backend adapter that knows how to poll a feed. P0 allow-list only. */
export type FeedProvider = 'snapshot' | 'durham' | 'tfl-jamcams'

/** How a feed authenticates with its upstream. The secret itself never lives
 *  in the feed config — see {@link FeedCredentialInput}. */
export type FeedAuthType = 'none' | 'basic' | 'apiKey'

/** A feed's declared authentication shape (never the secret itself). */
export interface FeedAuthConfig {
  type: FeedAuthType
  /** Header the API key is sent in, for `type: "apiKey"` feeds that use one. */
  headerName?: string
  /** Query parameter the API key is sent in, e.g. TfL JamCams' `app_key`. */
  queryParam?: string
  /** Whether the key is optional (TfL JamCams works anonymously, at a lower
   *  rate limit, when no key is configured). */
  optional?: boolean
}

/** Required location for a `snapshot` feed — it has no feature list of its
 *  own to derive coordinates from. */
export interface FeedLocation {
  latitude: number
  longitude: number
}

/** A bounding box filter: `[[minLon, minLat], [maxLon, maxLat]]`. */
export type FeedBoundingBox = [[number, number], [number, number]]

/** One configured feed, as stored in `land.feeds[]` via the generic settings
 *  API. Credentials are never part of this shape. */
export interface FeedConfig {
  /** Slug id, `^[a-z0-9][a-z0-9-]{1,39}$`; unique; immutable once created. */
  id: string
  /** Display name, 1-60 characters. */
  name: string
  category: FeedCategory
  provider: FeedProvider
  url: string
  enabled: boolean
  /** Poll interval in seconds; clamped 15-3600 on the backend. */
  refreshSeconds: number
  /** Provider-specific dataset selection; may be empty. */
  datasets: string[]
  bbox: FeedBoundingBox | null
  /** Required for `provider: "snapshot"`; null for every other provider. */
  location: FeedLocation | null
  auth: FeedAuthConfig
}

/** Runtime status the backend reports alongside a feed's config. */
export interface FeedRuntimeStatus {
  lastFetchAt: number | null
  lastError: string | null
  featureCount: number
  credentialConfigured: boolean
  running: boolean
}

/** A feed as returned by `GET /api/land/feeds` — config plus live status. */
export interface FeedWithStatus extends FeedConfig {
  status: FeedRuntimeStatus
}

/** State of one camera feature, decided by the backend from image freshness /
 *  provider availability — the frontend only renders it. */
export type CameraFeatureState = 'live' | 'stale' | 'offline'

/** Properties of one `camera` feature in a feed's GeoJSON snapshot. P0 emits
 *  only this feature kind. */
export interface CameraFeatureProperties {
  kind: 'camera'
  /** `"<feedId>:<providerId>"`, unique across every feed. */
  id: string
  name: string
  description: string
  view: string | null
  /** ISO 8601 UTC, or null if the upstream never reported a time. */
  updatedAt: string | null
  state: CameraFeatureState
  /** Relative, proxied path — never the upstream URL. */
  imageUrl: string | null
  clipUrl: string | null
  externalUrl: string | null
  sourceId: string
  sourceName: string
  attribution: string
}

/** One camera feature in a feed's GeoJSON `FeatureCollection`. */
export interface CameraFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: CameraFeatureProperties
}

/** A feed's normalised snapshot, as returned by `GET
 *  /api/land/feeds/{id}/features`. */
export interface CameraFeatureCollection {
  type: 'FeatureCollection'
  features: CameraFeature[]
}

/** Whether a feed's credential is currently stored server-side. */
export interface FeedCredentialStatus {
  configured: boolean
}

/** Body for `PUT /api/land/feeds/{id}/credentials`; shape must match the
 *  feed's declared `auth.type`. */
export interface FeedCredentialInput {
  username?: string
  password?: string
  apiKey?: string
}

/** Response of `POST /api/land/feeds/{id}/test`. */
export interface FeedTestResult {
  ok: boolean
  message: string
  featureCount: number
}
