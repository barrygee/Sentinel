import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ReplayStatusHeader from './ReplayStatusHeader.vue'

const MOMENT = Date.UTC(2026, 10, 18, 5, 53, 2)

describe('ReplayStatusHeader', () => {
  it('says LIVE while live', () => {
    const wrapper = mount(ReplayStatusHeader, { props: { replaying: false, momentMs: 0 } })
    expect(wrapper.get('.replay-status-label').text()).toBe('LIVE')
    expect(wrapper.text()).toContain('Showing live data')
    expect(wrapper.find('time').exists()).toBe(false)
  })

  it('shows REPLAY and the replayed moment in UTC', () => {
    const wrapper = mount(ReplayStatusHeader, { props: { replaying: true, momentMs: MOMENT } })
    expect(wrapper.get('.replay-status-label').text()).toBe('REPLAY')
    const time = wrapper.get('time')
    expect(time.text()).toBe('18 NOV 05:53:02 UTC')
    expect(time.attributes('datetime')).toBe('2026-11-18T05:53:02.000Z')
  })

  it('has no axe violations', async () => {
    const wrapper = mount(ReplayStatusHeader, {
      props: { replaying: true, momentMs: MOMENT },
      attachTo: document.body,
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
    wrapper.unmount()
  })
})
