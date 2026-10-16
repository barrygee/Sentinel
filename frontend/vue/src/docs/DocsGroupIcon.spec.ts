import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SectionIcon from '@/components/shared/SectionIcon.vue'
import DocsGroupIcon from './DocsGroupIcon.vue'
import { DOC_GROUP_KEYS } from './docsTypes'

describe('DocsGroupIcon', () => {
  it.each(DOC_GROUP_KEYS)('draws a decorative icon for %s', (groupKey) => {
    const wrapper = mount(DocsGroupIcon, { props: { groupKey } })
    const svg = wrapper.get('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.classes()).toContain('doc-group-icon')
    expect(svg.findAll('path, line, circle, rect, polyline, ellipse').length).toBeGreaterThan(0)
  })

  it.each(['app', 'air', 'space', 'sea', 'land', 'sdr'] as const)(
    'draws the Settings icon for the %s group',
    (groupKey) => {
      const docs = mount(DocsGroupIcon, { props: { groupKey } })
      const settings = mount(SectionIcon, { props: { sectionKey: groupKey } })
      expect(docs.findComponent(SectionIcon).exists()).toBe(true)
      expect(
        docs
          .get('svg')
          .html()
          .replace(/ class="[^"]*"/, ''),
      ).toBe(settings.get('svg').html())
    },
  )

  it.each(['get-started', 'set-up-and-run', 'develop'] as const)(
    'draws its own stroked icon for the %s group',
    (groupKey) => {
      const wrapper = mount(DocsGroupIcon, { props: { groupKey } })
      expect(wrapper.findComponent(SectionIcon).exists()).toBe(false)
      expect(wrapper.get('svg').attributes('stroke')).toBe('currentColor')
    },
  )

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
