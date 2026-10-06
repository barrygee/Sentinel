import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BasePillToggle from './BasePillToggle.vue'

describe('BasePillToggle', () => {
  it('renders a type="button" pill with its slot content and the fallthrough family class', () => {
    const wrapper = mount(BasePillToggle, {
      attrs: { class: 'sdr-mode-pill' },
      slots: { default: 'NFM' },
    })
    const pill = wrapper.get('button')
    expect(pill.attributes('type')).toBe('button')
    expect(pill.text()).toBe('NFM')
    expect(pill.classes()).toEqual(['sdr-mode-pill'])
  })

  it('applies the caller-supplied active class only while active', async () => {
    const wrapper = mount(BasePillToggle, {
      props: { active: false, activeClass: 'is-active' },
      attrs: { class: 'settings-source-override-btn' },
      slots: { default: 'AUTO' },
    })
    expect(wrapper.get('button').classes()).toEqual(['settings-source-override-btn'])
    await wrapper.setProps({ active: true })
    expect(wrapper.get('button').classes()).toContain('is-active')
    expect(wrapper.get('button').classes()).toContain('settings-source-override-btn')
  })

  it('adds no class when active without an activeClass (momentary pills)', () => {
    const wrapper = mount(BasePillToggle, {
      props: { active: true },
      slots: { default: 'TUNE' },
    })
    expect(wrapper.get('button').classes()).toEqual([])
  })

  it('passes clicks, disabled and ARIA through to the button element', async () => {
    const wrapper = mount(BasePillToggle, {
      props: { active: true, activeClass: 'sdr-digital-btn--active' },
      attrs: { 'aria-pressed': 'true', 'aria-label': 'Decode digital voice', disabled: true },
      slots: { default: 'DIGITAL' },
    })
    const pill = wrapper.get('button')
    expect(pill.attributes('aria-pressed')).toBe('true')
    expect(pill.attributes('aria-label')).toBe('Decode digital voice')
    expect(pill.attributes('disabled')).toBeDefined()
    // A disabled button swallows activation exactly like the pre-extraction
    // hand-rolled pills.
    await pill.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('emits native clicks to fallthrough listeners when enabled', async () => {
    let clickCount = 0
    const wrapper = mount(BasePillToggle, {
      attrs: {
        onClick: () => {
          clickCount += 1
        },
      },
      slots: { default: '2×' },
    })
    await wrapper.get('button').trigger('click')
    expect(clickCount).toBe(1)
  })

  it('has no axe violations', async () => {
    const wrapper = mount(BasePillToggle, {
      props: { active: true, activeClass: 'active' },
      slots: { default: 'NFM' },
    })
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
