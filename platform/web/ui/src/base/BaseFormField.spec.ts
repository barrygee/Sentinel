import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import { h } from 'vue'
import BaseFormField from './BaseFormField.vue'

enableAutoUnmount(afterEach)

interface FieldSlotProps {
  controlId: string
  labelId: string
  describedBy: string | undefined
  invalid: boolean
}

/**
 * Mounts the field around a native input that takes every slot prop, so the
 * specs can check the wiring the way a real control would use it.
 */
function mountField(props: Record<string, unknown> = {}) {
  return mount(BaseFormField, {
    props: { label: 'Call sign', ...props },
    slots: {
      default: (slotProps: FieldSlotProps) =>
        h('input', {
          id: slotProps.controlId,
          'aria-describedby': slotProps.describedBy,
          'aria-invalid': slotProps.invalid ? 'true' : undefined,
          'data-label-id': slotProps.labelId,
        }),
    },
    attachTo: document.body,
  })
}

describe('BaseFormField', () => {
  it('renders a label pointing at a generated control id', () => {
    const wrapper = mountField()
    const label = wrapper.get('label')
    const input = wrapper.get('input')
    expect(label.text()).toBe('Call sign')
    expect(input.attributes('id')).toMatch(/^ba-form-field-/)
    expect(label.attributes('for')).toBe(input.attributes('id'))
  })

  it('gives each field in the same app its own generated id', () => {
    // useId counts per app, and the whole UI is one app, so two fields side by
    // side are the case that matters.
    const control = (slotProps: FieldSlotProps) => h('input', { id: slotProps.controlId })
    const wrapper = mount({
      render: () => [
        h(BaseFormField, { label: 'First' }, { default: control }),
        h(BaseFormField, { label: 'Second' }, { default: control }),
      ],
    })
    const [firstId, secondId] = wrapper.findAll('input').map((input) => input.attributes('id'))
    expect(firstId).toMatch(/^ba-form-field-/)
    expect(secondId).toMatch(/^ba-form-field-/)
    expect(firstId).not.toBe(secondId)
  })

  it('uses a given control id and derives the label id from it', () => {
    const wrapper = mountField({ controlId: 'call-sign' })
    expect(wrapper.get('input').attributes('id')).toBe('call-sign')
    expect(wrapper.get('label').attributes('id')).toBe('call-sign-label')
    expect(wrapper.get('input').attributes('data-label-id')).toBe('call-sign-label')
  })

  it('shows no error line and passes no description while valid', () => {
    const wrapper = mountField()
    expect(wrapper.find('.ba-form-field__error').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined()
  })

  it('treats an undefined error as no error', () => {
    const wrapper = mountField({ error: undefined })
    expect(wrapper.find('.ba-form-field__error').exists()).toBe(false)
  })

  it('shows the error under the control and names it as the description', () => {
    const wrapper = mountField({ controlId: 'call-sign', error: 'Required' })
    const errorLine = wrapper.get('.ba-form-field__error')
    expect(errorLine.text()).toBe('Required')
    expect(errorLine.attributes('id')).toBe('call-sign-error')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('call-sign-error')
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    // The message follows the control, so it reads after it.
    expect(wrapper.get('input').element.nextElementSibling).toBe(errorLine.element)
  })

  it('drops the error line once the error clears', async () => {
    const wrapper = mountField({ error: 'Required' })
    await wrapper.setProps({ error: '' })
    expect(wrapper.find('.ba-form-field__error').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
  })

  it('renders a plain caption with an id for a group, not a label', () => {
    const wrapper = mountField({ labelKind: 'group', controlId: 'mode' })
    expect(wrapper.find('label').exists()).toBe(false)
    const caption = wrapper.get('span.ba-form-field__label')
    expect(caption.text()).toBe('Call sign')
    expect(caption.attributes('id')).toBe('mode-label')
  })

  it('applies the panel density by default', () => {
    expect(mountField().classes()).toContain('ba-form-field--panel')
  })

  it('applies the settings density when asked', () => {
    const wrapper = mountField({ density: 'settings' })
    expect(wrapper.classes()).toContain('ba-form-field--settings')
    expect(wrapper.classes()).not.toContain('ba-form-field--panel')
  })

  it('stacks the caption above the control by default', () => {
    const wrapper = mountField()
    expect(wrapper.classes()).toContain('ba-form-field--stacked')
    expect(wrapper.classes()).not.toContain('ba-form-field--inline')
  })

  it('applies the inline layout when asked, alongside the density', () => {
    const wrapper = mountField({ layout: 'inline', density: 'settings' })
    expect(wrapper.classes()).toContain('ba-form-field--inline')
    expect(wrapper.classes()).toContain('ba-form-field--settings')
    expect(wrapper.classes()).not.toContain('ba-form-field--stacked')
  })

  it('keeps caption, control, then error in that order inline, which the grid places by', () => {
    // The inline grid puts the first child in the caption column and flows the
    // rest into the control column, so this order is what lines them up.
    const wrapper = mountField({ layout: 'inline', error: 'Required' })
    const childClasses = [...wrapper.element.children].map(
      (child) => child.className || child.tagName.toLowerCase(),
    )
    expect(childClasses).toEqual(['ba-form-field__label', 'input', 'ba-form-field__error'])
  })

  it('keeps caption, control, then hint in that order inline', () => {
    const wrapper = mountField({ layout: 'inline', hint: 'Up to 8 characters.' })
    const childClasses = [...wrapper.element.children].map(
      (child) => child.className || child.tagName.toLowerCase(),
    )
    expect(childClasses).toEqual(['ba-form-field__label', 'input', 'ba-form-field__hint'])
  })

  it('shows the hint under the control and names it as the description', () => {
    const wrapper = mountField({ controlId: 'lat', hint: 'Decimal degrees.' })
    const hintLine = wrapper.get('.ba-form-field__hint')
    expect(hintLine.text()).toBe('Decimal degrees.')
    expect(hintLine.attributes('id')).toBe('lat-hint')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('lat-hint')
    expect(wrapper.get('input').element.nextElementSibling).toBe(hintLine.element)
  })

  it('treats an undefined hint as no hint', () => {
    const wrapper = mountField({ hint: undefined })
    expect(wrapper.find('.ba-form-field__hint').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
  })

  it('swaps the hint for the error while there is one, and back once it clears', async () => {
    const wrapper = mountField({
      controlId: 'lat',
      hint: 'Decimal degrees.',
      error: 'Out of range',
    })
    expect(wrapper.find('.ba-form-field__hint').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('lat-error')
    await wrapper.setProps({ error: '' })
    expect(wrapper.find('.ba-form-field__error').exists()).toBe(false)
    expect(wrapper.get('.ba-form-field__hint').text()).toBe('Decimal degrees.')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('lat-hint')
  })

  it('marks the control invalid without a message when invalid is set', () => {
    const wrapper = mountField({ invalid: true, hint: 'Decimal degrees.', controlId: 'lat' })
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('.ba-form-field__error').exists()).toBe(false)
    // With no message to point at, the hint still explains the field.
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('lat-hint')
  })

  it('renders no caption when the label is left out', () => {
    const wrapper = mount(BaseFormField, {
      slots: {
        default: (slotProps: FieldSlotProps) =>
          h('input', { id: slotProps.controlId, 'aria-label': 'Radius' }),
      },
    })
    expect(wrapper.find('label').exists()).toBe(false)
    expect(wrapper.find('.ba-form-field__label').exists()).toBe(false)
  })

  it('renders no group caption when the label is left out', () => {
    const wrapper = mountField({ label: '', labelKind: 'group' })
    expect(wrapper.find('.ba-form-field__label').exists()).toBe(false)
  })

  it('keeps an alert error line mounted and empty while valid, then fills it', async () => {
    const wrapper = mountField({ controlId: 'path', errorAlert: true })
    const errorLine = wrapper.get('.ba-form-field__error')
    expect(errorLine.attributes('role')).toBe('alert')
    expect(errorLine.text()).toBe('')
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined()

    await wrapper.setProps({ error: 'Not a folder' })
    // The same element, so the live region existed before its text changed.
    expect(wrapper.get('.ba-form-field__error').element).toBe(errorLine.element)
    expect(errorLine.text()).toBe('Not a folder')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('path-error')
  })

  it('gives an ordinary error line no alert role', () => {
    expect(
      mountField({ error: 'Required' }).get('.ba-form-field__error').attributes('role'),
    ).toBeUndefined()
  })

  it('has no accessibility violations, valid or invalid', async () => {
    expect(await axe(mountField().element)).toHaveNoViolations()
    expect(await axe(mountField({ error: 'Required' }).element)).toHaveNoViolations()
  })

  it('has no accessibility violations in the settings density, with a hint or an alert error', async () => {
    expect(
      await axe(mountField({ density: 'settings', hint: 'Decimal degrees.' }).element),
    ).toHaveNoViolations()
    expect(
      await axe(mountField({ density: 'settings', errorAlert: true, error: 'Bad' }).element),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations inline, with an error or a hint', async () => {
    expect(
      await axe(mountField({ layout: 'inline', density: 'settings', error: 'Required' }).element),
    ).toHaveNoViolations()
    expect(
      await axe(mountField({ layout: 'inline', density: 'settings', hint: 'Optional.' }).element),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations as a group caption', async () => {
    const wrapper = mount(BaseFormField, {
      props: { label: 'Mode', labelKind: 'group' },
      slots: {
        default: (slotProps: FieldSlotProps) =>
          h('div', { role: 'radiogroup', 'aria-labelledby': slotProps.labelId }, [
            h('button', { role: 'radio', 'aria-checked': 'true' }, 'AM'),
          ]),
      },
      attachTo: document.body,
    })
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
