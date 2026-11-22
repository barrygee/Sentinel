import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SectionReplayPanel from './SectionReplayPanel.vue'
import { usePlaybackStore } from '../stores/playback'

vi.mock('./historyApi', () => ({ fetchHistoryCoverage: vi.fn() }))
import { fetchHistoryCoverage } from './historyApi'

enableAutoUnmount(afterEach)

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0)
const HOUR = 3_600_000

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(SectionReplayPanel, {
    props: { sectionId: 'air', sectionLabel: 'Air', ...props },
    attachTo: document.body,
  })
}

describe('SectionReplayPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.mocked(fetchHistoryCoverage).mockReset()
    vi.mocked(fetchHistoryCoverage).mockResolvedValue({
      from: NOW - 7 * 24 * HOUR,
      to: NOW,
      bucketMs: HOUR,
      buckets: [[NOW - 2 * HOUR, 40, 'offgrid']],
    })
  })
  afterEach(() => vi.useRealTimers())

  it('is a named region showing live, with the controls and the legend', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.get('section').attributes('aria-label')).toBe('Air replay')
    expect(wrapper.get('.replay-status-label').text()).toBe('LIVE')
    expect(wrapper.get('input[type="range"]').attributes('aria-valuetext')).toBe('Live')
    expect(wrapper.find('.replay-legend').exists()).toBe(true)
    expect(wrapper.find('.replay-panel-note').exists()).toBe(false)
    expect(fetchHistoryCoverage).toHaveBeenCalledWith('air')
    expect(wrapper.findAll('.replay-timeline-band')).toHaveLength(1)
  })

  it('does not fetch coverage while hidden', async () => {
    mountPanel({ visible: false })
    await flushPromises()
    expect(fetchHistoryCoverage).not.toHaveBeenCalled()
  })

  it('stepping back starts replay and shows the moment and its source', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountPanel()
    await flushPromises()
    playback.enterReplay('air', NOW - 2 * HOUR + 1000)
    await flushPromises()
    expect(wrapper.get('.replay-status-label').text()).toBe('REPLAY')
    expect(wrapper.get('time').text()).toBe('20 NOV 10:00:01 UTC')
    expect(wrapper.get('.base-slider-row-value').text()).toBe('OFF GRID')
    await wrapper.get('[aria-label="Back 1 minute"]').trigger('click')
    expect(playback.sections.air.cursorMs).toBe(NOW - 2 * HOUR + 1000 - 60_000)
    await wrapper.get('[aria-label="Forward 1 minute"]').trigger('click')
    expect(playback.sections.air.cursorMs).toBe(NOW - 2 * HOUR + 1000)
  })

  it('drives play, speed, drag, go-to and LIVE through the store', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.get('[aria-label="Play replay"]').trigger('click')
    expect(playback.sections.air.playing).toBe(true)
    await wrapper.get('[aria-label="300 times speed"]').trigger('click')
    expect(playback.sections.air.rate).toBe(300)
    const range = wrapper.get('input[type="range"]')
    ;(range.element as HTMLInputElement).value = String(NOW - 5 * HOUR)
    await range.trigger('input')
    expect(playback.sections.air.cursorMs).toBe(NOW - 5 * HOUR)
    await wrapper.get('input[type="datetime-local"]').setValue('2026-11-20T06:00')
    await wrapper.get('form').trigger('submit')
    expect(playback.sections.air.cursorMs).toBe(Date.UTC(2026, 10, 20, 6, 0))
    await wrapper.get('[aria-label="Back to live"]').trigger('click')
    expect(playback.sections.air.mode).toBe('live')
  })

  it('announces jumps, play/pause and going live', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountPanel()
    const announcer = () => wrapper.get('[role="status"]').text()
    playback.enterReplay('air', NOW - 2 * HOUR)
    await flushPromises()
    expect(announcer()).toBe('Replaying 20 November 2026, 10:00:00 UTC')
    playback.setPlaying('air', true)
    await flushPromises()
    expect(announcer()).toBe('Playing')
    playback.setPlaying('air', false)
    await flushPromises()
    expect(announcer()).toBe('Paused')
    playback.exitReplay('air')
    await flushPromises()
    expect(announcer()).toBe('Air is live')
  })

  it('a jump counted while live, or play state changing while live, announces nothing', async () => {
    const playback = usePlaybackStore()
    const wrapper = mountPanel()
    playback.sections.air.seekVersion++
    playback.sections.air.playing = true
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('')
  })

  it('Space shades its whole window, explains why, and never asks for coverage', async () => {
    const wrapper = mountPanel({ sectionId: 'space', sectionLabel: 'Space', hasCoverage: false })
    await flushPromises()
    expect(fetchHistoryCoverage).not.toHaveBeenCalled()
    const bands = wrapper.findAll('.replay-timeline-band')
    expect(bands).toHaveLength(1)
    expect(bands[0]!.attributes('style')).toContain('width: 100%')
    expect(wrapper.find('.replay-legend').exists()).toBe(false)
    expect(wrapper.get('.replay-panel-note').text()).toContain('recalculated from the orbits')
    usePlaybackStore().enterReplay('space', NOW - HOUR)
    await flushPromises()
    expect(wrapper.get('.base-slider-row-value').text()).toBe('NO DATA')
  })

  it('moves the window with the clock, and stops its timer when unmounted', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const max = () => Number(wrapper.get('input[type="range"]').attributes('max'))
    expect(max()).toBe(NOW)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(max()).toBe(NOW + 30_000)
    const clear = vi.spyOn(globalThis, 'clearInterval')
    wrapper.unmount()
    expect(clear).toHaveBeenCalled()
  })

  it('has no axe violations, live or replaying', async () => {
    vi.useRealTimers()
    const wrapper = mountPanel()
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
    usePlaybackStore().enterReplay('air')
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
