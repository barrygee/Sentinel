import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import { useSectionReplay } from './useSectionReplay'
import { usePlaybackStore } from '../stores/playback'

function handlers() {
  return { enter: vi.fn(), exit: vi.fn(), jumped: vi.fn(), dispose: vi.fn() }
}

describe('useSectionReplay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('enters and exits as the section goes in and out of replay', async () => {
    const playback = usePlaybackStore()
    const calls = handlers()
    const scope = effectScope()
    scope.run(() => useSectionReplay('air', calls))
    expect(calls.enter).not.toHaveBeenCalled()
    playback.enterReplay('air')
    await nextTick()
    expect(calls.enter).toHaveBeenCalledTimes(1)
    playback.exitReplay('air')
    await nextTick()
    expect(calls.exit).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('enters straight away when the map mounts mid-replay', () => {
    usePlaybackStore().enterReplay('sea')
    const calls = handlers()
    const scope = effectScope()
    scope.run(() => useSectionReplay('sea', calls))
    expect(calls.enter).toHaveBeenCalledTimes(1)
    expect(calls.exit).not.toHaveBeenCalled()
    scope.stop()
  })

  it('reports each jump while replaying, not the jump of entering', async () => {
    const playback = usePlaybackStore()
    const calls = handlers()
    const scope = effectScope()
    scope.run(() => useSectionReplay('air', calls))
    playback.enterReplay('air')
    await nextTick()
    expect(calls.jumped).toHaveBeenCalledTimes(1)
    playback.seek('air', Date.now() - 5000)
    await nextTick()
    expect(calls.jumped).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('a jump with no jumped handler is fine', async () => {
    const playback = usePlaybackStore()
    const scope = effectScope()
    scope.run(() => useSectionReplay('air', { enter: vi.fn(), exit: vi.fn() }))
    playback.enterReplay('air')
    playback.seek('air', Date.now() - 5000)
    await nextTick()
    scope.stop()
  })

  it('a jump counted while live is ignored', async () => {
    const playback = usePlaybackStore()
    const calls = handlers()
    const scope = effectScope()
    scope.run(() => useSectionReplay('air', calls))
    playback.sections.air.seekVersion++
    await nextTick()
    expect(calls.jumped).not.toHaveBeenCalled()
    scope.stop()
  })

  it('ignores other sections', async () => {
    const playback = usePlaybackStore()
    const calls = handlers()
    const scope = effectScope()
    scope.run(() => useSectionReplay('air', calls))
    playback.enterReplay('land')
    await nextTick()
    expect(calls.enter).not.toHaveBeenCalled()
    scope.stop()
  })

  it('disposes only when unmounted mid-replay', () => {
    const playback = usePlaybackStore()
    const live = handlers()
    const liveScope = effectScope()
    liveScope.run(() => useSectionReplay('air', live))
    liveScope.stop()
    expect(live.dispose).not.toHaveBeenCalled()

    playback.enterReplay('air')
    const replaying = handlers()
    const replayScope = effectScope()
    replayScope.run(() => useSectionReplay('air', replaying))
    replayScope.stop()
    expect(replaying.dispose).toHaveBeenCalledTimes(1)
    // Replay itself stays on for when the map comes back.
    expect(playback.sections.air.mode).toBe('replay')
  })

  it('unmounting mid-replay without a dispose handler is fine', () => {
    usePlaybackStore().enterReplay('air')
    const scope = effectScope()
    scope.run(() => useSectionReplay('air', { enter: vi.fn(), exit: vi.fn() }))
    scope.stop()
  })
})
