import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe, toHaveNoViolations } from 'jest-axe'
import SpacePassesTabIcon from './SpacePassesTabIcon.vue'

expect.extend(toHaveNoViolations)

describe('SpacePassesTabIcon', () => {
  it('renders one decorative 19px glyph of three pass arcs', () => {
    const svg = mount(SpacePassesTabIcon).find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('width')).toBe('19')
    expect(svg.findAll('path')).toHaveLength(3)
  })

  it('has no accessibility violations', async () => {
    expect(await axe(mount(SpacePassesTabIcon).element)).toHaveNoViolations()
  })
})
