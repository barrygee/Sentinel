import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SeaFamilyGlyph from './SeaFamilyGlyph.vue'
import { SEA_FILTER_CATEGORIES } from '@/utils/aisShipType'

describe('SeaFamilyGlyph', () => {
  it.each(SEA_FILTER_CATEGORIES)('renders one decorative glyph for "%s"', (category) => {
    const wrapper = mount(SeaFamilyGlyph, { props: { category } })
    const svgs = wrapper.findAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0]!.attributes('aria-hidden')).toBe('true')
    expect(svgs[0]!.attributes('width')).toBe('16')
    expect(wrapper.html()).toContain('currentColor')
  })

  it('draws each category differently', () => {
    const markup = SEA_FILTER_CATEGORIES.map((category) =>
      mount(SeaFamilyGlyph, { props: { category } }).html(),
    )
    expect(new Set(markup).size).toBe(SEA_FILTER_CATEGORIES.length)
  })

  it('takes a size for the sidebar sub-tabs', () => {
    const wrapper = mount(SeaFamilyGlyph, { props: { category: 'cargo', size: 19 } })
    expect(wrapper.find('svg').attributes('width')).toBe('19')
    expect(wrapper.find('svg').attributes('height')).toBe('19')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SeaFamilyGlyph, { props: { category: 'fishing' } })
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
