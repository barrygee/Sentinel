import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import MapNoticeBanner from './MapNoticeBanner.vue'

/**
 * The warning strip shared by the domain map notices.
 *
 * What is worth pinning here is the part that is easy to lose in a restyle:
 * the warning has to reach assistive tech as *words*. The glyph and the yellow
 * fill carry the meaning visually, and both are invisible to a screen reader —
 * GOV.UK's warning pattern solves that with a hidden "Warning" alongside a
 * decorative mark, and so does this.
 */

const MESSAGE = 'The AIS decoder is not running; vessels shown may be stale.'

describe('MapNoticeBanner', () => {
  it('shows the message', () => {
    const wrapper = mount(MapNoticeBanner, { props: { message: MESSAGE } })
    expect(wrapper.text()).toContain(MESSAGE)
  })

  it('is announced as a status region', () => {
    const wrapper = mount(MapNoticeBanner, { props: { message: MESSAGE } })
    expect(wrapper.attributes('role')).toBe('status')
  })

  it('hides the decorative glyph from assistive tech', () => {
    const wrapper = mount(MapNoticeBanner, { props: { message: MESSAGE } })
    expect(wrapper.find('.map-notice-icon').attributes('aria-hidden')).toBe('true')
  })

  it('carries the warning in words for screen readers', () => {
    const wrapper = mount(MapNoticeBanner, { props: { message: MESSAGE } })
    expect(wrapper.find('.map-notice-message .sr-only').text()).toBe('Warning:')
  })

  it('renders no action wrapper when no action is given', () => {
    // Without this guard an empty flex child would add a stray gap.
    const wrapper = mount(MapNoticeBanner, { props: { message: MESSAGE } })
    expect(wrapper.find('.map-notice-action').exists()).toBe(false)
  })

  it('renders an action when one is slotted in', () => {
    const wrapper = mount(MapNoticeBanner, {
      props: { message: MESSAGE },
      slots: { action: '<button type="button">Take control</button>' },
    })
    expect(wrapper.find('.map-notice-action button').text()).toBe('Take control')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(MapNoticeBanner, {
      props: { message: MESSAGE },
      attachTo: document.body,
    })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })

  it('has no accessibility violations with an action', async () => {
    const wrapper = mount(MapNoticeBanner, {
      props: { message: MESSAGE },
      slots: { action: '<button type="button">Take control</button>' },
      attachTo: document.body,
    })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
