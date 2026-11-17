import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrAddFrequencyButton from './SdrAddFrequencyButton.vue'

enableAutoUnmount(afterEach)

describe('SdrAddFrequencyButton', () => {
  it('is a real button named for what it does', () => {
    const wrapper = mount(SdrAddFrequencyButton)
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('aria-label')).toBe('Add this frequency to the Frequency Manager')
  })

  it('hides its glyph from assistive tech, since the name says it all', () => {
    const wrapper = mount(SdrAddFrequencyButton)
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
  })

  it('opens its tooltip to the left, so it is not cut off at the panel’s right edge', () => {
    const wrapper = mount(SdrAddFrequencyButton)
    expect(wrapper.attributes('data-tooltip')).toBe('ADD TO FREQUENCY MANAGER')
    expect(wrapper.classes()).toContain('ba-icon-action--tip-left')
    expect(wrapper.classes()).not.toContain('ba-icon-action--tip-top')
  })

  it('passes a click through to the parent', async () => {
    const onClick = vi.fn()
    const wrapper = mount(SdrAddFrequencyButton, { attrs: { onClick } })
    await wrapper.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SdrAddFrequencyButton)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
