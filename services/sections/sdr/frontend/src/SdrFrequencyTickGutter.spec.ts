import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrFrequencyTickGutter from './SdrFrequencyTickGutter.vue'
import type { FrequencyTick } from './waterfallFrequencyTicks'

enableAutoUnmount(afterEach)

const TICKS: FrequencyTick[] = [
  { key: 't-100000000', leftPct: 0, label: '100M', labeled: true },
  { key: 't-100100000', leftPct: 50, label: '100.1M', labeled: false },
  { key: 't-100200000', leftPct: 100, label: '100.2M', labeled: true },
]

function mountGutter(ticks: FrequencyTick[] = TICKS) {
  return mount(SdrFrequencyTickGutter, {
    props: { ticks, gutterStyle: { left: '56px', right: '12px', height: '30px' } },
    attachTo: document.body,
  })
}

describe('SdrFrequencyTickGutter', () => {
  it('spans the data box and the label gutter', () => {
    const style = mountGutter().find('.sdr-wf-tick-gutter').attributes('style')
    expect(style).toContain('left: 56px')
    expect(style).toContain('right: 12px')
    expect(style).toContain('height: 30px')
  })

  it('draws a tick line at every tick, labelled or not', () => {
    const lines = mountGutter().findAll('.sdr-wf-tick')
    expect(lines.map((line) => line.attributes('style'))).toEqual([
      'left: 0%;',
      'left: 50%;',
      'left: 100%;',
    ])
  })

  it('shows a label pill only on labelled ticks', () => {
    const labels = mountGutter().findAll('.sdr-wf-freq-label')
    expect(labels.map((label) => label.text())).toEqual(['100M', '100.1M', '100.2M'])
    expect(labels.map((label) => label.isVisible())).toEqual([true, false, true])
    expect(labels[2]!.attributes('style')).toContain('left: 100%')
  })

  it('renders an empty gutter with no ticks', () => {
    const wrapper = mountGutter([])
    expect(wrapper.findAll('.sdr-wf-tick')).toHaveLength(0)
    expect(wrapper.findAll('.sdr-wf-freq-label')).toHaveLength(0)
  })

  it('has no axe violations', async () => {
    const wrapper = mountGutter()
    expect(await axe(wrapper.element as HTMLElement)).toHaveNoViolations()
  })
})
