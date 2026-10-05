import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ScrollHintChevronIcon from './ScrollHintChevronIcon.vue'

describe('ScrollHintChevronIcon', () => {
  it('renders a decorative (aria-hidden) down-chevron svg', () => {
    const wrapper = mount(ScrollHintChevronIcon)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('width')).toBe('8')
    expect(svg.attributes('height')).toBe('8')
    expect(wrapper.find('polyline').exists()).toBe(true)
  })

  it('forwards a passed-through id to the root svg for id-scoped CSS', () => {
    const wrapper = mount(ScrollHintChevronIcon, { attrs: { id: 'notif-scroll-arrow' } })
    expect(wrapper.find('svg').attributes('id')).toBe('notif-scroll-arrow')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(ScrollHintChevronIcon)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
