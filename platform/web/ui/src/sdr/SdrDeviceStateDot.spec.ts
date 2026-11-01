import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrDeviceStateDot from './SdrDeviceStateDot.vue'

type DotState = InstanceType<typeof SdrDeviceStateDot>['$props']['state']

describe('SdrDeviceStateDot', () => {
  it.each<[DotState, string, string]>([
    ['streaming', 'Streaming', 'live'],
    ['detected', 'New', 'waiting'],
    ['configured', 'Ready', 'waiting'],
    ['starting', 'Starting', 'waiting'],
    ['degraded', 'Degraded', 'waiting'],
    ['stopped', 'Stopped', 'off'],
    ['error', 'Error', 'off'],
  ])('shows %s as %s, in the %s colour', (state, name, tone) => {
    const wrapper = mount(SdrDeviceStateDot, { props: { state } })
    expect(wrapper.classes()).toEqual(['sdr-device-state-dot', `sdr-device-state-dot--${tone}`])
    expect(wrapper.attributes('title')).toBe(name)
    expect(wrapper.find('.sr-only').text()).toBe(name)
  })

  it('is red and says so while the device is unplugged, whatever its last state', () => {
    const wrapper = mount(SdrDeviceStateDot, { props: { state: 'streaming', present: false } })
    expect(wrapper.classes()).toContain('sdr-device-state-dot--off')
    expect(wrapper.attributes('title')).toBe('Not plugged in')
  })

  it('adds a reason to the name, in the tooltip and for screen readers', () => {
    const wrapper = mount(SdrDeviceStateDot, {
      props: { state: 'error', reason: 'USB device vanished' },
    })
    expect(wrapper.attributes('title')).toBe('Error: USB device vanished')
    expect(wrapper.find('.sr-only').text()).toBe('Error: USB device vanished')
  })

  it('treats an explicit null reason as none', () => {
    const wrapper = mount(SdrDeviceStateDot, { props: { state: 'error', reason: null } })
    expect(wrapper.attributes('title')).toBe('Error')
  })

  it('has no accessibility violations in any colour', async () => {
    for (const state of ['streaming', 'configured', 'error'] as const) {
      const wrapper = mount(SdrDeviceStateDot, { props: { state } })
      // A lone fragment has no landmark to sit in; that rule is for whole pages.
      expect(
        await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    }
  })
})
