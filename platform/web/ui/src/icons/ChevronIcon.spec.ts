import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ChevronIcon from './ChevronIcon.vue'

describe('ChevronIcon', () => {
  it('renders a decorative (aria-hidden) svg', () => {
    const wrapper = mount(ChevronIcon)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
  })

  it('uses the default stroke width', () => {
    const wrapper = mount(ChevronIcon)
    expect(wrapper.find('path').attributes('stroke-width')).toBe('1.3')
  })

  it('honours a custom stroke width', () => {
    const wrapper = mount(ChevronIcon, { props: { strokeWidth: 2 } })
    expect(wrapper.find('path').attributes('stroke-width')).toBe('2')
  })

  it('applies the open modifier class only when open', () => {
    const closed = mount(ChevronIcon, { props: { open: false } })
    expect(closed.find('svg').classes()).not.toContain('chevron-icon--open')
    const open = mount(ChevronIcon, { props: { open: true } })
    expect(open.find('svg').classes()).toContain('chevron-icon--open')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(ChevronIcon)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
