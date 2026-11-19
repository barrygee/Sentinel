import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrSweepPlayButton from './SdrSweepPlayButton.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountButton(
  props: { sweepName?: 'scan' | 'search'; running?: boolean; disabled?: boolean } = {},
) {
  return mount(SdrSweepPlayButton, {
    props: {
      sweepName: props.sweepName ?? 'scan',
      running: props.running ?? false,
      disabled: props.disabled ?? false,
    },
    attachTo: document.body,
  })
}

describe('SdrSweepPlayButton', () => {
  it.each([
    ['scan', false, 'Start scan'],
    ['scan', true, 'Stop scan'],
    ['search', false, 'Start search'],
    ['search', true, 'Stop search'],
  ] as const)('names a %s button with running=%s "%s"', (sweepName, running, expectedName) => {
    const button = mountButton({ sweepName, running }).find('button')
    expect(button.attributes('aria-label')).toBe(expectedName)
    expect(button.attributes('title')).toBe(expectedName)
  })

  it('shows a play triangle while stopped and a stop square while running', () => {
    expect(mountButton({ running: false }).find('polygon').exists()).toBe(true)
    const running = mountButton({ running: true })
    expect(running.find('rect').exists()).toBe(true)
    expect(running.find('button').classes()).toContain('sdr-search-adhoc-play--active')
  })

  it('carries no active class while stopped', () => {
    expect(mountButton().find('button').classes()).not.toContain('sdr-search-adhoc-play--active')
  })

  it('passes a click through to the parent listener', async () => {
    const wrapper = mountButton()
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('disables the button when disabled', () => {
    expect(mountButton({ disabled: true }).find('button').attributes('disabled')).toBeDefined()
    expect(mountButton({ disabled: false }).find('button').attributes('disabled')).toBeUndefined()
  })

  it('has no axe violations in either state', async () => {
    expect(await axe(mountButton({ running: false }).html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(await axe(mountButton({ running: true }).html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
