import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import CloseIcon from './CloseIcon.vue'

describe('CloseIcon', () => {
  it('draws a 12px × in the current colour, hidden from assistive tech', () => {
    const wrapper = mount(CloseIcon)
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('width')).toBe('12')
    expect(svg.attributes('height')).toBe('12')
    const strokes = wrapper.findAll('line')
    expect(strokes).toHaveLength(2)
    for (const stroke of strokes) expect(stroke.attributes('stroke')).toBe('currentColor')
  })

  it('honours a custom size', () => {
    const svg = mount(CloseIcon, { props: { size: 16 } }).find('svg')
    expect(svg.attributes('width')).toBe('16')
    expect(svg.attributes('height')).toBe('16')
  })

  it('has no accessibility violations', async () => {
    expect(await axe(mount(CloseIcon).html())).toHaveNoViolations()
  })
})
