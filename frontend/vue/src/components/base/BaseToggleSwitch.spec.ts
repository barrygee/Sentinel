import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseToggleSwitch from './BaseToggleSwitch.vue'

describe('BaseToggleSwitch', () => {
  it('renders as an accessible switch reflecting modelValue=false', () => {
    const wrapper = mount(BaseToggleSwitch, {
      props: { modelValue: false, accessibleName: 'Toggle example setting' },
    })
    const toggleSwitch = wrapper.get('[role="switch"]')
    expect(toggleSwitch.attributes('aria-checked')).toBe('false')
    expect(toggleSwitch.attributes('aria-label')).toBe('Toggle example setting')
    expect(toggleSwitch.classes()).not.toContain('is-on')
  })

  it('renders as checked and applies the is-on class when modelValue=true', () => {
    const wrapper = mount(BaseToggleSwitch, {
      props: { modelValue: true, accessibleName: 'Toggle example setting' },
    })
    const toggleSwitch = wrapper.get('[role="switch"]')
    expect(toggleSwitch.attributes('aria-checked')).toBe('true')
    expect(toggleSwitch.classes()).toContain('is-on')
  })

  it('emits update:modelValue with the negated value on click', async () => {
    const wrapper = mount(BaseToggleSwitch, {
      props: { modelValue: false, accessibleName: 'Toggle example setting' },
    })
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('emits false when toggling an already-on switch', async () => {
    const wrapper = mount(BaseToggleSwitch, {
      props: { modelValue: true, accessibleName: 'Toggle example setting' },
    })
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('is a native <button type="button"> so keyboard activation (Enter/Space) works without extra script', () => {
    const wrapper = mount(BaseToggleSwitch, {
      props: { modelValue: false, accessibleName: 'Toggle example setting' },
    })
    const toggleSwitch = wrapper.get('[role="switch"]')
    expect(toggleSwitch.element.tagName).toBe('BUTTON')
    expect(toggleSwitch.attributes('type')).toBe('button')
  })

  it('does not emit and marks the control disabled when disabled=true', async () => {
    const wrapper = mount(BaseToggleSwitch, {
      props: { modelValue: false, accessibleName: 'Toggle example setting', disabled: true },
    })
    const toggleSwitch = wrapper.get('[role="switch"]')
    expect(toggleSwitch.attributes('disabled')).toBeDefined()
    await toggleSwitch.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('defaults disabled to false when the prop is omitted', () => {
    const wrapper = mount(BaseToggleSwitch, {
      props: { modelValue: false, accessibleName: 'Toggle example setting' },
    })
    expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeUndefined()
  })

  it('has no accessibility violations when off', async () => {
    const wrapper = mount(BaseToggleSwitch, {
      props: { modelValue: false, accessibleName: 'Toggle example setting' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations when on and disabled', async () => {
    const wrapper = mount(BaseToggleSwitch, {
      props: { modelValue: true, accessibleName: 'Toggle example setting', disabled: true },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
