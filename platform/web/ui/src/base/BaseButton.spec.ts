import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseButton from './BaseButton.vue'

describe('BaseButton', () => {
  it('renders a native button with the default variant/type and slot content', () => {
    const wrapper = mount(BaseButton, { slots: { default: 'Click me' } })
    const button = wrapper.get('button')
    expect(button.text()).toBe('Click me')
    expect(button.attributes('type')).toBe('button')
    expect(button.classes()).toContain('ba-btn')
    expect(button.classes()).toContain('ba-btn--ghost')
  })

  it.each(['rail', 'ghost', 'primary', 'danger'] as const)(
    'applies the ba-btn--%s class for that variant',
    (variant) => {
      const wrapper = mount(BaseButton, { props: { variant } })
      expect(wrapper.get('button').classes()).toContain(`ba-btn--${variant}`)
    },
  )

  it('does not add the active class by default', () => {
    const wrapper = mount(BaseButton)
    expect(wrapper.get('button').classes()).not.toContain('ba-btn--active')
  })

  it('adds the active class when active=true', () => {
    const wrapper = mount(BaseButton, { props: { active: true } })
    expect(wrapper.get('button').classes()).toContain('ba-btn--active')
  })

  it('only adds the bordered class for the rail variant', () => {
    const railBordered = mount(BaseButton, { props: { variant: 'rail', bordered: true } })
    expect(railBordered.get('button').classes()).toContain('ba-btn--bordered')

    const ghostBordered = mount(BaseButton, { props: { variant: 'ghost', bordered: true } })
    expect(ghostBordered.get('button').classes()).not.toContain('ba-btn--bordered')
  })

  it('does not add the bordered class by default', () => {
    const wrapper = mount(BaseButton, { props: { variant: 'rail' } })
    expect(wrapper.get('button').classes()).not.toContain('ba-btn--bordered')
  })

  it('renders the requested native type', () => {
    const wrapper = mount(BaseButton, { props: { type: 'submit' } })
    expect(wrapper.get('button').attributes('type')).toBe('submit')
  })

  it('sets the native disabled attribute when disabled=true', () => {
    const wrapper = mount(BaseButton, { props: { disabled: true } })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it('omits the disabled attribute by default', () => {
    const wrapper = mount(BaseButton)
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('does not fire a forwarded click handler when disabled (native <button disabled>)', async () => {
    const handler = vi.fn()
    const wrapper = mount(BaseButton, {
      props: { disabled: true },
      attrs: { onClick: handler },
    })
    await wrapper.get('button').trigger('click')
    expect(handler).not.toHaveBeenCalled()
  })

  it('forwards a click listener passed via attrs fallthrough', async () => {
    const handler = vi.fn()
    const wrapper = mount(BaseButton, { attrs: { onClick: handler } })
    await wrapper.get('button').trigger('click')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('forwards arbitrary attrs (aria-*, data-*) onto the root button', () => {
    const wrapper = mount(BaseButton, {
      attrs: { 'data-testid': 'my-button', 'aria-controls': 'panel-1' },
      slots: { default: 'Label' },
    })
    const button = wrapper.get('button')
    expect(button.attributes('data-testid')).toBe('my-button')
    expect(button.attributes('aria-controls')).toBe('panel-1')
  })

  it('lets a rail caller override the --ba-rail-transition custom property via style fallthrough', () => {
    // The map rails (Air/Space side menus, MapSidebar's tab rail, the SDR
    // rail) snap colour only on hover (no bg/border-color fade), unlike the
    // Settings nav's bordered rail default — callers override this per-site
    // via an inline style, exactly like
    // --ba-rail-height/--ba-rail-hover-bg/--ba-rail-active-bg.
    const wrapper = mount(BaseButton, {
      props: { variant: 'rail' },
      attrs: { style: '--ba-rail-transition: color 0.15s ease' },
    })
    const button = wrapper.get('button')
    expect((button.element as HTMLElement).style.getPropertyValue('--ba-rail-transition')).toBe(
      'color 0.15s ease',
    )
  })

  describe('size', () => {
    it.each(['compact', 'fitted'] as const)('adds the ba-btn--size-%s class', (size) => {
      const wrapper = mount(BaseButton, { props: { size } })
      expect(wrapper.get('button').classes()).toContain(`ba-btn--size-${size}`)
    })

    it('adds no size class when left at the default', () => {
      const unset = mount(BaseButton).get('button').classes()
      const explicit = mount(BaseButton, { props: { size: 'default' } })
        .get('button')
        .classes()
      expect(unset.filter((name) => name.includes('--size-'))).toEqual([])
      expect(explicit.filter((name) => name.includes('--size-'))).toEqual([])
    })

    it.each(['rail', 'ghost', 'primary', 'danger'] as const)(
      'combines with the %s variant',
      (variant) => {
        const classes = mount(BaseButton, { props: { variant, size: 'compact' } })
          .get('button')
          .classes()
        expect(classes).toEqual(
          expect.arrayContaining([`ba-btn--${variant}`, 'ba-btn--size-compact']),
        )
      },
    )

    it('applies to the link form too', () => {
      const wrapper = mount(BaseButton, { props: { href: '/docs', size: 'compact' } })
      expect(wrapper.get('a').classes()).toContain('ba-btn--size-compact')
    })
  })

  describe('color', () => {
    it.each(['strong', 'muted'] as const)('adds the ba-btn--color-%s class', (color) => {
      const wrapper = mount(BaseButton, { props: { color } })
      expect(wrapper.get('button').classes()).toContain(`ba-btn--color-${color}`)
    })

    it('adds no colour class when left at the default', () => {
      const unset = mount(BaseButton).get('button').classes()
      const explicit = mount(BaseButton, { props: { color: 'default' } })
        .get('button')
        .classes()
      expect(unset.filter((name) => name.includes('--color-'))).toEqual([])
      expect(explicit.filter((name) => name.includes('--color-'))).toEqual([])
    })

    it('keeps an inline hook alongside the colour class, so a one-off can still win', () => {
      const wrapper = mount(BaseButton, {
        props: { color: 'strong' },
        attrs: { style: '--ba-ghost-color: red' },
      })
      const button = wrapper.get('button')
      expect(button.classes()).toContain('ba-btn--color-strong')
      expect(button.attributes('style')).toContain('--ba-ghost-color: red')
    })
  })

  describe('modifier stylesheet', () => {
    const componentSource = readFileSync(resolve(process.cwd(), 'src/base/BaseButton.vue'), 'utf8')

    function ruleBody(selector: string): string {
      const ruleStart = componentSource.lastIndexOf(`\n${selector} {`)
      expect(ruleStart, selector).toBeGreaterThan(-1)
      return componentSource.slice(ruleStart, componentSource.indexOf('}', ruleStart))
    }

    it.each([
      ['.ba-btn--size-compact', '--ba-ghost-height: 28px'],
      ['.ba-btn--size-compact', '--ba-primary-height: 28px'],
      ['.ba-btn--size-compact', '--ba-danger-height: 28px'],
      ['.ba-btn--size-compact', '--ba-rail-height: 30px'],
      ['.ba-btn--size-fitted', '--ba-ghost-height: auto'],
      ['.ba-btn--size-fitted', '--ba-primary-height: auto'],
      ['.ba-btn--size-fitted', '--ba-danger-height: auto'],
      ['.ba-btn--color-strong', '--ba-ghost-color: var(--ink-strong)'],
      ['.ba-btn--color-muted', '--ba-ghost-hover-color: var(--ink)'],
    ])('%s sets %s', (selector, declaration) => {
      expect(ruleBody(selector)).toContain(declaration)
    })

    it('keeps both sizes at the 24px minimum target', () => {
      const floorRule = ruleBody('.ba-btn--size-compact,\n.ba-btn--size-fitted')
      expect(floorRule).toContain('min-height: 24px')
      expect(floorRule).toContain('min-width: 24px')
    })
  })

  describe('as a link (href)', () => {
    it('renders an <a> with the href instead of a <button>', () => {
      const wrapper = mount(BaseButton, {
        props: { href: '/docs/operations' },
        slots: { default: 'Operations' },
      })
      expect(wrapper.find('button').exists()).toBe(false)
      const link = wrapper.get('a')
      expect(link.attributes('href')).toBe('/docs/operations')
      expect(link.text()).toBe('Operations')
    })

    it('keeps the variant, active and bordered styling of a button', () => {
      const wrapper = mount(BaseButton, {
        props: { href: '/docs/', variant: 'rail', active: true, bordered: true },
      })
      expect(wrapper.get('a').classes()).toEqual(
        expect.arrayContaining(['ba-btn', 'ba-btn--rail', 'ba-btn--active', 'ba-btn--bordered']),
      )
    })

    it('drops type and disabled, which do not apply to a link', () => {
      const wrapper = mount(BaseButton, {
        props: { href: '/docs/', type: 'submit', disabled: true },
      })
      const link = wrapper.get('a')
      expect(link.attributes('type')).toBeUndefined()
      expect(link.attributes('disabled')).toBeUndefined()
    })

    it('still fires a forwarded click handler', async () => {
      const handler = vi.fn()
      const wrapper = mount(BaseButton, { props: { href: '/docs/' }, attrs: { onClick: handler } })
      await wrapper.get('a').trigger('click')
      expect(handler).toHaveBeenCalledOnce()
    })

    it('has no href attribute when rendered as a button', () => {
      const wrapper = mount(BaseButton, { slots: { default: 'Go' } })
      expect(wrapper.get('button').attributes('href')).toBeUndefined()
    })

    it('has no accessibility violations as a link', async () => {
      const wrapper = mount(BaseButton, {
        props: { href: '/docs/operations' },
        slots: { default: 'Operations' },
      })
      expect(
        await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    })
  })

  it('has no accessibility violations with visible text content', async () => {
    const wrapper = mount(BaseButton, { slots: { default: 'Apply changes' } })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it.each([
    ['compact', 'strong'],
    ['fitted', 'muted'],
  ] as const)('has no accessibility violations at size %s, colour %s', async (size, color) => {
    const wrapper = mount(BaseButton, { props: { size, color }, slots: { default: 'Save' } })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations when disabled', async () => {
    const wrapper = mount(BaseButton, {
      props: { disabled: true },
      slots: { default: 'Apply changes' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
