import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrAprsSymbol from './SdrAprsSymbol.vue'

describe('SdrAprsSymbol', () => {
  it('renders the decoded icon with its type as the accessible name', () => {
    const wrapper = mount(SdrAprsSymbol, { props: { symbol: '/>' } })
    const icon = wrapper.find('[role="img"]')
    expect(icon.attributes('aria-label')).toBe('Car')
    expect(icon.find('svg').exists()).toBe(true)
  })

  it('tooltips the decoded type alongside the raw symbol code', () => {
    const wrapper = mount(SdrAprsSymbol, { props: { symbol: '/#' } })
    expect(wrapper.find('[role="img"]').attributes('title')).toBe('Digipeater (/#)')
  })

  it('falls back to the generic beacon for an unknown symbol', () => {
    const wrapper = mount(SdrAprsSymbol, { props: { symbol: '/€' } })
    expect(wrapper.find('[role="img"]').attributes('aria-label')).toBe('Station')
  })

  it('uses only the label as the tooltip when no symbol is given', () => {
    const wrapper = mount(SdrAprsSymbol, { props: { symbol: null } })
    const icon = wrapper.find('[role="img"]')
    expect(icon.attributes('aria-label')).toBe('Station')
    expect(icon.attributes('title')).toBe('Station')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SdrAprsSymbol, { props: { symbol: '/>' } })
    // region rule disabled: this is a standalone inline fragment, not a page.
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
