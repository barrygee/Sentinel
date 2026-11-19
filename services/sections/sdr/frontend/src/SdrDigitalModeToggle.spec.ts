import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrDigitalModeToggle from './SdrDigitalModeToggle.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountToggle(enabled: boolean, disabled = false) {
  return mount(SdrDigitalModeToggle, { props: { enabled, disabled }, attachTo: document.body })
}

describe('SdrDigitalModeToggle', () => {
  it('offers to decode digital voice while off', () => {
    const button = mountToggle(false).find('button')
    expect(button.text()).toBe('DMR')
    expect(button.attributes('aria-label')).toBe('Decode digital voice')
    expect(button.attributes('title')).toBe('Decode digital voice')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.classes()).not.toContain('sdr-digital-btn--active')
  })

  it('offers to hide the decoder while on', () => {
    const button = mountToggle(true).find('button')
    expect(button.attributes('aria-label')).toBe('Hide decoder')
    expect(button.attributes('title')).toBe('Hide decoder')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.classes()).toContain('sdr-digital-btn--active')
  })

  it('emits toggle on click', async () => {
    const wrapper = mountToggle(false)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('disables the pill when disabled', () => {
    expect(mountToggle(false, true).find('button').attributes('disabled')).toBeDefined()
    expect(mountToggle(false, false).find('button').attributes('disabled')).toBeUndefined()
  })

  it('has no axe violations in either state', async () => {
    expect(await axe(mountToggle(false).html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(await axe(mountToggle(true).html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
