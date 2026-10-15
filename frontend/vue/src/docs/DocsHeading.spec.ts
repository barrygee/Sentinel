import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import DocsHeading from './DocsHeading.vue'

describe('DocsHeading', () => {
  it("renders the page's h1 with its text", () => {
    const wrapper = mount(DocsHeading, { slots: { default: 'Check logs' } })
    const heading = wrapper.get('h1')
    expect(heading.text()).toBe('Check logs')
  })

  it("takes the markdown title's anchor id", () => {
    const wrapper = mount(DocsHeading, {
      props: { id: 'check-logs' },
      slots: { default: 'Check logs' },
    })
    expect(wrapper.get('h1').attributes('id')).toBe('check-logs')
  })

  it('has no id attribute when none is given or the id is empty', () => {
    expect(
      mount(DocsHeading, { slots: { default: 'x' } })
        .get('h1')
        .attributes('id'),
    ).toBeUndefined()
    expect(
      mount(DocsHeading, { props: { id: '' }, slots: { default: 'x' } })
        .get('h1')
        .attributes('id'),
    ).toBeUndefined()
  })

  it('can take programmatic focus but is not in the tab order', () => {
    const wrapper = mount(DocsHeading, { slots: { default: 'x' }, attachTo: document.body })
    const heading = wrapper.get('h1').element
    expect(heading.getAttribute('tabindex')).toBe('-1')
    heading.focus()
    expect(document.activeElement).toBe(heading)
    wrapper.unmount()
  })

  it('hides the decorative accent dot from assistive technology', () => {
    const wrapper = mount(DocsHeading, { slots: { default: 'x' } })
    expect(wrapper.get('.doc-heading__dot').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('h1').text()).toBe('x')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(DocsHeading, { props: { id: 'a' }, slots: { default: 'Title' } })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
