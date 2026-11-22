import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SectionPlaybackBar from './SectionPlaybackBar.vue'
import { usePlaybackStore } from '../stores/playback'

vi.mock('./historyApi', () => ({ fetchHistoryCoverage: vi.fn() }))
import { fetchHistoryCoverage } from './historyApi'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0)
const HOUR = 60 * 60 * 1000

let frameCallbacks: Array<(timestamp: number) => void> = []

function runFrame(timestamp: number): void {
  const callbacks = frameCallbacks
  frameCallbacks = []
  for (const callback of callbacks) callback(timestamp)
}

function mountBar(props: Record<string, unknown> = {}) {
  return mount(SectionPlaybackBar, {
    props: { sectionId: 'air', sectionLabel: 'Air', ...props },
    attachTo: document.body,
  })
}

describe('SectionPlaybackBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    frameCallbacks = []
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.mocked(fetchHistoryCoverage).mockReset()
    vi.mocked(fetchHistoryCoverage).mockResolvedValue({
      from: NOW - 7 * 24 * HOUR,
      to: NOW,
      bucketMs: HOUR,
      buckets: [
        [NOW - 2 * HOUR, 40, 'online'],
        [NOW - HOUR, 12, 'offgrid'],
      ],
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders nothing while the section is live', () => {
    expect(mountBar().find('section').exists()).toBe(false)
    expect(fetchHistoryCoverage).not.toHaveBeenCalled()
  })

  it('shows the replayed moment, controls and coverage once replaying', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountBar()
    playback.enterReplay('air', NOW - HOUR - 10 * 60_000)
    await flushPromises()
    const bar = wrapper.get('section')
    expect(bar.attributes('aria-label')).toBe('Air replay')
    expect(wrapper.get('.section-playback-bar-badge').text()).toBe('REPLAY')
    expect(wrapper.get('time').text()).toBe('20 NOV 10:50:00 UTC')
    expect(wrapper.get('time').attributes('datetime')).toBe(
      new Date(NOW - HOUR - 600_000).toISOString(),
    )
    expect(fetchHistoryCoverage).toHaveBeenCalledWith('air')
    expect(wrapper.findAll('.playback-scrubber-band')).toHaveLength(2)
    expect(wrapper.get('input[type="range"]').attributes('aria-valuetext')).toBe(
      '20 November 2026, 10:50:00 UTC, online',
    )
    expect(wrapper.get('input[type="range"]').attributes('aria-label')).toBe('Air replay time')
  })

  it('says when there is no data or which source was heard', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountBar()
    playback.enterReplay('air', NOW - 5 * HOUR)
    await flushPromises()
    expect(wrapper.get('input[type="range"]').attributes('aria-valuetext')).toContain(
      'no recorded data',
    )
    playback.seek('air', NOW - HOUR + 1000)
    await flushPromises()
    expect(wrapper.get('input[type="range"]').attributes('aria-valuetext')).toContain(', off grid')
  })

  it('keeps the last coverage when it cannot be read', async () => {
    vi.mocked(fetchHistoryCoverage).mockResolvedValue(null)
    const playback = usePlaybackStore()
    const wrapper = mountBar()
    playback.enterReplay('air')
    await flushPromises()
    expect(wrapper.findAll('.playback-scrubber-band')).toHaveLength(0)
  })

  it('Space shades the whole window and never asks for coverage', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountBar({ sectionId: 'space', sectionLabel: 'Space', hasCoverage: false })
    playback.enterReplay('space')
    await flushPromises()
    expect(fetchHistoryCoverage).not.toHaveBeenCalled()
    const bands = wrapper.findAll('.playback-scrubber-band')
    expect(bands).toHaveLength(1)
    expect(bands[0]!.attributes('style')).toContain('width: 100%')
    expect(wrapper.get('input[type="range"]').attributes('aria-valuetext')).toMatch(
      /UTC, no recorded data$/,
    )
  })

  it('drives the store from its controls', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountBar()
    playback.enterReplay('air', NOW - 3 * HOUR)
    await flushPromises()
    const buttons = () => wrapper.findAll('button')
    await wrapper.get('[aria-label="Back 1 minute"]').trigger('click')
    expect(playback.sections.air.cursorMs).toBe(NOW - 3 * HOUR - 60_000)
    await wrapper.get('[aria-label="Forward 1 minute"]').trigger('click')
    expect(playback.sections.air.cursorMs).toBe(NOW - 3 * HOUR)
    await wrapper.get('[aria-label="Play replay"]').trigger('click')
    expect(playback.sections.air.playing).toBe(true)
    await wrapper.get('[aria-label="60 times speed"]').trigger('click')
    expect(playback.sections.air.rate).toBe(60)
    const range = wrapper.get('input[type="range"]')
    ;(range.element as HTMLInputElement).value = String(NOW - 2 * HOUR)
    await range.trigger('input')
    expect(playback.sections.air.cursorMs).toBe(NOW - 2 * HOUR)
    await wrapper.get('input[type="datetime-local"]').setValue('2026-11-20T06:00')
    await wrapper.get('form').trigger('submit')
    expect(playback.sections.air.cursorMs).toBe(Date.UTC(2026, 10, 20, 6, 0))
    expect(buttons().length).toBeGreaterThan(0)
    await wrapper.get('[aria-label="Back to live"]').trigger('click')
    expect(playback.sections.air.mode).toBe('live')
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('advances the cursor every animation frame while playing, and stops when paused', async () => {
    const playback = usePlaybackStore()
    mountBar()
    playback.enterReplay('air', NOW - 3 * HOUR)
    playback.setRate('air', 10)
    await flushPromises()
    playback.setPlaying('air', true)
    await flushPromises()
    runFrame(1000) // first frame only records its time
    runFrame(1100) // 100 ms × 10
    expect(playback.sections.air.cursorMs).toBe(NOW - 3 * HOUR + 1000)
    playback.setPlaying('air', false)
    await flushPromises()
    runFrame(1200)
    expect(frameCallbacks).toHaveLength(0)
  })

  it('stops the loop once playback reaches the present', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountBar()
    playback.enterReplay('air', NOW - 1000)
    playback.setRate('air', 300)
    await flushPromises()
    playback.setPlaying('air', true)
    await flushPromises()
    runFrame(0)
    runFrame(100)
    await flushPromises()
    expect(playback.sections.air.mode).toBe('live')
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('announces jumps, play/pause and returning live — not every tick', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountBar()
    playback.enterReplay('air', NOW - 2 * HOUR)
    await flushPromises()
    const announcer = () => wrapper.get('[role="status"]').text()
    expect(announcer()).toBe('Replaying 20 November 2026, 10:00:00 UTC')
    playback.setPlaying('air', true)
    await flushPromises()
    expect(announcer()).toBe('Playing')
    runFrame(0)
    runFrame(16)
    await flushPromises()
    expect(announcer()).toBe('Playing')
    playback.setPlaying('air', false)
    await flushPromises()
    expect(announcer()).toBe('Paused')
    expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite')
    playback.exitReplay('air')
    await flushPromises()
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('a jump counted while live announces nothing', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountBar()
    playback.sections.air.seekVersion++
    await flushPromises()
    playback.enterReplay('air', NOW - HOUR)
    await flushPromises()
    // Only the jump made by entering replay is announced.
    expect(wrapper.get('[role="status"]').text()).toBe('Replaying 20 November 2026, 11:00:00 UTC')
  })

  it('refreshes coverage and the window every minute while replaying', async () => {
    const playback = usePlaybackStore()
    mountBar()
    playback.enterReplay('air')
    await flushPromises()
    expect(fetchHistoryCoverage).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchHistoryCoverage).toHaveBeenCalledTimes(2)
    playback.exitReplay('air')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchHistoryCoverage).toHaveBeenCalledTimes(2)
  })

  it('Esc returns to live; Space toggles play outside buttons and the date field', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountBar()
    playback.enterReplay('air')
    await flushPromises()
    await wrapper.get('input[type="range"]').trigger('keydown', { key: ' ' })
    expect(playback.sections.air.playing).toBe(true)
    await wrapper.get('[aria-label="Pause replay"]').trigger('keydown', { key: ' ' })
    expect(playback.sections.air.playing).toBe(true) // the button handles its own Space
    await wrapper.get('input[type="datetime-local"]').trigger('keydown', { key: ' ' })
    expect(playback.sections.air.playing).toBe(true)
    await wrapper.get('input[type="range"]').trigger('keydown', { key: 'x' })
    expect(playback.sections.air.playing).toBe(true)
    await wrapper.get('input[type="range"]').trigger('keydown', { key: 'Escape' })
    expect(playback.sections.air.mode).toBe('live')
  })

  it('cleans up its timers when unmounted mid-replay', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountBar()
    playback.enterReplay('air')
    playback.setPlaying('air', true)
    await flushPromises()
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchHistoryCoverage).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('unmounting while live is clean', () => {
    mountBar().unmount()
  })

  it('has no axe violations while replaying', async () => {
    vi.useRealTimers()
    const playback = usePlaybackStore()
    const wrapper = mountBar()
    playback.enterReplay('air')
    await flushPromises()
    expect(await axe(wrapper.html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
