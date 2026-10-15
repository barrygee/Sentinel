import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import DocsCallout from './DocsCallout.vue'
import type { CalloutVariant } from './markdown/docBlocks'

const VARIANTS: CalloutVariant[] = ['note', 'tip', 'important', 'warning', 'caution']

describe('DocsCallout', () => {
  it.each(VARIANTS)('labels a %s callout in words, not by colour alone', (variant) => {
    const wrapper = mount(DocsCallout, { props: { variant }, slots: { default: '<p>Body</p>' } })
    expect(wrapper.get('.doc-callout__label').text()).toBe(variant.toUpperCase())
    expect(wrapper.get('aside').classes()).toContain(`doc-callout--${variant}`)
  })

  it('is a note region with the slot as its body', () => {
    const wrapper = mount(DocsCallout, {
      props: { variant: 'tip' },
      slots: { default: '<p>Body text</p>' },
    })
    expect(wrapper.get('aside').attributes('role')).toBe('note')
    expect(wrapper.get('.doc-callout__body').text()).toBe('Body text')
  })

  it.each(['warning', 'caution'] as const)('draws a warning glyph for %s', (variant) => {
    const wrapper = mount(DocsCallout, { props: { variant } })
    expect(wrapper.find('.doc-callout__glyph').exists()).toBe(true)
    expect(wrapper.find('.doc-callout__dot').exists()).toBe(false)
    expect(wrapper.get('.doc-callout__glyph').attributes('aria-hidden')).toBe('true')
  })

  it.each(['note', 'tip', 'important'] as const)('draws a dot, not a glyph, for %s', (variant) => {
    const wrapper = mount(DocsCallout, { props: { variant } })
    expect(wrapper.find('.doc-callout__dot').exists()).toBe(true)
    expect(wrapper.find('.doc-callout__glyph').exists()).toBe(false)
    expect(wrapper.get('.doc-callout__dot').attributes('aria-hidden')).toBe('true')
  })

  it.each(VARIANTS)('has no accessibility violations for %s', async (variant) => {
    const wrapper = mount(DocsCallout, {
      props: { variant },
      slots: { default: '<p>Be careful.</p>' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
