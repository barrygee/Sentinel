import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrPlayStopIcon from './SdrPlayStopIcon.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('SdrPlayStopIcon', () => {
  it('draws a play triangle when stop is false', () => {
    const wrapper = mount(SdrPlayStopIcon, { props: { stop: false } })
    expect(wrapper.find('polygon').exists()).toBe(true)
    expect(wrapper.find('rect').exists()).toBe(false)
  })

  it('draws a stop square when stop is true', () => {
    const wrapper = mount(SdrPlayStopIcon, { props: { stop: true } })
    expect(wrapper.find('rect').exists()).toBe(true)
    expect(wrapper.find('polygon').exists()).toBe(false)
  })

  it('swaps glyphs when the stop prop changes', async () => {
    const wrapper = mount(SdrPlayStopIcon, { props: { stop: false } })
    await wrapper.setProps({ stop: true })
    expect(wrapper.find('rect').exists()).toBe(true)
  })

  it.each([true, false])('is hidden from assistive tech (stop=%s)', (stop) => {
    const wrapper = mount(SdrPlayStopIcon, { props: { stop } })
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('has no axe violations inside a named button', async () => {
    const wrapper = mount(
      {
        components: { SdrPlayStopIcon },
        template:
          '<button type="button" aria-label="Start scan"><SdrPlayStopIcon :stop="false" /></button>',
      },
      { attachTo: document.body },
    )
    expect(await axe(wrapper.html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
