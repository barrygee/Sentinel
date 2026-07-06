import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import FilterFunnelIcon from './FilterFunnelIcon.vue'

describe('FilterFunnelIcon', () => {
  it('uses the default size when none is given', () => {
    const wrapper = mount(FilterFunnelIcon)
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('width')).toBe('15')
    expect(svg.attributes('height')).toBe('15')
    expect(wrapper.findAll('line')).toHaveLength(3)
  })

  it('honours a custom size', () => {
    const wrapper = mount(FilterFunnelIcon, { props: { size: 19 } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('19')
    expect(svg.attributes('height')).toBe('19')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(FilterFunnelIcon)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
