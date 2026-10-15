import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import DocsGroupIcon from './DocsGroupIcon.vue'
import { DOC_GROUP_KEYS } from './docsTypes'

describe('DocsGroupIcon', () => {
  it.each(DOC_GROUP_KEYS)('draws a decorative icon for %s', (groupKey) => {
    const wrapper = mount(DocsGroupIcon, { props: { groupKey } })
    const svg = wrapper.get('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.findAll('path, line, circle, rect, polyline').length).toBeGreaterThan(0)
  })

  it('draws a different icon for every group', () => {
    const drawings = DOC_GROUP_KEYS.map((groupKey) =>
      mount(DocsGroupIcon, { props: { groupKey } }).get('svg').html(),
    )
    expect(new Set(drawings).size).toBe(DOC_GROUP_KEYS.length)
  })

  it('has no accessibility violations (decorative, hidden from assistive technology)', async () => {
    const wrapper = mount(DocsGroupIcon, { props: { groupKey: 'develop' } })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
