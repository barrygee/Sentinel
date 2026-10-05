import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import RadioIcon from './RadioIcon.vue'

describe('RadioIcon', () => {
  it('renders the receiver glyph at the default size', () => {
    const wrapper = mount(RadioIcon)
    const svg = wrapper.find('svg')

    expect(svg.attributes('width')).toBe('19')
    expect(svg.attributes('height')).toBe('19')
    // The viewBox is fixed so the glyph scales with `size` rather than cropping.
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
  })

  it('honours a custom size without changing the viewBox', () => {
    const wrapper = mount(RadioIcon, { props: { size: 16 } })
    const svg = wrapper.find('svg')

    expect(svg.attributes('width')).toBe('16')
    expect(svg.attributes('height')).toBe('16')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
  })

  it('draws the antenna, body, speaker and both dial lines', () => {
    const wrapper = mount(RadioIcon)

    // The parts that distinguish this glyph from the mirrored hand-drawn
    // copies it replaced: a speaker on the RIGHT and two dial lines on the
    // left. Lose either and the icon stops matching the SDR tab.
    expect(wrapper.find('rect').exists()).toBe(true)
    const speaker = wrapper.find('circle')
    expect(speaker.attributes('cx')).toBe('16')
    expect(speaker.attributes('cy')).toBe('15')

    const lines = wrapper.findAll('line')
    expect(lines).toHaveLength(3)
    // Antenna: rises to the right of the body's top-left corner.
    expect(lines[0]?.attributes('x1')).toBe('6')
    expect(lines[0]?.attributes('y2')).toBe('3')
    // Dial lines, stacked inside the body.
    expect(lines[1]?.attributes('y1')).toBe('13')
    expect(lines[2]?.attributes('y1')).toBe('17')
  })

  it('is decorative, so assistive tech skips it', () => {
    // Every call site's button carries its own accessible name; a second name
    // from the glyph would be read out twice.
    expect(mount(RadioIcon).find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(RadioIcon)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
