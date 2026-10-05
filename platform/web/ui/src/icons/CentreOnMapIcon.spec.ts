import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import CentreOnMapIcon from './CentreOnMapIcon.vue'

describe('CentreOnMapIcon', () => {
  it('renders the reticle: a ring broken by four tick marks', () => {
    const wrapper = mount(CentreOnMapIcon)
    const svg = wrapper.find('svg')

    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
    expect(wrapper.findAll('circle')).toHaveLength(1)
    expect(wrapper.findAll('line')).toHaveLength(4)
  })

  it('follows currentColor so the enclosing button can tint it', () => {
    const wrapper = mount(CentreOnMapIcon)
    for (const shape of [...wrapper.findAll('circle'), ...wrapper.findAll('line')]) {
      expect(shape.attributes('stroke')).toBe('currentColor')
    }
  })

  it('is decorative — hidden from assistive tech', () => {
    const wrapper = mount(CentreOnMapIcon)
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(CentreOnMapIcon)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
