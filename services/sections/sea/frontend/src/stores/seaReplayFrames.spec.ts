import { describe, it, expect } from 'vitest'
import {
  HistoryFramePlayer,
  type HistoryFrameEntity,
} from '@sentinel/shell-api/playback/HistoryFramePlayer'
import { SEA_REPLAY_HOLD_MS, createSeaReplayPlayer, vesselFromFrame } from './seaReplayFrames'
import type { SeaBbox } from './sea'

function entity(overrides: Partial<HistoryFrameEntity> = {}): HistoryFrameEntity {
  return {
    id: '232012345',
    t: Date.UTC(2026, 8, 12, 8, 41, 3),
    lat: 51.07,
    lon: 1.42,
    alt: null,
    heading: 121,
    speed: 18.4,
    source: 'online',
    extra: {
      name: 'PRIDE OF KENT',
      type: '60',
      typeLabel: 'PASSENGER',
      family: 'passenger',
      navStatus: 0,
      cog: 122,
      destination: 'CALAIS',
      callsign: 'GBRX',
    },
    ...overrides,
  }
}

type PlayerOptions = { sectionId: string; holdMs: number; bbox: () => string | null }
const optionsOf = (player: HistoryFramePlayer) =>
  (player as unknown as { options: PlayerOptions }).options

describe('seaReplayFrames', () => {
  it('creates a Sea frame player held for half an hour', () => {
    const player = createSeaReplayPlayer(() => null)
    expect(player).toBeInstanceOf(HistoryFramePlayer)
    expect(optionsOf(player)).toMatchObject({ sectionId: 'sea', holdMs: SEA_REPLAY_HOLD_MS })
    expect(SEA_REPLAY_HOLD_MS).toBe(30 * 60 * 1000)
  })

  it('limits the player to the viewport, rounded so a small pan reuses the chunk', () => {
    let viewport: SeaBbox | null = [50.04, -1.26, 51.96, 1.04]
    const player = createSeaReplayPlayer(() => viewport)
    expect(optionsOf(player).bbox()).toBe('50.0,-1.3,52.0,1.0')
    viewport = null
    expect(optionsOf(player).bbox()).toBeNull()
  })

  it('shapes a recorded vessel like a live one', () => {
    expect(vesselFromFrame(entity())).toEqual({
      mmsi: '232012345',
      name: 'PRIDE OF KENT',
      imo: '',
      callsign: 'GBRX',
      type: '60',
      typeLabel: 'PASSENGER',
      family: 'passenger',
      destination: 'CALAIS',
      lat: 51.07,
      lon: 1.42,
      sog: 18.4,
      cog: 122,
      heading: 121,
      navStatus: 0,
      lastPositionMs: Date.UTC(2026, 8, 12, 8, 41, 3),
      lastPositionUtc: '2026-09-12T08:41:03.000Z',
    })
  })

  it('fills sensible blanks for a vessel recorded without static data', () => {
    const vessel = vesselFromFrame(entity({ extra: null, heading: 45, speed: null }))
    expect(vessel).toMatchObject({
      name: 'MMSI 232012345',
      callsign: '',
      type: '',
      typeLabel: '',
      family: 'other',
      destination: '',
      cog: 45,
      sog: null,
      navStatus: null,
    })
  })

  it('an unknown family is "other"', () => {
    expect(vesselFromFrame(entity({ extra: { family: 'spaceship' } })).family).toBe('other')
  })
})
