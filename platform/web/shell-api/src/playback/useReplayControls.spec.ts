import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { REPLAY_STEP_MS, useReplayControls } from './useReplayControls'
import { usePlaybackStore } from '../stores/playback'
import { DEFAULT_REPLAY_OFFSET_MS } from './playbackSections'

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0)

describe('useReplayControls', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('seeking from live starts replay at that moment; seeking in replay jumps', () => {
    const controls = useReplayControls('air')
    const playback = usePlaybackStore()
    controls.seek(NOW - 3_600_000)
    expect(controls.replaying.value).toBe(true)
    expect(playback.sections.air.cursorMs).toBe(NOW - 3_600_000)
    controls.seek(NOW - 7_200_000)
    expect(playback.sections.air.cursorMs).toBe(NOW - 7_200_000)
    expect(playback.sections.air.seekVersion).toBe(2)
  })

  it('stepping back from live starts a minute ago; in replay it steps from the moment', () => {
    const controls = useReplayControls('sea')
    const playback = usePlaybackStore()
    controls.step(-REPLAY_STEP_MS)
    expect(playback.sections.sea.cursorMs).toBe(NOW - 60_000)
    controls.step(-REPLAY_STEP_MS)
    expect(playback.sections.sea.cursorMs).toBe(NOW - 120_000)
    controls.step(REPLAY_STEP_MS)
    expect(playback.sections.sea.cursorMs).toBe(NOW - 60_000)
  })

  it('stepping forward from live stays at now (clamped) in replay', () => {
    const controls = useReplayControls('sea')
    controls.step(REPLAY_STEP_MS)
    expect(usePlaybackStore().sections.sea.cursorMs).toBe(NOW)
  })

  it('play from live starts playing an hour back; then it toggles', () => {
    const controls = useReplayControls('land')
    const playback = usePlaybackStore()
    controls.togglePlaying()
    expect(playback.sections.land).toMatchObject({
      mode: 'replay',
      playing: true,
      cursorMs: NOW - DEFAULT_REPLAY_OFFSET_MS,
    })
    controls.togglePlaying()
    expect(playback.sections.land.playing).toBe(false)
    controls.togglePlaying()
    expect(playback.sections.land.playing).toBe(true)
  })

  it('sets the speed and goes live', () => {
    const controls = useReplayControls('space')
    const playback = usePlaybackStore()
    controls.setRate(300)
    expect(playback.sections.space.rate).toBe(300)
    controls.seek(NOW - 1000)
    controls.goLive()
    expect(controls.replaying.value).toBe(false)
  })
})
