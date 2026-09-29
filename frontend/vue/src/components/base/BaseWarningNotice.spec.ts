import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseWarningNotice from './BaseWarningNotice.vue'

describe('BaseWarningNotice', () => {
  it('shows the message as a status, prefixed "Warning:" for screen readers only', () => {
    const wrapper = mount(BaseWarningNotice, { props: { message: 'Radio off channel' } })
    expect(wrapper.attributes('role')).toBe('status')
    const message = wrapper.find('.warning-notice-message')
    expect(message.find('.sr-only').text()).toBe('Warning:')
    expect(message.text()).toBe('Warning: Radio off channel')
  })

  it('hides the decorative "!" mark from assistive tech', () => {
    const wrapper = mount(BaseWarningNotice, { props: { message: 'x' } })
    const icon = wrapper.find('.warning-notice-icon')
    expect(icon.text()).toBe('!')
    expect(icon.attributes('aria-hidden')).toBe('true')
  })

  it('renders an action only when one is slotted in', () => {
    const bare = mount(BaseWarningNotice, { props: { message: 'x' } })
    expect(bare.find('.warning-notice-action').exists()).toBe(false)

    const withAction = mount(BaseWarningNotice, {
      props: { message: 'x' },
      slots: { action: '<button type="button">Take control</button>' },
    })
    expect(withAction.find('.warning-notice-action button').text()).toBe('Take control')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(BaseWarningNotice, {
      props: { message: 'Radio off channel' },
      slots: { action: '<button type="button">Retune</button>' },
    })
    // `region` is off: a lone component has no page landmarks around it.
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
