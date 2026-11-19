import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import AirMilitaryBaseAccordion from './AirMilitaryBaseAccordion.vue'
import type { MilResult } from './airFilterTypes'

const BASE: MilResult = {
  kind: 'mil',
  icao: 'EGVA',
  name: 'RAF Fairford',
  bounds: [-1.8, 51.6, -1.7, 51.7],
  coords: [-1.79, 51.68],
}

describe('AirMilitaryBaseAccordion', () => {
  it('shows the base location and nothing to tune', () => {
    const wrapper = mount(AirMilitaryBaseAccordion, { props: { base: BASE } })
    expect(wrapper.find('.apt-acc-body').exists()).toBe(true)
    expect(wrapper.findAll('.ba-data-grid-title').map((title) => title.text())).toEqual([
      'LOCATION',
    ])
    expect(wrapper.text()).toContain('51.6800°N')
    expect(wrapper.text()).toContain('1.7900°W')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('has no axe violations', async () => {
    const wrapper = mount(AirMilitaryBaseAccordion, { props: { base: BASE } })
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
