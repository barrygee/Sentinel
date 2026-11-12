import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import PadlockIcon from './PadlockIcon.vue'

describe('PadlockIcon', () => {
  it('draws a 12px padlock in the current colour, hidden from assistive tech', () => {
    const wrapper = mount(PadlockIcon)
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('width')).toBe('12')
    expect(svg.attributes('height')).toBe('12')
    expect(wrapper.find('path').attributes('stroke')).toBe('currentColor')
  })

  it('honours a custom size', () => {
    const svg = mount(PadlockIcon, { props: { size: 11 } }).find('svg')
    expect(svg.attributes('width')).toBe('11')
    expect(svg.attributes('height')).toBe('11')
  })

  it('has no accessibility violations', async () => {
    expect(await axe(mount(PadlockIcon).html())).toHaveNoViolations()
  })
})
