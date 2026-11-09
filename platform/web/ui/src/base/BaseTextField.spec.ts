import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseTextField from './BaseTextField.vue'

enableAutoUnmount(afterEach)

/** Mounts the field with a working v-model round trip (the parent owns the value). */
function mountField(
  props: Record<string, unknown> = {},
  modelValue: string | number | null = '',
  attrs: Record<string, unknown> = {},
) {
  const wrapper = mount(BaseTextField, {
    props: {
      label: 'Label',
      modelValue,
      'onUpdate:modelValue': (value: string | number | null) =>
        wrapper.setProps({ modelValue: value }),
      ...props,
    },
    attrs,
    attachTo: document.body,
  })
  return wrapper
}

describe('BaseTextField', () => {
  it('renders a text input named by its visible label', () => {
    const wrapper = mountField()
    const input = wrapper.get('input')
    expect(input.attributes('type')).toBe('text')
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
    expect(wrapper.find('textarea').exists()).toBe(false)
  })

  it('uses the given input id', () => {
    expect(mountField({ inputId: 'freq' }).get('input').attributes('id')).toBe('freq')
  })

  it('renders the given input type', () => {
    expect(mountField({ inputType: 'url' }).get('input').attributes('type')).toBe('url')
  })

  it('shows the model value and updates it as the user types', async () => {
    const wrapper = mountField({}, 'Tower')
    const input = wrapper.get('input')
    expect((input.element as HTMLInputElement).value).toBe('Tower')
    await input.setValue('Approach')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Approach'])
  })

  it('hands back a number from a number input, as native v-model does', async () => {
    const wrapper = mountField({ inputType: 'number' }, 1)
    await wrapper.get('input').setValue('118.5')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([118.5])
  })

  it('renders a textarea when multiline and binds it the same way', async () => {
    const wrapper = mountField({ multiline: true, inputId: 'notes' }, 'first')
    expect(wrapper.find('input').exists()).toBe(false)
    const textarea = wrapper.get('textarea')
    expect(textarea.attributes('id')).toBe('notes')
    expect(textarea.classes()).toContain('ba-text-field__input--multiline')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('first')
    await textarea.setValue('second')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['second'])
  })

  it('forwards other attributes to the input, not the wrapper', () => {
    const wrapper = mountField({}, '', {
      placeholder: 'Label…',
      maxlength: '60',
      disabled: true,
      'aria-label': 'Frequency label',
    })
    const input = wrapper.get('input')
    expect(input.attributes('placeholder')).toBe('Label…')
    expect(input.attributes('maxlength')).toBe('60')
    expect(input.attributes('disabled')).toBeDefined()
    expect(input.attributes('aria-label')).toBe('Frequency label')
    expect(wrapper.attributes('placeholder')).toBeUndefined()
  })

  it('forwards attributes to a multiline textarea too', () => {
    const wrapper = mountField({ multiline: true }, '', { rows: '4' })
    expect(wrapper.get('textarea').attributes('rows')).toBe('4')
  })

  it('keeps class and style on the wrapper', () => {
    const wrapper = mountField({}, '', { class: 'sdr-range-col', style: 'flex: 1 1 0px;' })
    expect(wrapper.classes()).toContain('sdr-range-col')
    expect(wrapper.classes()).toContain('ba-form-field')
    expect(wrapper.attributes('style')).toContain('flex: 1 1 0px')
    expect(wrapper.get('input').classes()).not.toContain('sdr-range-col')
    expect(wrapper.get('input').attributes('style')).toBeUndefined()
  })

  it('marks the input invalid and described by the error line', () => {
    const wrapper = mountField({ inputId: 'freq', error: 'Enter a valid frequency' })
    const input = wrapper.get('input')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe('freq-error')
    expect(input.classes()).toContain('ba-text-field__input--invalid')
    expect(wrapper.get('#freq-error').text()).toBe('Enter a valid frequency')
  })

  it('marks a multiline field invalid the same way', () => {
    const wrapper = mountField({ multiline: true, inputId: 'notes', error: 'Too long' })
    const textarea = wrapper.get('textarea')
    expect(textarea.attributes('aria-invalid')).toBe('true')
    expect(textarea.attributes('aria-describedby')).toBe('notes-error')
    expect(textarea.classes()).toContain('ba-text-field__input--invalid')
  })

  it('carries no invalid state while valid', () => {
    const input = mountField().get('input')
    expect(input.attributes('aria-invalid')).toBeUndefined()
    expect(input.attributes('aria-describedby')).toBeUndefined()
    expect(input.classes()).not.toContain('ba-text-field__input--invalid')
    expect(input.classes()).toContain('ba-text-field__input--panel')
  })

  it('applies the settings density to the field and the input', () => {
    const wrapper = mountField({ density: 'settings' })
    expect(wrapper.classes()).toContain('ba-form-field--settings')
    expect(wrapper.get('input').classes()).toContain('ba-text-field__input--settings')
    expect(wrapper.get('input').classes()).not.toContain('ba-text-field__input--panel')
  })

  it('stacks the caption by default and passes the inline layout through', () => {
    expect(mountField().classes()).toContain('ba-form-field--stacked')
    const inline = mountField({ layout: 'inline', density: 'settings' })
    expect(inline.classes()).toContain('ba-form-field--inline')
    expect(inline.classes()).not.toContain('ba-form-field--stacked')
    // The input itself is still the control the caption points at.
    expect(inline.get('label').attributes('for')).toBe(inline.get('input').attributes('id'))
  })

  it('marks a settings multiline field with both classes its textarea rule keys on', () => {
    const textarea = mountField({ density: 'settings', multiline: true }).get('textarea')
    expect(textarea.classes()).toContain('ba-text-field__input--settings')
    expect(textarea.classes()).toContain('ba-text-field__input--multiline')
  })

  it('shows a null model as an empty field, and hands back what is typed', async () => {
    const wrapper = mountField({ inputType: 'number' }, null)
    const input = wrapper.get('input')
    expect((input.element as HTMLInputElement).value).toBe('')
    await input.setValue('1234')
    expect(wrapper.props('modelValue')).toBe(1234)
  })

  it('passes a hint through and describes the input with it', () => {
    const wrapper = mountField({ inputId: 'lat', hint: 'Decimal degrees.' })
    expect(wrapper.get('.ba-form-field__hint').text()).toBe('Decimal degrees.')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('lat-hint')
  })

  it('marks the input invalid without a message when invalid is set', () => {
    const wrapper = mountField({ invalid: true })
    const input = wrapper.get('input')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.classes()).toContain('ba-text-field__input--invalid')
    expect(wrapper.find('.ba-form-field__error').exists()).toBe(false)
  })

  it('passes errorAlert through, keeping the alert line mounted', () => {
    const wrapper = mountField({ errorAlert: true })
    expect(wrapper.get('.ba-form-field__error').attributes('role')).toBe('alert')
  })

  it('renders no caption without a label, leaving the input named by its aria-label', async () => {
    const wrapper = mount(BaseTextField, {
      props: { modelValue: '5', density: 'settings' },
      attrs: { 'aria-label': 'Radius in nautical miles' },
      attachTo: document.body,
    })
    expect(wrapper.find('label').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-label')).toBe('Radius in nautical miles')
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })

  it('exposes focus(), which moves focus into the input', () => {
    const wrapper = mountField()
    ;(wrapper.vm as unknown as { focus: () => void }).focus()
    expect(document.activeElement).toBe(wrapper.get('input').element)
  })

  it('exposes focus() for a multiline field too', () => {
    const wrapper = mountField({ multiline: true })
    ;(wrapper.vm as unknown as { focus: () => void }).focus()
    expect(document.activeElement).toBe(wrapper.get('textarea').element)
  })

  it('has no accessibility violations, valid or invalid, single or multiline', async () => {
    expect(await axe(mountField().element)).toHaveNoViolations()
    expect(await axe(mountField({ error: 'Required' }).element)).toHaveNoViolations()
    expect(await axe(mountField({ multiline: true }).element)).toHaveNoViolations()
  })
})
