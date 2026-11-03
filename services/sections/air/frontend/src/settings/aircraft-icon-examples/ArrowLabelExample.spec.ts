import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ArrowLabelExample from './ArrowLabelExample.vue'

describe('ArrowLabelExample', () => {
  it('shows a map label: a black pill with the arrow leading the callsign', () => {
    const wrapper = mount(ArrowLabelExample, { attachTo: document.body })
    const pill = wrapper.element.firstElementChild as HTMLElement
    expect(pill.style.background).toBe('rgb(0, 0, 0)')
    expect(pill.querySelector('svg')).not.toBeNull()
    expect(pill.querySelector('.adsb-label-name')?.textContent).toBe('BAW123')
    // Arrow first, then the name: the order the map draws a right-hand label in.
    expect(pill.firstElementChild?.querySelector('svg')).not.toBeNull()
    wrapper.unmount()
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
