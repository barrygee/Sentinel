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

  it('has no accessibility violations with visible text content', async () => {
    const wrapper = mount(BaseButton, { slots: { default: 'Apply changes' } })
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
