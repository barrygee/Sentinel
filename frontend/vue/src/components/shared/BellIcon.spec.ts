import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BellIcon from './BellIcon.vue'

describe('BellIcon', () => {
  it('uses the default size and omits the strike-through by default', () => {
    const wrapper = mount(BellIcon)
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('width')).toBe('13')
    expect(svg.attributes('height')).toBe('13')
    expect(wrapper.find('line').exists()).toBe(false)
  })

  it('honours a custom size', () => {
    const wrapper = mount(BellIcon, { props: { size: 14 } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('14')
    expect(svg.attributes('height')).toBe('14')
  })

  it('renders the strike-through line when struck is true', () => {
    const wrapper = mount(BellIcon, { props: { struck: true } })
    expect(wrapper.find('line').exists()).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(BellIcon, { props: { struck: true } })
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
