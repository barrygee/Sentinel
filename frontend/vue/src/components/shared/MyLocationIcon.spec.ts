import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import MyLocationIcon from './MyLocationIcon.vue'

describe('MyLocationIcon', () => {
  it('renders a decorative (aria-hidden) crosshair svg', () => {
    const wrapper = mount(MyLocationIcon)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('circle')).toHaveLength(2)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(MyLocationIcon)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
