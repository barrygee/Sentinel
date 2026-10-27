import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import HotspotRollbackBanner from './HotspotRollbackBanner.vue'

const START = new Date('2026-01-01T00:00:00Z').getTime()

function mountBanner(secondsToGo: number, busy = false) {
  return mount(HotspotRollbackBanner, { props: { deadlineMs: START + secondsToGo * 1000, busy } })
}

describe('HotspotRollbackBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(START)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a labelled group explaining the trial and showing the seconds left', () => {
    const wrapper = mountBanner(90)
    const group = wrapper.get('[role="group"]')
    expect(wrapper.get(`#${group.attributes('aria-labelledby')}`).text()).toContain(
      'This hotspot is on trial',
    )
    expect(wrapper.get('strong').text()).toBe('90 s')
  })

  it('counts down each second', async () => {
    const wrapper = mountBanner(90)
    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.get('strong').text()).toBe('87 s')
  })

  it('never goes below zero once the deadline has passed', async () => {
    const wrapper = mountBanner(2)
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.get('strong').text()).toBe('0 s')
  })

  it('warns screen readers only at 60, 30 and 10 seconds', async () => {
    const wrapper = mountBanner(65)
    const warning = () => wrapper.get('[aria-live="assertive"]').text()
    expect(warning()).toBe('')
    await vi.advanceTimersByTimeAsync(4000)
    expect(warning()).toBe('')
    await vi.advanceTimersByTimeAsync(1000)
    expect(warning()).toBe('60 seconds left to keep the hotspot.')
    await vi.advanceTimersByTimeAsync(5000)
    expect(warning()).toBe('60 seconds left to keep the hotspot.')
    await vi.advanceTimersByTimeAsync(25_000)
    expect(warning()).toBe('30 seconds left to keep the hotspot.')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(warning()).toBe('10 seconds left to keep the hotspot.')
  })

  it('emits keep and undo from the two buttons', async () => {
    const wrapper = mountBanner(90)
    const byText = (text: string) =>
      wrapper.findAll('button').find((button) => button.text() === text)!
    await byText('KEEP IT').trigger('click')
    await byText('UNDO NOW').trigger('click')
    expect(wrapper.emitted('keep')).toHaveLength(1)
    expect(wrapper.emitted('undo')).toHaveLength(1)
  })

  it('disables both buttons while busy and enables them otherwise', () => {
    expect(
      mountBanner(90, true)
        .findAll('button')
        .map((button) => button.attributes('disabled')),
    ).toEqual(['', ''])
    expect(
      mountBanner(90)
        .findAll('button')
        .map((button) => button.attributes('disabled')),
    ).toEqual([undefined, undefined])
  })

  it('stops its timer when it unmounts', async () => {
    const wrapper = mountBanner(90)
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('has no accessibility violations', async () => {
    vi.useRealTimers()
    await expectNoAxeViolations(mountBanner(90))
  })
})
