import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe, toHaveNoViolations } from 'jest-axe'
import SeaFilterSubTabIcon from './SeaFilterSubTabIcon.vue'

expect.extend(toHaveNoViolations)

// Every category this section registers a FILTER sub-tab for, plus an id it
// does not know, which must fall through to the shared fallback glyph.
const CATEGORIES = ['all', 'cargo', 'tanker', 'passenger', 'fishing', 'other']

describe('SeaFilterSubTabIcon', () => {
  it.each(CATEGORIES)('renders one decorative 19px glyph for "%s"', (category) => {
    const wrapper = mount(SeaFilterSubTabIcon, { props: { category } })
    const svgs = wrapper.findAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0]!.attributes('aria-hidden')).toBe('true')
    expect(svgs[0]!.attributes('width')).toBe('19')
    expect(wrapper.html()).toContain('currentColor')
  })

  it('draws its own glyph for every known category, and the fallback only for an unknown one', () => {
    const glyphFor = (category: string) =>
      mount(SeaFilterSubTabIcon, { props: { category } }).find('svg').html()
    const fallback = glyphFor('not-a-category')
    expect(glyphFor('another-unknown')).toBe(fallback)
    for (const category of CATEGORIES) expect(glyphFor(category)).not.toBe(fallback)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SeaFilterSubTabIcon, { props: { category: 'all' } })
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
