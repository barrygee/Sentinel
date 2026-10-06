import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import LocationPinIcon from './LocationPinIcon.vue'

describe('LocationPinIcon', () => {
  it('renders a decorative (aria-hidden) svg with the pin glyph', () => {
    const wrapper = mount(LocationPinIcon)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('width')).toBe('16')
    expect(svg.attributes('height')).toBe('16')
    expect(wrapper.find('circle').exists()).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(LocationPinIcon)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
