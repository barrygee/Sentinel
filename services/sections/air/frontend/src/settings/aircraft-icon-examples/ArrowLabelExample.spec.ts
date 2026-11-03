import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ArrowLabelExample from './ArrowLabelExample.vue'

describe('ArrowLabelExample', () => {
  /** The label's segments in screen order: 'arrow' or the callsign text. */
  function segmentOrder(wrapper: ReturnType<typeof mount>): string[] {
    const pill = wrapper.element.firstElementChild as HTMLElement
    return Array.from(pill.children).map((segment) =>
      segment.querySelector('svg') ? 'arrow' : (segment.textContent ?? ''),
    )
  }

  it('shows a map label: a black pill with an arrow and the callsign', () => {
    const wrapper = mount(ArrowLabelExample)
    const pill = wrapper.element.firstElementChild as HTMLElement
    expect(pill.style.background).toBe('rgb(0, 0, 0)')
    expect(pill.querySelector('.adsb-label-name')?.textContent).toBe('BAW123')
  })

  it('puts the text on the left of an aircraft heading right, as the map does', () => {
    // The default 60° track heads right (east): the arrow leads at the right end.
    expect(segmentOrder(mount(ArrowLabelExample))).toEqual(['BAW123', 'arrow'])
  })

  it('puts the text on the right of an aircraft heading left', () => {
    expect(segmentOrder(mount(ArrowLabelExample, { props: { trackDeg: 270 } }))).toEqual([
      'arrow',
      'BAW123',
    ])
  })

  it('points the arrow along the given track and shows the given callsign', () => {
    const wrapper = mount(ArrowLabelExample, { props: { callsign: 'EZY42', trackDeg: 135 } })
    expect(wrapper.find('.adsb-label-name').text()).toBe('EZY42')
    expect(wrapper.html()).toContain('rotate(135deg)')
  })

  it('draws the arrow in the civil aircraft colour', () => {
    const wrapper = mount(ArrowLabelExample)
    expect(wrapper.html()).toContain('#00aaff')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(ArrowLabelExample)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
