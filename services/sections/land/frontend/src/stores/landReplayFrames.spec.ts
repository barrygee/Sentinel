import { describe, it, expect } from 'vitest'
import {
  HistoryFramePlayer,
  type HistoryFrameEntity,
} from '@sentinel/shell-api/playback/HistoryFramePlayer'
import { createLandReplayPlayer, stationFromFrame } from './landReplayFrames'

type PlayerOptions = { sectionId: string; holdMs: number; maxInterpolationGapMs: number }
const optionsOf = (player: HistoryFramePlayer) =>
  (player as unknown as { options: PlayerOptions }).options

function entity(overrides: Partial<HistoryFrameEntity> = {}): HistoryFrameEntity {
  return {
    id: 'M0ABC-9',
    t: 1_000_000,
    lat: 51.5,
    lon: -0.1,
    alt: 120,
    heading: 90,
    speed: 30,
    source: 'offgrid',
    extra: { symbol: '/>', comment: 'on the road', path: 'WIDE1-1' },
    ...overrides,
  }
}

describe('landReplayFrames', () => {
  it('holds a station for the live retention and never slides it along a guessed line', () => {
    const player = createLandReplayPlayer(5)
    expect(player).toBeInstanceOf(HistoryFramePlayer)
    expect(optionsOf(player)).toMatchObject({
      sectionId: 'land',
      holdMs: 5 * 60_000,
      maxInterpolationGapMs: 0,
    })
  })

  it.each([
    [60, 30 * 60_000], // capped at the server's 30-minute lookback
    [0, 60_000], // at least a minute
    [-5, 60_000],
  ])('retention of %d minutes holds for %d ms', (minutes, holdMs) => {
    expect(optionsOf(createLandReplayPlayer(minutes)).holdMs).toBe(holdMs)
  })

  it('shapes a recorded fix like a live station', () => {
    expect(stationFromFrame(entity())).toEqual({
      callsign: 'M0ABC-9',
      latitude: 51.5,
      longitude: -0.1,
      symbol: '/>',
      comment: 'on the road',
      course: 90,
      speed: 30,
      altitude: 120,
      path: 'WIDE1-1',
      raw: null,
      last_heard_ms: 1_000_000,
    })
  })

  it('missing or odd text fields are null', () => {
    expect(stationFromFrame(entity({ extra: { symbol: 5 } }))).toMatchObject({
      symbol: null,
      comment: null,
      path: null,
    })
    expect(stationFromFrame(entity({ extra: null })).symbol).toBeNull()
  })
})
