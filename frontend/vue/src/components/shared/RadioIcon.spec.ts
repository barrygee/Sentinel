import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('is the only copy of the glyph left in the app', () => {
    // The point of the component: the SDR mark previously existed as four
    // hand-copied SVGs (settings rail, SDR RADIO tab, and two Space auto-tune
    // buttons that had already drifted). A new inline copy would re-open that
    // drift, so no call site may re-declare the body rect's geometry.
    const sources = [
      'src/components/shared/SettingsPanel.vue',
      'src/components/sdr/SdrPanel.vue',
      'src/components/space/SpacePasses.vue',
      'src/components/space/SpaceFilter.vue',
    ]

    for (const source of sources) {
      const markup = readFileSync(resolve(process.cwd(), source), 'utf8')
      expect(markup, `${source} should use <RadioIcon>`).toContain('<RadioIcon')
      expect(markup, `${source} re-declares the radio glyph inline`).not.toMatch(
        /<rect[^>]*x="3"[^>]*y="9"|d="M5 7h14v12H5z"/,
      )
    }
  })
})
