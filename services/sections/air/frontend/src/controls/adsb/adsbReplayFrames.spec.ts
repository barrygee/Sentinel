import { describe, it, expect } from 'vitest'
import {
  HistoryFramePlayer,
  type HistoryFrameEntity,
} from '@sentinel/shell-api/playback/HistoryFramePlayer'
import { AIR_REPLAY_HOLD_MS, createAirReplayPlayer, replayEntryFromFrame } from './adsbReplayFrames'

function entity(overrides: Partial<HistoryFrameEntity> = {}): HistoryFrameEntity {
  return {
    id: 'abc123',
    t: 100_000,
    lat: 51.5,
    lon: -0.1,
    alt: 30000,
    heading: 270,
    speed: 420,
    source: 'online',
    extra: {
      flight: 'BAW1',
      squawk: '7000',
      category: 'A3',
      r: 'G-ABCD',
      t: 'A320',
      alt_baro: 30000,
    },
    ...overrides,
  }
}

describe('adsbReplayFrames', () => {
  it('creates an Air frame player held for a minute, as the live map holds aircraft', () => {
    const player = createAirReplayPlayer()
    expect(player).toBeInstanceOf(HistoryFramePlayer)
    expect(AIR_REPLAY_HOLD_MS).toBe(60_000)
    expect(
      (player as unknown as { options: { sectionId: string; holdMs: number } }).options,
    ).toMatchObject({
      sectionId: 'air',
      holdMs: 60_000,
    })
  })

  it('shapes a recorded aircraft like a live ADS-B entry, aged at the replayed moment', () => {
    expect(replayEntryFromFrame(entity(), 102_500)).toEqual({
      hex: 'abc123',
      lat: 51.5,
      lon: -0.1,
      alt_baro: 30000,
      gs: 420,
      track: 270,
      flight: 'BAW1',
      squawk: '7000',
      category: 'A3',
      r: 'G-ABCD',
      t: 'A320',
      seen_pos: 2.5,
    })
  })

  it('keeps "ground" as the barometric altitude', () => {
    expect(replayEntryFromFrame(entity({ extra: { alt_baro: 'ground' } }), 100_000).alt_baro).toBe(
      'ground',
    )
  })

  it('falls back to the numeric altitude, then to none', () => {
    expect(replayEntryFromFrame(entity({ extra: null, alt: 12000 }), 100_000).alt_baro).toBe(12000)
    expect(
      replayEntryFromFrame(entity({ extra: { alt_baro: true }, alt: null }), 100_000).alt_baro,
    ).toBeUndefined()
  })

  it('leaves unknown fields out rather than inventing them', () => {
    const entry = replayEntryFromFrame(
      entity({ heading: null, speed: null, extra: { flight: 42, squawk: null } }),
      100_000,
    )
    expect(entry.track).toBeUndefined()
    expect(entry.gs).toBeUndefined()
    expect(entry.flight).toBeUndefined()
    expect(entry.squawk).toBeUndefined()
  })

  it('never reports a negative age (a sample interpolated to the moment itself)', () => {
    expect(replayEntryFromFrame(entity({ t: 200_000 }), 100_000).seen_pos).toBe(0)
  })
})
