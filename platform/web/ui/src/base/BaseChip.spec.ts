import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseChip from './BaseChip.vue'

describe('BaseChip', () => {
  it('renders an unselected type="button" chip with its slot content by default', () => {
    const wrapper = mount(BaseChip, { slots: { default: 'Airband' } })
    const chip = wrapper.get('button')
    expect(chip.attributes('type')).toBe('button')
    expect(chip.text()).toBe('Airband')
    expect(chip.classes()).toEqual(['base-chip'])
  })

  it('adds the active class only while active', async () => {
    const wrapper = mount(BaseChip, { props: { active: true }, slots: { default: 'All' } })
    expect(wrapper.get('button').classes().sort()).toEqual(['base-chip', 'base-chip--active'])
    await wrapper.setProps({ active: false })
    expect(wrapper.get('button').classes()).toEqual(['base-chip'])
  })

  it('passes clicks, disabled, title and aria-pressed through to the button', async () => {
    const wrapper = mount(BaseChip, {
      props: { active: true },
      attrs: { disabled: false, title: 'Show 2 m repeaters', 'aria-pressed': 'true' },
      slots: { default: '2M' },
    })
    const chip = wrapper.get('button')
    expect(chip.attributes('title')).toBe('Show 2 m repeaters')
    expect(chip.attributes('aria-pressed')).toBe('true')
    await chip.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    const disabledWrapper = mount(BaseChip, { attrs: { disabled: true }, slots: { default: 'FM' } })
    expect(disabledWrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it('renders a display-only span, with no button semantics, when as="span"', () => {
    const wrapper = mount(BaseChip, {
      props: { as: 'span', active: true },
      slots: { default: 'Marine' },
    })
    expect(wrapper.find('button').exists()).toBe(false)
    const chip = wrapper.get('span')
    expect(chip.text()).toBe('Marine')
    expect(chip.attributes('type')).toBeUndefined()
    expect(chip.classes().sort()).toEqual(['base-chip', 'base-chip--active'])
  })

  it('a display-only chip without active has only the base class', () => {
    const wrapper = mount(BaseChip, { props: { as: 'span' }, slots: { default: 'Air' } })
    expect(wrapper.get('span').classes()).toEqual(['base-chip'])
  })

  it('has no axe violations as a toggle button or as a label', async () => {
    const toggle = mount(BaseChip, {
      props: { active: true },
      attrs: { 'aria-pressed': 'true' },
      slots: { default: 'Airband' },
      attachTo: document.body,
    })
    expect(await axe(toggle.element)).toHaveNoViolations()
    toggle.unmount()
    const label = mount(BaseChip, {
      props: { as: 'span', active: true },
      slots: { default: 'Airband' },
      attachTo: document.body,
    })
    expect(await axe(label.element)).toHaveNoViolations()
    label.unmount()
  })
})
