import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import PlaybackScrubber, { type CoverageSpan } from './PlaybackScrubber.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }
const HOUR = 60 * 60 * 1000
const START = 1_000 * HOUR
const END = START + 100 * HOUR

function mountScrubber(overrides: Record<string, unknown> = {}) {
  return mount(PlaybackScrubber, {
    props: {
      rangeStart: START,
      rangeEnd: END,
      value: START + 50 * HOUR,
      accessibleName: 'Air replay time',
      valueText: '14 November 2026, 13:42:10 UTC, online',
      coverage: [] as CoverageSpan[],
      ...overrides,
    },
    attachTo: document.body,
  })
}

describe('PlaybackScrubber', () => {
  it('is a range input over the retention window, stepping a second', () => {
    const input = mountScrubber().get('input')
    expect(input.attributes('type')).toBe('range')
    expect(input.attributes('min')).toBe(String(START))
    expect(input.attributes('max')).toBe(String(END))
    expect(input.attributes('step')).toBe('1000')
    expect((input.element as HTMLInputElement).value).toBe(String(START + 50 * HOUR))
    expect(input.attributes('aria-label')).toBe('Air replay time')
    expect(input.attributes('aria-valuetext')).toBe('14 November 2026, 13:42:10 UTC, online')
  })

  it('emits the moment the operator drags to', async () => {
    const wrapper = mountScrubber()
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
    const wrapper = mountScrubber()
    await wrapper.get('input').trigger('keydown', { key })
    expect(wrapper.emitted('seek')).toEqual([[expected]])
  })

  it('clamps an hour jump to the ends of the window', async () => {
    const atEnd = mountScrubber({ value: END - 1000 })
    await atEnd.get('input').trigger('keydown', { key: 'PageUp' })
    expect(atEnd.emitted('seek')).toEqual([[END]])
    const atStart = mountScrubber({ value: START + 1000 })
    await atStart.get('input').trigger('keydown', { key: 'PageDown' })
    expect(atStart.emitted('seek')).toEqual([[START]])
  })

  it('leaves other keys to the native range', async () => {
    const wrapper = mountScrubber()
    await wrapper.get('input').trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('seek')).toBeUndefined()
  })

  it('shades coverage bands by source, clipped to the window', () => {
    const wrapper = mountScrubber({
      coverage: [
        { start: START + 10 * HOUR, end: START + 20 * HOUR, source: 'online' },
        { start: START + 30 * HOUR, end: START + 30 * HOUR + 1, source: 'offgrid' },
        { start: START - 10 * HOUR, end: START + 5 * HOUR, source: 'mystery' },
        { start: END + HOUR, end: END + 2 * HOUR, source: 'online' }, // outside: dropped
        { start: START - 3 * HOUR, end: START - HOUR, source: 'online' }, // outside: dropped
      ],
    })
    const bands = wrapper.findAll('.playback-scrubber-band')
    expect(bands).toHaveLength(3)
    expect(bands[0]!.classes()).toContain('playback-scrubber-band--online')
    expect(bands[0]!.attributes('style')).toContain('left: 10%')
    expect(bands[0]!.attributes('style')).toContain('width: 10%')
    // A burst of one sample is still drawn as a sliver.
    expect(bands[1]!.classes()).toContain('playback-scrubber-band--offgrid')
    expect(bands[1]!.attributes('style')).toContain('width: 0.15%')
    // An unknown source is drawn as online; a band before the window starts at 0.
    expect(bands[2]!.classes()).toContain('playback-scrubber-band--online')
    expect(bands[2]!.attributes('style')).toContain('left: 0%')
    expect(bands[2]!.attributes('style')).toContain('width: 5%')
    expect(wrapper.get('.playback-scrubber-coverage').attributes('aria-hidden')).toBe('true')
  })

  it('draws no bands for an empty window', () => {
    const wrapper = mountScrubber({
      rangeEnd: START,
      coverage: [{ start: START, end: START + HOUR, source: 'online' }],
    })
    expect(wrapper.findAll('.playback-scrubber-band')).toHaveLength(0)
  })

  it('has no axe violations', async () => {
    const wrapper = mountScrubber({ coverage: [{ start: START, end: END, source: 'online' }] })
    expect(await axe(wrapper.html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
