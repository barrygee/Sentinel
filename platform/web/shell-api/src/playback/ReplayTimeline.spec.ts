import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ReplayTimeline from './ReplayTimeline.vue'

enableAutoUnmount(afterEach)

const HOUR = 3_600_000
const START = 1000 * HOUR
const END = START + 100 * HOUR
const MOMENT = Date.UTC(2026, 10, 14, 13, 42, 10)

function mountTimeline(overrides: Record<string, unknown> = {}) {
  return mount(ReplayTimeline, {
    props: {
      sectionLabel: 'Air',
      replaying: true,
      momentMs: START + 50 * HOUR,
      rangeStart: START,
      rangeEnd: END,
      coverage: [],
      source: 'online',
      ...overrides,
    },
    attachTo: document.body,
  })
}

describe('ReplayTimeline', () => {
  it('is the app slider row over the window, at the replayed moment', () => {
    const wrapper = mountTimeline()
    const input = wrapper.get('input[type="range"]')
    expect(wrapper.get('.base-slider-row-label').text()).toBe('TIMELINE')
    expect(input.attributes('aria-label')).toBe('Air replay time')
    expect(input.attributes('min')).toBe(String(START))
    expect(input.attributes('max')).toBe(String(END))
    expect(input.attributes('step')).toBe('1000')
    expect((input.element as HTMLInputElement).value).toBe(String(START + 50 * HOUR))
  })

  it('shows a short source readout and announces the full moment', () => {
    const wrapper = mountTimeline({
      momentMs: MOMENT,
      rangeStart: MOMENT - HOUR,
      rangeEnd: MOMENT + HOUR,
    })
    expect(wrapper.get('.base-slider-row-value').text()).toBe('ONLINE')
    expect(wrapper.get('input').attributes('aria-valuetext')).toBe(
      '14 November 2026, 13:42:10 UTC, online',
    )
  })

  it('off grid and no data read as such', () => {
    expect(mountTimeline({ source: 'off grid' }).get('.base-slider-row-value').text()).toBe(
      'OFF GRID',
    )
    const empty = mountTimeline({
      source: null,
      momentMs: MOMENT,
      rangeStart: MOMENT - HOUR,
      rangeEnd: MOMENT + HOUR,
    })
    expect(empty.get('.base-slider-row-value').text()).toBe('NO DATA')
    expect(empty.get('input').attributes('aria-valuetext')).toMatch(/no recorded data$/)
  })

  it('while live it sits at the live end, dimmed, reading LIVE', () => {
    const wrapper = mountTimeline({ replaying: false })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe(String(END))
    expect(wrapper.get('.base-slider-row-value').text()).toBe('LIVE')
    expect(wrapper.get('.base-slider-row-value').classes()).toContain(
      'base-slider-row-value--dimmed',
    )
    expect(wrapper.get('input').attributes('aria-valuetext')).toBe('Live')
  })

  it('emits the moment dragged to', async () => {
    const wrapper = mountTimeline()
    const input = wrapper.get('input')
    ;(input.element as HTMLInputElement).value = String(START + 10 * HOUR)
    await input.trigger('input')
    expect(wrapper.emitted('seek')).toEqual([[START + 10 * HOUR]])
  })

  it.each([
    ['PageUp', START + 51 * HOUR],
    ['PageDown', START + 49 * HOUR],
    ['Home', START],
    ['End', END],
  ])('%s jumps to %d', async (key, expected) => {
    const wrapper = mountTimeline()
    await wrapper.get('input').trigger('keydown', { key })
    expect(wrapper.emitted('seek')).toEqual([[expected]])
  })

  it('page jumps from live start at the live end and are clamped', async () => {
    const live = mountTimeline({ replaying: false })
    await live.get('input').trigger('keydown', { key: 'PageDown' })
    expect(live.emitted('seek')).toEqual([[END - HOUR]])
    await live.get('input').trigger('keydown', { key: 'PageUp' })
    expect(live.emitted('seek')![1]).toEqual([END])
    const early = mountTimeline({ momentMs: START + 1000 })
    await early.get('input').trigger('keydown', { key: 'PageDown' })
    expect(early.emitted('seek')).toEqual([[START]])
  })

  it('leaves other keys to the range', async () => {
    const wrapper = mountTimeline()
    await wrapper.get('input').trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('seek')).toBeUndefined()
  })

  it('shades recorded stretches by source, clipped to the window', () => {
    const wrapper = mountTimeline({
      coverage: [
        { start: START + 10 * HOUR, end: START + 20 * HOUR, source: 'online' },
        { start: START + 30 * HOUR, end: START + 30 * HOUR + 1, source: 'offgrid' },
        { start: START - 10 * HOUR, end: START + 5 * HOUR, source: 'mystery' },
        { start: END + HOUR, end: END + 2 * HOUR, source: 'online' },
        { start: START - 3 * HOUR, end: START - HOUR, source: 'online' },
      ],
    })
    const bands = wrapper.findAll('.replay-timeline-band')
    expect(bands).toHaveLength(3)
    expect(bands[0]!.classes()).toContain('replay-timeline-band--online')
    expect(bands[0]!.attributes('style')).toContain('left: 10%')
    expect(bands[0]!.attributes('style')).toContain('width: 10%')
    expect(bands[1]!.classes()).toContain('replay-timeline-band--offgrid')
    expect(bands[1]!.attributes('style')).toContain('width: 0.3%')
    expect(bands[2]!.classes()).toContain('replay-timeline-band--online')
    expect(bands[2]!.attributes('style')).toContain('left: 0%')
    expect(wrapper.get('.replay-timeline-coverage').attributes('aria-hidden')).toBe('true')
  })

  it('draws no bands for an empty window', () => {
    const wrapper = mountTimeline({
      rangeEnd: START,
      coverage: [{ start: START, end: START + HOUR, source: 'online' }],
    })
    expect(wrapper.findAll('.replay-timeline-band')).toHaveLength(0)
  })

  it('has no axe violations', async () => {
    const wrapper = mountTimeline({ coverage: [{ start: START, end: END, source: 'online' }] })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
