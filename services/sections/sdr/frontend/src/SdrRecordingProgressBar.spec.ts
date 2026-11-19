import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingProgressBar from './SdrRecordingProgressBar.vue'

enableAutoUnmount(afterEach)

function mountBar(currentTimeSeconds: number, durationSeconds: number) {
  return mount(SdrRecordingProgressBar, {
    props: { currentTimeSeconds, durationSeconds },
    attachTo: document.body,
  })
}

const litCount = (wrapper: ReturnType<typeof mountBar>) =>
  wrapper.findAll('.sdr-recording-seg--on').length

describe('SdrRecordingProgressBar — blocks', () => {
  it('draws 28 blocks', () => {
    expect(mountBar(0, 60).findAll('.sdr-recording-seg')).toHaveLength(28)
  })

  it.each([
    [0, 60, 0],
    [30, 60, 14],
    [60, 60, 28],
    [1, 56, 1], // 0.5 block rounds up
    [0.9, 56, 0], // 0.45 block rounds down
  ])('lights the blocks played so far: %d of %d s → %d', (current, duration, expected) => {
    expect(litCount(mountBar(current, duration))).toBe(expected)
  })

  it('lights the first blocks, not arbitrary ones', () => {
    const blocks = mountBar(15, 60).findAll('.sdr-recording-seg')
    const lit = blocks.map((block) => block.classes().includes('sdr-recording-seg--on'))
    expect(lit).toEqual([...Array(7).fill(true), ...Array(21).fill(false)])
  })

  it('clamps a position past the end to a full bar', () => {
    expect(litCount(mountBar(90, 60))).toBe(28)
  })

  it('clamps a negative position to an empty bar', () => {
    expect(litCount(mountBar(-5, 60))).toBe(0)
  })

  it('lights nothing while the duration is unknown', () => {
    expect(litCount(mountBar(30, 0))).toBe(0)
  })
})

describe('SdrRecordingProgressBar — time', () => {
  it('shows position / duration as MM:SS', () => {
    expect(mountBar(65.7, 600).find('.sdr-recording-time').text()).toBe('01:05 / 10:00')
  })
})

describe('SdrRecordingProgressBar — seeking', () => {
  function clickAt(clientX: number) {
    const wrapper = mountBar(0, 60)
    const segments = wrapper.find('.sdr-recording-segments')
    segments.element.getBoundingClientRect = () =>
      ({ left: 100, width: 200, top: 0, height: 10, right: 300, bottom: 10 }) as DOMRect
    segments.element.dispatchEvent(new MouseEvent('click', { clientX, bubbles: true }))
    return wrapper
  }

  it.each([
    [100, 0],
    [150, 0.25],
    [200, 0.5],
    [300, 1],
  ])('a click at x=%d seeks to %d of the recording', (clientX, fraction) => {
    expect(clickAt(clientX).emitted('seek')).toEqual([[fraction]])
  })

  it('clamps a click left of the bar to 0 and right of it to 1', () => {
    expect(clickAt(50).emitted('seek')).toEqual([[0]])
    expect(clickAt(400).emitted('seek')).toEqual([[1]])
  })

  it('keeps clicks and mousedowns on the bar from reaching the row', async () => {
    const rowEvents: string[] = []
    const wrapper = mountBar(0, 60)
    const row = wrapper.element.parentElement!
    row.addEventListener('click', () => rowEvents.push('click'))
    row.addEventListener('mousedown', () => rowEvents.push('mousedown'))
    await wrapper.find('.sdr-recording-segments').trigger('mousedown')
    await wrapper.find('.sdr-recording-segments').trigger('click')
    expect(rowEvents).toEqual([])
  })

  it('has no axe violations', async () => {
    expect(
      await axe(mountBar(30, 60).html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
