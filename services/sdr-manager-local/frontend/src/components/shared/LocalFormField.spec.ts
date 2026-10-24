import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import LocalFormField from './LocalFormField.vue'

/** A field whose slot input binds what the field hands it, as every real caller does. */
function mountField(props: { hint?: string; error?: string | null } = {}) {
  return mount(LocalFormField, {
    props: { label: 'NAME', fieldId: 'name-field', ...props },
    slots: {
      default: `<template #default="{ describedBy, invalid }">
        <input id="name-field" :aria-describedby="describedBy" :aria-invalid="invalid" />
      </template>`,
    },
  })
}

describe('LocalFormField', () => {
  it('points its label at the input id so the input is named by it', () => {
    const wrapper = mountField()
    expect(wrapper.get('label').attributes('for')).toBe('name-field')
    expect(wrapper.get('label').text()).toBe('NAME')
  })

  it('renders neither hint nor error by default and describes nothing', () => {
    const wrapper = mountField()
    expect(wrapper.find('.local-field-hint').exists()).toBe(false)
    expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('false')
  })

  it('shows the hint and describes the input by it', () => {
    const wrapper = mountField({ hint: 'Up to 64 characters.' })
    expect(wrapper.get('#name-field-hint').text()).toBe('Up to 64 characters.')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('name-field-hint')
  })

  it('shows the error, marks the input invalid and describes it by the error', () => {
    const wrapper = mountField({ error: 'Enter a name.' })
    expect(wrapper.get('#name-field-error').text()).toBe('Enter a name.')
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('name-field-error')
  })

  it('describes the input by the hint and then the error when both are present', () => {
    const wrapper = mountField({ hint: 'A hint.', error: 'An error.' })
    expect(wrapper.get('input').attributes('aria-describedby')).toBe(
      'name-field-hint name-field-error',
    )
  })

  it('treats an empty error string as no error', () => {
    const wrapper = mountField({ error: '' })
    expect(wrapper.find('#name-field-error').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
  })

  it('has no accessibility violations with a hint and an error', async () => {
    await expectNoAxeViolations(mountField({ hint: 'A hint.', error: 'An error.' }))
  })
})
