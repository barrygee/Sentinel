import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import HistoryRecordedPeriods from './HistoryRecordedPeriods.vue'
import type { RecordedPeriod } from './historySummary'

const HOUR = 3_600_000
const BASE = Date.UTC(2026, 10, 18, 0, 0)

function period(startHour: number, endHour: number, sources = ['online']): RecordedPeriod {
  return { start: BASE + startHour * HOUR, end: BASE + endHour * HOUR, sources }
}

describe('HistoryRecordedPeriods', () => {
  it('says when nothing is recorded yet', () => {
    expect(mount(HistoryRecordedPeriods, { props: { periods: [] } }).text()).toBe(
      'Nothing recorded yet',
    )
  })

  it('lists each stretch newest first with its source', () => {
    const wrapper = mount(HistoryRecordedPeriods, {
      props: { periods: [period(1, 3), period(5, 9, ['offgrid', 'online'])] },
    })
    const items = wrapper.findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]!.get('.history-period-range').text()).toBe('18 NOV 05:00 – 18 NOV 09:00 UTC')
    expect(items[0]!.get('.history-period-source').text()).toBe('OFF GRID + ONLINE')
    expect(items[1]!.get('.history-period-range').text()).toBe('18 NOV 01:00 – 18 NOV 03:00 UTC')
    expect(items[1]!.get('.history-period-source').text()).toBe('ONLINE')
  })

  it('shows the most recent few and counts the rest', () => {
    const periods = Array.from({ length: 8 }, (_unused, index) => period(index * 2, index * 2 + 1))
    const wrapper = mount(HistoryRecordedPeriods, { props: { periods } })
    expect(wrapper.findAll('.history-period-range')).toHaveLength(5)
    expect(wrapper.get('.history-period--more').text()).toBe('+ 3 earlier stretches')
    const one = mount(HistoryRecordedPeriods, { props: { periods: periods.slice(0, 3), limit: 2 } })
    expect(one.get('.history-period--more').text()).toBe('+ 1 earlier stretch')
  })

  it('has no axe violations', async () => {
    const wrapper = mount(HistoryRecordedPeriods, {
      props: { periods: [period(1, 3)] },
      attachTo: document.body,
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
    wrapper.unmount()
  })
})
