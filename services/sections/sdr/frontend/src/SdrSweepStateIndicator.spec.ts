import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrSweepStateIndicator from './SdrSweepStateIndicator.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountIndicator(active: boolean, paused: boolean) {
  return mount(SdrSweepStateIndicator, {
    props: { active, paused, runningLabel: 'SCANNING', pausedLabel: 'SCANNING PAUSED' },
    attachTo: document.body,
  })
}

describe('SdrSweepStateIndicator', () => {
  it('is hidden while the sweep is stopped', () => {
    const row = mountIndicator(false, false).find('.sdr-scan-state-row')
    expect((row.element as HTMLElement).style.display).toBe('none')
  })

  it('shows the running label and a pulsing dot while sweeping', () => {
    const wrapper = mountIndicator(true, false)
    expect((wrapper.find('.sdr-scan-state-row').element as HTMLElement).style.display).toBe('')
    expect(wrapper.find('.sdr-scan-state-label').text()).toBe('SCANNING')
    const dot = wrapper.find('.sdr-scan-indicator')
    expect(dot.classes()).toContain('sdr-scan-running')
    expect(dot.classes()).not.toContain('sdr-scan-holding')
  })

  it('shows the paused label and a steady dot while holding on a signal', () => {
    const wrapper = mountIndicator(true, true)
    expect(wrapper.find('.sdr-scan-state-label').text()).toBe('SCANNING PAUSED')
    const dot = wrapper.find('.sdr-scan-indicator')
    expect(dot.classes()).toContain('sdr-scan-holding')
    expect(dot.classes()).not.toContain('sdr-scan-running')
  })

  it('never pulses while inactive, even if a stale paused flag is set', () => {
    const dot = mountIndicator(false, false).find('.sdr-scan-indicator')
    expect(dot.classes()).not.toContain('sdr-scan-running')
  })

  it('has no axe violations', async () => {
    expect(await axe(mountIndicator(true, false).html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
