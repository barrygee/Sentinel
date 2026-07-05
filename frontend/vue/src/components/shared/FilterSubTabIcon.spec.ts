import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe, toHaveNoViolations } from 'jest-axe'
import FilterSubTabIcon from './FilterSubTabIcon.vue'

expect.extend(toHaveNoViolations)

// Every category the FILTER rail can render a sub-tab for, plus an unrecognised id
// that must fall through to the "unknown" glyph (the v-else branch).
const CATEGORIES = [
  'aircraft',
  'airports',
  'mil',
  'space_station',
  'active',
  'weather',
  'navigation',
  'military',
  'amateur',
  'science',
  'cubesat',
  'unknown',
  'totally-unrecognised',
]

describe('FilterSubTabIcon', () => {
  it.each(CATEGORIES)('renders a single decorative svg glyph for "%s"', (category) => {
    const wrapper = mount(FilterSubTabIcon, { props: { category } })
    const svgs = wrapper.findAll('svg')
    // Exactly one glyph renders (the matching v-if / v-else branch).
    expect(svgs).toHaveLength(1)
    // Decorative: the parent button owns the accessible name.
    expect(svgs[0]!.attributes('aria-hidden')).toBe('true')
    // Sized/coloured to match the rail's other icons.
    expect(svgs[0]!.attributes('width')).toBe('19')
    expect(wrapper.html()).toContain('currentColor')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(FilterSubTabIcon, { props: { category: 'weather' } })
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
