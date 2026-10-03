import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe, toHaveNoViolations } from 'jest-axe'
import UnknownCategoryGlyph from './UnknownCategoryGlyph.vue'

expect.extend(toHaveNoViolations)

describe('UnknownCategoryGlyph', () => {
  it('renders one decorative 19px question-mark glyph', () => {
    const svgs = mount(UnknownCategoryGlyph).findAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0]!.attributes('aria-hidden')).toBe('true')
    expect(svgs[0]!.attributes('width')).toBe('19')
  })

  it('has no accessibility violations', async () => {
    expect(await axe(mount(UnknownCategoryGlyph).element)).toHaveNoViolations()
  })
})
