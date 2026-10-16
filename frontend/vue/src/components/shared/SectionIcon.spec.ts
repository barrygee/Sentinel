import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import RadioIcon from '@sentinel/ui/icons/RadioIcon.vue'
import SectionIcon from './SectionIcon.vue'

const INLINE_KEYS = ['app', 'air', 'space', 'sea', 'land', 'docs'] as const

describe('SectionIcon', () => {
  it.each(INLINE_KEYS)('draws %s inline as one decorative svg', (sectionKey) => {
    const wrapper = mount(SectionIcon, { props: { sectionKey } })
    expect(wrapper.findComponent(RadioIcon).exists()).toBe(false)
    expect(wrapper.findAll('svg')).toHaveLength(1)
    const svg = wrapper.get('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
    expect(svg.findAll('path, line, circle, ellipse').length).toBeGreaterThan(0)
  })

  it.each(['sdr', 'anything-else', ''])('draws the shared radio glyph for %j', (sectionKey) => {
    const wrapper = mount(SectionIcon, { props: { sectionKey } })
    expect(wrapper.findComponent(RadioIcon).exists()).toBe(true)
  })

  it('draws a different icon for every section', () => {
    const drawings = [...INLINE_KEYS, 'sdr'].map((sectionKey) =>
      mount(SectionIcon, { props: { sectionKey } }).html(),
    )
    expect(new Set(drawings).size).toBe(drawings.length)
  })

  // The Settings rail and the docs rail size and colour the icon by class, so
  // a class must reach the <svg> for every key, the radio fallback included.
  it.each([...INLINE_KEYS, 'sdr'])('puts a passed class on the svg for %s', (sectionKey) => {
    const wrapper = mount(SectionIcon, {
      props: { sectionKey },
      attrs: { class: 'rail-icon' },
    })
    expect(wrapper.get('svg').classes()).toContain('rail-icon')
  })

  it('has no accessibility violations (decorative, hidden from assistive technology)', async () => {
    const wrapper = mount(SectionIcon, { props: { sectionKey: 'sea' } })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
