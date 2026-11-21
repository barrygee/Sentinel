import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import PlayStopIcon from './PlayStopIcon.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('PlayStopIcon', () => {
  it('draws a play triangle when stop is false', () => {
    const wrapper = mount(PlayStopIcon, { props: { stop: false } })
    expect(wrapper.find('polygon').exists()).toBe(true)
    expect(wrapper.find('rect').exists()).toBe(false)
  })

  it('draws a stop square when stop is true', () => {
    const wrapper = mount(PlayStopIcon, { props: { stop: true } })
    expect(wrapper.find('rect').exists()).toBe(true)
    expect(wrapper.find('polygon').exists()).toBe(false)
  })

  it('draws two pause bars when pause is true, even with stop set', () => {
    const wrapper = mount(PlayStopIcon, { props: { pause: true, stop: true } })
    expect(wrapper.findAll('rect')).toHaveLength(2)
    expect(wrapper.find('polygon').exists()).toBe(false)
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('draws play with no props at all', () => {
    const wrapper = mount(PlayStopIcon)
    expect(wrapper.find('polygon').exists()).toBe(true)
  })

  it('swaps glyphs when the stop prop changes', async () => {
    const wrapper = mount(PlayStopIcon, { props: { stop: false } })
    await wrapper.setProps({ stop: true })
    expect(wrapper.find('rect').exists()).toBe(true)
  })

  it.each([true, false])('is hidden from assistive tech (stop=%s)', (stop) => {
    const wrapper = mount(PlayStopIcon, { props: { stop } })
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('has no axe violations inside a named button', async () => {
    const wrapper = mount(
      {
        components: { PlayStopIcon },
        template:
          '<button type="button" aria-label="Start scan"><PlayStopIcon :stop="false" /></button>',
      },
      { attachTo: document.body },
    )
    expect(await axe(wrapper.html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
