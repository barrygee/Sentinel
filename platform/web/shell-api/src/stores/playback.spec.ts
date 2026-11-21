import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlaybackStore } from './playback'
import { DAY_MS, DEFAULT_REPLAY_OFFSET_MS } from '../playback/playbackSections'

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0)

describe('playback store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts every section live, not recording, a week wide, at 1×', () => {
    const playback = usePlaybackStore()
    for (const section of ['air', 'sea', 'land', 'space'] as const) {
      expect(playback.sections[section]).toEqual({
        historyEnabled: false,
        retentionDays: 7,
        mode: 'live',
        cursorMs: 0,
        playing: false,
        rate: 1,
        seekVersion: 0,
      })
    }
  })

  it('reads the wall clock while live and the cursor while replaying', () => {
    const playback = usePlaybackStore()
    expect(playback.now('air')).toBe(NOW)
    expect(playback.isReplaying('air')).toBe(false)
    playback.enterReplay('air', NOW - 5000)
    expect(playback.now('air')).toBe(NOW - 5000)
    expect(playback.isReplaying('air')).toBe(true)
    // Other sections stay live.
    expect(playback.now('sea')).toBe(NOW)
  })

  it('reaches back the retention window', () => {
    const playback = usePlaybackStore()
    playback.setRetentionDays('land', 2)
    expect(playback.rangeStartMs('land')).toBe(NOW - 2 * DAY_MS)
    expect(playback.rangeStartMs('land', NOW + 1000)).toBe(NOW + 1000 - 2 * DAY_MS)
  })

  describe('applyHistorySettings', () => {
    it('adopts the stored switch and clamped retention', () => {
      const playback = usePlaybackStore()
      playback.applyHistorySettings('sea', { historyEnabled: true, historyRetentionDays: 30 })
      expect(playback.sections.sea.historyEnabled).toBe(true)
      expect(playback.sections.sea.retentionDays).toBe(7)
    })

    it('treats a missing namespace as off with the default window', () => {
      const playback = usePlaybackStore()
      playback.applyHistorySettings('sea', undefined)
      expect(playback.sections.sea.historyEnabled).toBe(false)
      expect(playback.sections.sea.retentionDays).toBe(7)
    })

    it('only a true switch counts as on', () => {
      const playback = usePlaybackStore()
      playback.applyHistorySettings('sea', { historyEnabled: 'yes' })
      expect(playback.sections.sea.historyEnabled).toBe(false)
    })

    it('turning recording off while replaying returns the section to live', () => {
      const playback = usePlaybackStore()
      playback.applyHistorySettings('air', { historyEnabled: true })
      playback.enterReplay('air')
      playback.setPlaying('air', true)
      playback.applyHistorySettings('air', { historyEnabled: false })
      expect(playback.sections.air.mode).toBe('live')
      expect(playback.sections.air.playing).toBe(false)
    })
  })

  describe('setHistoryEnabled', () => {
    it('mirrors the switch', () => {
      const playback = usePlaybackStore()
      playback.setHistoryEnabled('land', true)
      expect(playback.sections.land.historyEnabled).toBe(true)
    })

    it('switching off mid-replay returns to live', () => {
      const playback = usePlaybackStore()
      playback.setHistoryEnabled('land', true)
      playback.enterReplay('land')
      playback.setHistoryEnabled('land', false)
      expect(playback.sections.land.mode).toBe('live')
    })

    it('switching off while live stays live', () => {
      const playback = usePlaybackStore()
      playback.setHistoryEnabled('land', false)
      expect(playback.sections.land.mode).toBe('live')
    })
  })

  describe('entering and leaving replay', () => {
    it('opens an hour back, paused, and counts it as a jump', () => {
      const playback = usePlaybackStore()
      playback.enterReplay('air')
      expect(playback.sections.air).toMatchObject({
        mode: 'replay',
        playing: false,
        cursorMs: NOW - DEFAULT_REPLAY_OFFSET_MS,
        seekVersion: 1,
      })
    })

    it('clamps a requested moment to the window', () => {
      const playback = usePlaybackStore()
      playback.enterReplay('air', NOW - 30 * DAY_MS)
      expect(playback.sections.air.cursorMs).toBe(NOW - 7 * DAY_MS)
      playback.enterReplay('sea', NOW + DAY_MS)
      expect(playback.sections.sea.cursorMs).toBe(NOW)
    })

    it('leaving stops playback and goes live', () => {
      const playback = usePlaybackStore()
      playback.enterReplay('air')
      playback.setPlaying('air', true)
      playback.exitReplay('air')
      expect(playback.sections.air.mode).toBe('live')
      expect(playback.sections.air.playing).toBe(false)
    })
  })

  describe('seek and step', () => {
    it('jumps within the window and bumps the jump counter', () => {
      const playback = usePlaybackStore()
      playback.enterReplay('air')
      playback.seek('air', NOW - DAY_MS)
      expect(playback.sections.air.cursorMs).toBe(NOW - DAY_MS)
      expect(playback.sections.air.seekVersion).toBe(2)
      playback.step('air', -60_000)
      expect(playback.sections.air.cursorMs).toBe(NOW - DAY_MS - 60_000)
      expect(playback.sections.air.seekVersion).toBe(3)
    })

    it('clamps to now and to the oldest moment', () => {
      const playback = usePlaybackStore()
      playback.enterReplay('air')
      playback.seek('air', NOW + 5000)
      expect(playback.sections.air.cursorMs).toBe(NOW)
      playback.seek('air', 0)
      expect(playback.sections.air.cursorMs).toBe(NOW - 7 * DAY_MS)
    })

    it('does nothing while live', () => {
      const playback = usePlaybackStore()
      playback.seek('air', NOW - 1000)
      playback.step('air', 1000)
      expect(playback.sections.air.cursorMs).toBe(0)
      expect(playback.sections.air.seekVersion).toBe(0)
    })
  })

  describe('play state and rate', () => {
    it('plays and pauses only in replay', () => {
      const playback = usePlaybackStore()
      playback.setPlaying('air', true)
      expect(playback.sections.air.playing).toBe(false)
      playback.enterReplay('air')
      playback.setPlaying('air', true)
      expect(playback.sections.air.playing).toBe(true)
      playback.setPlaying('air', false)
      expect(playback.sections.air.playing).toBe(false)
    })

    it('accepts only the offered speeds', () => {
      const playback = usePlaybackStore()
      playback.setRate('air', 60)
      expect(playback.sections.air.rate).toBe(60)
      playback.setRate('air', 7 as never)
      expect(playback.sections.air.rate).toBe(60)
    })
  })

  describe('advance', () => {
    it('moves a playing cursor by elapsed time × speed', () => {
      const playback = usePlaybackStore()
      playback.enterReplay('air', NOW - DAY_MS)
      playback.setRate('air', 60)
      playback.setPlaying('air', true)
      playback.advance('air', 1000)
      expect(playback.sections.air.cursorMs).toBe(NOW - DAY_MS + 60_000)
      // Advancing is playback, not a jump.
      expect(playback.sections.air.seekVersion).toBe(1)
    })

    it('reaching the present returns to live', () => {
      const playback = usePlaybackStore()
      playback.enterReplay('air', NOW - 10_000)
      playback.setRate('air', 10)
      playback.setPlaying('air', true)
      playback.advance('air', 1000)
      expect(playback.sections.air.mode).toBe('live')
      expect(playback.sections.air.playing).toBe(false)
    })

    it.each([
      ['live', false, 1000],
      ['paused', false, 1000],
      ['no time passed', true, 0],
      ['time went backwards', true, -5],
    ])('does nothing when %s', (_label, playing, elapsed) => {
      const playback = usePlaybackStore()
      if (_label !== 'live') playback.enterReplay('air', NOW - DAY_MS)
      playback.setPlaying('air', playing)
      const before = playback.sections.air.cursorMs
      playback.advance('air', elapsed)
      expect(playback.sections.air.cursorMs).toBe(before)
    })
  })
})
