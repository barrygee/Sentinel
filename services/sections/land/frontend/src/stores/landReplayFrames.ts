import {
  HistoryFramePlayer,
  type HistoryFrameEntity,
} from '@sentinel/shell-api/playback/HistoryFramePlayer'
import type { AprsStation } from './land'

/**
 * Land's replay feed: recorded APRS stations at the replayed moment, in the
 * live list's shape, so the station markers, labels, search and the
 * screen-reader station table all read the same store either way.
 */

/** The server's replay lookback: no station older than this before the moment can be returned. */
const LAND_REPLAY_LOOKBACK_MS = 30 * 60 * 1000

/**
 * A frame player over `/api/land/history/samples`. A station stays on the
 * map for the live retention setting after its last fix, as it would have
 * live (up to the server's 30-minute lookback).
 */
export function createLandReplayPlayer(retentionMinutes: number): HistoryFramePlayer {
  return new HistoryFramePlayer({
    sectionId: 'land',
    holdMs: Math.min(LAND_REPLAY_LOOKBACK_MS, Math.max(1, retentionMinutes) * 60_000),
    // APRS fixes are minutes apart and a station's next one may be anywhere:
    // hold each fix rather than sliding it along a guessed line.
    maxInterpolationGapMs: 0,
  })
}

function textOrNull(extra: Record<string, unknown> | null, key: string): string | null {
  const value = extra?.[key]
  return typeof value === 'string' ? value : null
}

/** One recorded station fix as a live-shaped `AprsStation`. */
export function stationFromFrame(entity: HistoryFrameEntity): AprsStation {
  return {
    callsign: entity.id,
    latitude: entity.lat,
    longitude: entity.lon,
    symbol: textOrNull(entity.extra, 'symbol'),
    comment: textOrNull(entity.extra, 'comment'),
    course: entity.heading,
    speed: entity.speed,
    altitude: entity.alt,
    path: textOrNull(entity.extra, 'path'),
    raw: null,
    last_heard_ms: entity.t,
  }
}
