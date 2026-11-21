import {
  HistoryFramePlayer,
  type HistoryFrameEntity,
} from '@sentinel/shell-api/playback/HistoryFramePlayer'
import { isVesselFamily } from '../utils/aisShipType'
import type { SeaBbox, SeaVessel } from './sea'

/**
 * Sea's replay feed: recorded vessels at the replayed moment, in the live
 * snapshot's shape, so the store's `vessels` list — and everything that reads
 * it (map, filters, search, labels, the selected-vessel panel) — is the same
 * whether live or replaying.
 */

/** A vessel stays on the map this long after its last recorded report: the live store's retention. */
export const SEA_REPLAY_HOLD_MS = 30 * 60 * 1000

/** A frame player over `/api/sea/history/samples`, limited to the viewport (AIS can be worldwide). */
export function createSeaReplayPlayer(viewport: () => SeaBbox | null): HistoryFramePlayer {
  return new HistoryFramePlayer({
    sectionId: 'sea',
    holdMs: SEA_REPLAY_HOLD_MS,
    // Rounded so a small pan doesn't refetch the whole chunk.
    bbox: () =>
      viewport()
        ?.map((edge) => edge.toFixed(1))
        .join(',') ?? null,
  })
}

function text(extra: Record<string, unknown> | null, key: string): string {
  const value = extra?.[key]
  return typeof value === 'string' ? value : ''
}

function numberOrNull(extra: Record<string, unknown> | null, key: string): number | null {
  const value = extra?.[key]
  return typeof value === 'number' ? value : null
}

/** One recorded vessel as a live-shaped `SeaVessel`, dated by its own report time. */
export function vesselFromFrame(entity: HistoryFrameEntity): SeaVessel {
  const family = text(entity.extra, 'family')
  return {
    mmsi: entity.id,
    name: text(entity.extra, 'name') || `MMSI ${entity.id}`,
    imo: '',
    callsign: text(entity.extra, 'callsign'),
    type: text(entity.extra, 'type'),
    typeLabel: text(entity.extra, 'typeLabel'),
    family: isVesselFamily(family) ? family : 'other',
    destination: text(entity.extra, 'destination'),
    lat: entity.lat,
    lon: entity.lon,
    sog: entity.speed,
    cog: numberOrNull(entity.extra, 'cog') ?? entity.heading,
    heading: entity.heading,
    navStatus: numberOrNull(entity.extra, 'navStatus'),
    lastPositionMs: entity.t,
    lastPositionUtc: new Date(entity.t).toISOString(),
  }
}
