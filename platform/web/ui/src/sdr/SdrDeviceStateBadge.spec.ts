import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrDeviceStateBadge from './SdrDeviceStateBadge.vue'

type BadgeState = InstanceType<typeof SdrDeviceStateBadge>['$props']['state']

describe('SdrDeviceStateBadge', () => {
  it.each<[BadgeState, string, string]>([
    ['detected', 'NEW', 'idle'],
    ['configured', 'READY', 'idle'],
    ['starting', 'STARTING', 'idle'],
    ['streaming', 'STREAMING', 'live'],
    ['degraded', 'DEGRADED', 'danger'],
    ['stopped', 'STOPPED', 'idle'],
    ['error', 'ERROR', 'danger'],
  ])('shows %s as the word %s in the %s tone', (state, label, tone) => {
    const wrapper = mount(SdrDeviceStateBadge, { props: { state } })
    expect(wrapper.text()).toBe(label)
    expect(wrapper.classes()).toContain(`sdr-state-badge--${tone}`)
    expect(wrapper.classes()).toHaveLength(2)
  })

  it('has no tooltip and no screen-reader reason without one', () => {
    const wrapper = mount(SdrDeviceStateBadge, { props: { state: 'error' } })
    expect(wrapper.attributes('title')).toBeUndefined()
    expect(wrapper.find('.sr-only').exists()).toBe(false)
  })

  it('treats an explicit null reason as none', () => {
    const wrapper = mount(SdrDeviceStateBadge, { props: { state: 'error', reason: null } })
    expect(wrapper.attributes('title')).toBeUndefined()
    expect(wrapper.find('.sr-only').exists()).toBe(false)
  })

  it('puts a reason in the tooltip and reads it out after the word', () => {
    const wrapper = mount(SdrDeviceStateBadge, {
      props: { state: 'error', reason: 'USB device vanished' },
    })
    expect(wrapper.attributes('title')).toBe('USB device vanished')
    expect(wrapper.find('.sr-only').text()).toBe(': USB device vanished')
    expect(wrapper.text()).toBe('ERROR: USB device vanished')
  })

  it('has no accessibility violations for any state, with or without a reason', async () => {
    const states: BadgeState[] = ['detected', 'streaming', 'degraded', 'error']
    for (const state of states) {
      const wrapper = mount(SdrDeviceStateBadge, { props: { state, reason: 'why' } })
      expect(
        await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    }
    const bare = mount(SdrDeviceStateBadge, { props: { state: 'stopped' } })
    expect(await axe(bare.html(), { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })
})
