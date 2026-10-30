import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ShellNotice from './ShellNotice.vue'

const props = {
  headingId: 'test-notice-heading',
  heading: 'Something is unavailable',
  detail: 'Reload the page to try again.',
}

describe('ShellNotice', () => {
  it('shows its heading and detail', () => {
    const wrapper = mount(ShellNotice, { props })

    expect(wrapper.get('h1').text()).toBe('Something is unavailable')
    expect(wrapper.get('p').text()).toBe('Reload the page to try again.')
  })

  it('is a section labelled by its heading, under the id it was given', () => {
    const wrapper = mount(ShellNotice, { props })

    expect(wrapper.get('h1').attributes('id')).toBe('test-notice-heading')
    expect(wrapper.get('section').attributes('aria-labelledby')).toBe('test-notice-heading')
  })

  it('has no axe violations', async () => {
    const wrapper = mount(ShellNotice, { props, attachTo: document.body })

    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
