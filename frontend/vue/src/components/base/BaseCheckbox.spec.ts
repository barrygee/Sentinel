import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseCheckbox from './BaseCheckbox.vue'

describe('BaseCheckbox', () => {
  it('renders a label wrapping the hidden input, then the box, then trailing content', () => {
    const wrapper = mount(BaseCheckbox, {
      props: { checked: false, inputClass: 'sdr-checkbox', boxClass: 'sdr-checkbox-custom' },
      attrs: { class: 'sdr-checkbox-label' },
      slots: { default: '<span class="sdr-checkbox-text">AGC</span>' },
    })
    const label = wrapper.get('label')
    expect(label.classes()).toContain('sdr-checkbox-label')
    const children = Array.from(label.element.children)
    expect(children[0].tagName).toBe('INPUT')
    expect(children[0].classList.contains('sdr-checkbox')).toBe(true)
    // The box must immediately follow the input — every family's checked
    // styling hangs off the `input:checked + box` sibling selector.
    expect(children[1].tagName).toBe('SPAN')
    expect(children[1].classList.contains('sdr-checkbox-custom')).toBe(true)
    expect(children[2].classList.contains('sdr-checkbox-text')).toBe(true)
    const input = wrapper.get('input')
    expect(input.attributes('type')).toBe('checkbox')
    expect((input.element as HTMLInputElement).checked).toBe(false)
  })

  it('reflects the checked prop on the native input', () => {
    const wrapper = mount(BaseCheckbox, {
      props: { checked: true, accessibleName: 'Altitude — civil' },
    })
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('input').attributes('aria-label')).toBe('Altitude — civil')
  })

  it('renders no aria-label or extra classes when the optional props are omitted', () => {
    const wrapper = mount(BaseCheckbox, { props: { checked: false } })
    const input = wrapper.get('input')
    expect(input.attributes('aria-label')).toBeUndefined()
    expect(input.classes()).toEqual(['ba-checkbox-input'])
    expect(input.attributes('disabled')).toBeUndefined()
  })

  it('renders the checkmark slot inside the box', () => {
    const wrapper = mount(BaseCheckbox, {
      props: { checked: true, boxClass: 'adsb-lf-box', accessibleName: 'Aircraft Type — civil' },
      slots: { checkmark: '<svg class="test-check" aria-hidden="true"></svg>' },
    })
    expect(wrapper.get('.adsb-lf-box').find('.test-check').exists()).toBe(true)
  })

  it('re-emits the raw change event and honours disabled', async () => {
    const wrapper = mount(BaseCheckbox, {
      props: { checked: false, accessibleName: 'AGC' },
    })
    await wrapper.get('input').trigger('change')
    const emitted = wrapper.emitted('change')!
    expect(emitted).toHaveLength(1)
    // Raw DOM event passthrough — the AGC parent reads event.target directly.
    expect((emitted[0][0] as Event).target).toBe(wrapper.get('input').element)
    await wrapper.setProps({ disabled: true })
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
  })

  it('has no axe violations with a visible text label and with an aria-label', async () => {
    const axeOptions = { rules: { region: { enabled: false } } }
    const labelled = mount(BaseCheckbox, {
      props: { checked: true },
      slots: { default: '<span>AGC (Automatic Gain Control)</span>' },
    })
    expect(await axe(labelled.html(), axeOptions)).toHaveNoViolations()
    const unlabelled = mount(BaseCheckbox, {
      props: { checked: false, accessibleName: 'Altitude — military' },
    })
    expect(await axe(unlabelled.html(), axeOptions)).toHaveNoViolations()
  })
})
