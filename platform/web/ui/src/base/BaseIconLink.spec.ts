import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseIconLink from './BaseIconLink.vue'

describe('BaseIconLink', () => {
  it('renders a real link to the href with the required accessible name and slot icon', () => {
    const wrapper = mount(BaseIconLink, {
      props: { href: '/doc/operations', accessibleName: 'Operations' },
      slots: { default: '<svg aria-hidden="true"></svg>' },
    })
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('/doc/operations')
    expect(link.attributes('aria-label')).toBe('Operations')
    expect(link.find('svg').exists()).toBe(true)
    // A navigation entry is a link, never a button.
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('does not carry button-only attributes onto the link', () => {
    const wrapper = mount(BaseIconLink, {
      props: { href: '/doc/', accessibleName: 'Docs' },
    })
    const link = wrapper.get('a')
    expect(link.attributes('type')).toBeUndefined()
    expect(link.attributes('disabled')).toBeUndefined()
    expect(link.attributes('aria-pressed')).toBeUndefined()
  })

  it('marks the entry aria-current="true" only when current', () => {
    const current = mount(BaseIconLink, {
      props: { href: '/doc/', accessibleName: 'Docs', current: true },
    })
    expect(current.get('a').attributes('aria-current')).toBe('true')

    const notCurrent = mount(BaseIconLink, {
      props: { href: '/doc/', accessibleName: 'Docs' },
    })
    expect(notCurrent.get('a').attributes('aria-current')).toBeUndefined()
  })

  it('keeps the active tint independent from aria-current', () => {
    const activeOnly = mount(BaseIconLink, {
      props: { href: '/doc/', accessibleName: 'Docs', active: true },
    })
    expect(activeOnly.get('a').classes()).toContain('ba-btn--active')
    expect(activeOnly.get('a').attributes('aria-current')).toBeUndefined()

    const idle = mount(BaseIconLink, { props: { href: '/doc/', accessibleName: 'Docs' } })
    expect(idle.get('a').classes()).not.toContain('ba-btn--active')
  })

  it('is bordered by default and can opt out', () => {
    const bordered = mount(BaseIconLink, { props: { href: '/doc/', accessibleName: 'Docs' } })
    expect(bordered.get('a').classes()).toContain('ba-btn--bordered')

    const plain = mount(BaseIconLink, {
      props: { href: '/doc/', accessibleName: 'Docs', bordered: false },
    })
    expect(plain.get('a').classes()).not.toContain('ba-btn--bordered')
  })

  it('renders the tooltip and its side', () => {
    const right = mount(BaseIconLink, {
      props: { href: '/doc/', accessibleName: 'Docs', tooltip: 'DOCS' },
    })
    expect(right.get('a').attributes('data-tooltip')).toBe('DOCS')
    expect(right.get('a').classes()).not.toContain('ba-icon-btn--tooltip-left')

    const left = mount(BaseIconLink, {
      props: { href: '/doc/', accessibleName: 'Docs', tooltip: 'DOCS', tooltipSide: 'left' },
    })
    expect(left.get('a').classes()).toContain('ba-icon-btn--tooltip-left')

    const none = mount(BaseIconLink, { props: { href: '/doc/', accessibleName: 'Docs' } })
    expect(none.get('a').attributes('data-tooltip')).toBeUndefined()
  })

  it('forwards a click listener so a router can navigate', async () => {
    const onClick = vi.fn()
    const wrapper = mount(BaseIconLink, {
      props: { href: '/doc/', accessibleName: 'Docs' },
      attrs: { onClick },
    })
    await wrapper.get('a').trigger('click')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('has no accessibility violations, current or not', async () => {
    const current = mount(BaseIconLink, {
      props: {
        href: '/doc/',
        accessibleName: 'Docs',
        tooltip: 'DOCS',
        current: true,
        active: true,
      },
      slots: { default: '<svg aria-hidden="true"></svg>' },
    })
    expect(
      await axe(current.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
    const idle = mount(BaseIconLink, {
      props: { href: '/doc/', accessibleName: 'Docs' },
      slots: { default: '<svg aria-hidden="true"></svg>' },
    })
    expect(await axe(idle.html(), { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })
})
