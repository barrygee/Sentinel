import {
  HistoryFramePlayer,
  type HistoryFrameEntity,
} from '@sentinel/shell-api/playback/HistoryFramePlayer'
import type { AdsbApiEntry } from './adsbParse'

/**
 * Air's replay feed: recorded aircraft at the replayed moment, shaped like a
 * live ADS-B snapshot so `AdsbLiveControl` draws them through exactly the
 * path it draws the live feed — filters, tags, trails, selection and the
 * tracking panel all keep working.
 */

/** How long after its last recorded position an aircraft stays on the map: the live map's own limit. */
export const AIR_REPLAY_HOLD_MS = 60_000

/** A frame player over `/api/air/history/samples`. */
export function createAirReplayPlayer(): HistoryFramePlayer {
  return new HistoryFramePlayer({ sectionId: 'air', holdMs: AIR_REPLAY_HOLD_MS })
}

function stringField(extra: Record<string, unknown> | null, key: string): string | undefined {
  const value = extra?.[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * One recorded aircraft as a live-shaped entry. `seen_pos` carries its age at
 * the replayed moment, so the control dates (and dims, and drops) it exactly
 * as it would have live.
 */
export function replayEntryFromFrame(
  entity: HistoryFrameEntity,
  replayedAtMs: number,
): AdsbApiEntry {
  const altBaro = entity.extra?.alt_baro
  return {
    hex: entity.id,
    lat: entity.lat,
    lon: entity.lon,
    alt_baro:
      typeof altBaro === 'number' || typeof altBaro === 'string'
        ? altBaro
        : (entity.alt ?? undefined),
    gs: entity.speed ?? undefined,
    track: entity.heading ?? undefined,
    flight: stringField(entity.extra, 'flight'),
    squawk: stringField(entity.extra, 'squawk'),
    category: stringField(entity.extra, 'category'),
    r: stringField(entity.extra, 'r'),
    t: stringField(entity.extra, 't'),
    seen_pos: Math.max(0, (replayedAtMs - entity.t) / 1000),
  }
}
