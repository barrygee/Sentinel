import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import PlaybackLiveButton from './PlaybackLiveButton.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('PlaybackLiveButton', () => {
  it('is a named LIVE button with a decorative dot', () => {
    const wrapper = mount(PlaybackLiveButton)
    const button = wrapper.get('button')
    expect(button.text()).toBe('LIVE')
    expect(button.attributes('aria-label')).toBe('Back to live')
    expect(wrapper.get('.playback-live-dot').attributes('aria-hidden')).toBe('true')
  })

  it('emits goLive when pressed', async () => {
    const wrapper = mount(PlaybackLiveButton)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('goLive')).toHaveLength(1)
  })

  it('has no axe violations', async () => {
    const wrapper = mount(PlaybackLiveButton, { attachTo: document.body })
    expect(await axe(wrapper.html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
