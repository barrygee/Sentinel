import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseIconButton from './BaseIconButton.vue'

describe('BaseIconButton', () => {
  it('renders a native button carrying the required accessible name', () => {
    const wrapper = mount(BaseIconButton, {
      props: { accessibleName: 'Zoom in' },
      slots: { default: '+' },
    })
    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Zoom in')
    expect(button.text()).toBe('+')
  })

  it('defaults to the rail variant', () => {
    const wrapper = mount(BaseIconButton, { props: { accessibleName: 'Zoom in' } })
    expect(wrapper.get('button').classes()).toContain('ba-btn--rail')
  })

  it('omits the data-tooltip attribute when no tooltip is supplied', () => {
    const wrapper = mount(BaseIconButton, { props: { accessibleName: 'Zoom in' } })
    expect(wrapper.get('button').attributes('data-tooltip')).toBeUndefined()
  })

  it('renders the tooltip text via data-tooltip', () => {
    const wrapper = mount(BaseIconButton, {
      props: { accessibleName: 'Zoom in', tooltip: 'ZOOM IN' },
    })
    expect(wrapper.get('button').attributes('data-tooltip')).toBe('ZOOM IN')
  })

  it('defaults the tooltip to the right side (no tooltip-left modifier class)', () => {
    const wrapper = mount(BaseIconButton, {
      props: { accessibleName: 'Filter', tooltip: 'FILTER' },
    })
    expect(wrapper.get('button').classes()).not.toContain('ba-icon-btn--tooltip-left')
  })

  it('adds the tooltip-left modifier class when tooltipSide="left"', () => {
    const wrapper = mount(BaseIconButton, {
      props: { accessibleName: 'Filter', tooltip: 'FILTER', tooltipSide: 'left' },
    })
    expect(wrapper.get('button').classes()).toContain('ba-icon-btn--tooltip-left')
  })

  it('reflects active state onto the underlying BaseButton', () => {
    const wrapper = mount(BaseIconButton, {
      props: { accessibleName: 'Filter', active: true },
    })
    expect(wrapper.get('button').classes()).toContain('ba-btn--active')
  })

  it('pulses when pulse=true and not active', () => {
    const wrapper = mount(BaseIconButton, {
      props: { accessibleName: 'Alerts', pulse: true },
    })
    expect(wrapper.get('button').classes()).toContain('ba-icon-btn--pulse')
  })

  it('suppresses the pulse once the button becomes active', () => {
    const wrapper = mount(BaseIconButton, {
      props: { accessibleName: 'Alerts', pulse: true, active: true },
    })
    expect(wrapper.get('button').classes()).not.toContain('ba-icon-btn--pulse')
  })

  it('does not pulse by default', () => {
    const wrapper = mount(BaseIconButton, { props: { accessibleName: 'Alerts' } })
    expect(wrapper.get('button').classes()).not.toContain('ba-icon-btn--pulse')
  })

  it('passes variant/bordered/disabled/type through to BaseButton', () => {
    const wrapper = mount(BaseIconButton, {
      props: {
        accessibleName: 'Apply',
        variant: 'ghost',
        bordered: true,
        disabled: true,
        type: 'submit',
      },
    })
    const button = wrapper.get('button')
    expect(button.classes()).toContain('ba-btn--ghost')
    // bordered only styles the rail variant, but the prop still passes through
    // without erroring for other variants (BaseButton itself gates the class).
    expect(button.classes()).not.toContain('ba-btn--bordered')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('type')).toBe('submit')
  })

  it('forwards a click listener and arbitrary attrs onto the root button', async () => {
    const handler = vi.fn()
    const wrapper = mount(BaseIconButton, {
      props: { accessibleName: 'Layers' },
      attrs: { onClick: handler, 'data-tab': 'search', 'aria-expanded': 'false' },
    })
    const button = wrapper.get('button')
    expect(button.attributes('data-tab')).toBe('search')
    expect(button.attributes('aria-expanded')).toBe('false')
    await button.trigger('click')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('has no accessibility violations for an icon-only rail button', async () => {
    const wrapper = mount(BaseIconButton, {
      props: { accessibleName: 'Zoom in', tooltip: 'ZOOM IN' },
      slots: { default: '+' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations while active and pulsing', async () => {
    const wrapper = mount(BaseIconButton, {
      props: { accessibleName: 'Alerts', tooltip: 'ALERTS', active: true, pulse: true },
      slots: { default: '!' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
