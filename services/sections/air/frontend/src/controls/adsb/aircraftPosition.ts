/**
 * Where an aircraft is drawn between reports, and how old its last report is.
 *
 * Two rules keep the map honest when data arrives late or not at all:
 *
 * - **Age by observation, not arrival.** A report's time is when it was
 *   observed: the response's arrival, minus how old the server says the
 *   snapshot is (`X-Snapshot-Age-Ms`), minus how long before that the
 *   position was last heard (`seen_pos`). Only durations are subtracted from
 *   the browser's own clock, so a receiver with a wrong clock can't skew it.
 *   A cached snapshot served again therefore keeps its true age, and its
 *   aircraft dim and drop on time instead of looking live.
 * - **Converge on the report, never jump.** Between reports an aircraft is
 *   dead-reckoned along its track. A new report re-anchors it on the reported
 *   position; the gap between where it was drawn and where it really is
 *   shrinks to nothing over `CORRECTION_MS`, so it glides into place.
 * - **Gone means the feed moved on without it.** An aircraft not heard from
 *   for `DIM_AFTER_MS` is drawn dimmed, but it is removed only once the feed
 *   has delivered `GONE_AFTER_MS` of newer snapshots that leave it out. While
 *   the feed itself is silent (an upstream hanging or rate-limiting) nothing is
 *   removed — every aircraft came from the same last snapshot, so removing by
 *   age alone empties the whole map at once. `FEED_SILENCE_LIMIT_MS` bounds
 *   how long a silent feed keeps them up.
 */

/** How long a re-anchored aircraft takes to glide from where it was drawn onto its reported track. */
export const CORRECTION_MS = 2000

/** Not heard from for this long: drawn dimmed. */
export const DIM_AFTER_MS = 45_000

/** Left out of this much newer feed: removed. */
export const GONE_AFTER_MS = 60_000

/** Not heard from for this long, feed or no feed: removed. */
export const FEED_SILENCE_LIMIT_MS = 5 * 60_000

/** The part of an ADS-B report that places an aircraft. */
export interface PositionReport {
  lon: number
  lat: number
  /** Ground speed, knots. */
  gs?: number | undefined
  /** Track over ground, degrees true. */
  track?: number | undefined
}

/** What the map keeps per aircraft to draw it between reports. */
export interface TrackedPosition {
  /** The last reported position (where the aircraft was at `lastSeen`). */
  lon: number
  lat: number
  gs: number
  track: number | null
  /** When the last report was observed, in browser-clock ms. */
  lastSeen: number
  /** Drawn-minus-true offset at the last re-anchor, fading out over CORRECTION_MS. */
  correction?: { lon: number; lat: number; startedAt: number }
}

/** Great-circle position after `elapsedSec` at `gs` knots along `trackDeg`. */
export function deadReckon(
  lon: number,
  lat: number,
  trackDeg: number,
  gs: number,
  elapsedSec: number,
): [number, number] {
  const distNm = gs * (elapsedSec / 3600)
  const angDist = distNm / 3440.065
  const bearRad = (trackDeg * Math.PI) / 180
  const lat1 = (lat * Math.PI) / 180
  const lon1 = (lon * Math.PI) / 180
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) + Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearRad),
  )
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearRad) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
    )
  return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]
}

/**
 * The snapshot's age from the `X-Snapshot-Age-Ms` header, in ms.
 *
 * A missing or malformed header (an older backend, a proxy that strips it)
 * counts as a fresh snapshot — today's behaviour — never as a negative age.
 */
export function snapshotAgeMs(headerValue: string | null): number {
  const age = Number(headerValue)
  return headerValue !== null && Number.isFinite(age) && age > 0 ? age : 0
}

/** When a report was observed, in browser-clock ms (see the module comment). */
export function observedAt(receivedAtMs: number, snapshotAge: number, seenPosSec?: number): number {
  const seenPosMs =
    seenPosSec !== undefined && Number.isFinite(seenPosSec) && seenPosSec > 0
      ? seenPosSec * 1000
      : 0
  return receivedAtMs - snapshotAge - seenPosMs
}

/** Where the aircraft really is now, by its last report alone (no correction). */
function reportedNow(position: TrackedPosition, nowMs: number): [number, number] {
  if (position.track === null || !(position.gs > 0)) return [position.lon, position.lat]
  const elapsedSec = Math.max(0, nowMs - position.lastSeen) / 1000
  return deadReckon(position.lon, position.lat, position.track, position.gs, elapsedSec)
}

/** Where to draw the aircraft now: its reported track plus whatever correction is still fading out. */
export function displayedPosition(position: TrackedPosition, nowMs: number): [number, number] {
  const [lon, lat] = reportedNow(position, nowMs)
  const correction = position.correction
  if (!correction) return [lon, lat]
  const remaining = 1 - Math.min(1, Math.max(0, nowMs - correction.startedAt) / CORRECTION_MS)
  return [lon + correction.lon * remaining, lat + correction.lat * remaining]
}

/** Track a newly reported aircraft at its reported position. */
export function startTracking(report: PositionReport, observedAtMs: number): TrackedPosition {
  return {
    lon: report.lon,
    lat: report.lat,
    gs: report.gs ?? 0,
    track: report.track ?? null,
    lastSeen: observedAtMs,
  }
}

/** Signed longitude difference folded into (-180, 180], so a glide never goes the long way round. */
function longitudeDelta(fromLon: number, toLon: number): number {
  const delta = ((((fromLon - toLon) % 360) + 540) % 360) - 180
  return delta === -180 ? 180 : delta
}

/**
 * Re-anchor a tracked aircraft on a newer report.
 *
 * Returns null when the report is not newer than what is already held (a
 * cached snapshot served again): it carries nothing new, so the aircraft keeps
 * its age and position rather than being refreshed by old data.
 */
export function reanchor(
  position: TrackedPosition,
  report: PositionReport,
  observedAtMs: number,
  nowMs: number,
): TrackedPosition | null {
  if (observedAtMs <= position.lastSeen) return null
  const [drawnLon, drawnLat] = displayedPosition(position, nowMs)
  const next = startTracking(report, observedAtMs)
  const [trueLon, trueLat] = reportedNow(next, nowMs)
  next.correction = {
    lon: longitudeDelta(drawnLon, trueLon),
    lat: drawnLat - trueLat,
    startedAt: nowMs,
  }
  return next
}

/** Whether the aircraft has gone unheard long enough to be drawn dimmed. */
export function isStale(position: TrackedPosition, nowMs: number): boolean {
  return nowMs - position.lastSeen >= DIM_AFTER_MS
}

/**
 * Whether the aircraft should leave the map.
 *
 * `feedObservedAtMs` is the observation time of the newest snapshot received,
 * so `feedObservedAtMs - lastSeen` is how much newer feed has left it out.
 */
export function isGone(
  position: TrackedPosition,
  feedObservedAtMs: number,
  nowMs: number,
): boolean {
  return (
    feedObservedAtMs - position.lastSeen >= GONE_AFTER_MS ||
    nowMs - position.lastSeen >= FEED_SILENCE_LIMIT_MS
  )
}
