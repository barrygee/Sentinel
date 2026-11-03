import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import AircraftIconExampleTile from './AircraftIconExampleTile.vue'

describe('AircraftIconExampleTile', () => {
  it('draws its example inside', () => {
    const wrapper = mount(AircraftIconExampleTile, { slots: { default: '<b>example</b>' } })
    expect(wrapper.find('b').text()).toBe('example')
  })

  it('hides the example from assistive tech, so the option is named by its label', () => {
    const wrapper = mount(AircraftIconExampleTile, { slots: { default: 'BAW123' } })
    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(AircraftIconExampleTile, { slots: { default: 'BAW123' } })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
