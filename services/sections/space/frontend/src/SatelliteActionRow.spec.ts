import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SatelliteActionRow from './SatelliteActionRow.vue'

type RowProps = InstanceType<typeof SatelliteActionRow>['$props']

const IDLE: RowProps = {
  following: false,
  notifying: false,
  hasDownlink: true,
  autoTuneArmed: false,
  recordArmed: false,
  conflictText: '',
}

function mountRow(overrides: Partial<RowProps> = {}) {
  return mount(SatelliteActionRow, { props: { ...IDLE, ...overrides }, attachTo: document.body })
}

function button(wrapper: ReturnType<typeof mountRow>, name: string) {
  return wrapper.get(`button[aria-label="${name}"]`)
}

describe('SatelliteActionRow', () => {
  it('offers track and pass alerts only for a satellite without a downlink', () => {
    const wrapper = mountRow({ hasDownlink: false })
    const names = wrapper.findAll('button').map((item) => item.attributes('aria-label'))
    expect(names).toEqual(['Track satellite', 'Enable pass alerts'])
    wrapper.unmount()
  })

  it('adds auto-tune and a disabled record button for a downlink-bearing satellite', () => {
    const wrapper = mountRow()
    const names = wrapper.findAll('button').map((item) => item.attributes('aria-label'))
    expect(names).toEqual(['Track satellite', 'Enable pass alerts', 'Auto-tune SDR', 'Record pass'])
    expect(button(wrapper, 'Record pass').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('labels and highlights the active states', () => {
    const wrapper = mountRow({
      following: true,
      notifying: true,
      autoTuneArmed: true,
      recordArmed: true,
    })
    expect(button(wrapper, 'Untrack satellite').classes()).toContain('sat-acc-track-btn--active')
    expect(button(wrapper, 'Disable pass alerts').classes()).toContain('sat-acc-notif-btn--active')
    expect(button(wrapper, 'Auto-tune SDR').classes()).toContain('sat-acc-autotune-btn--active')
    const record = button(wrapper, 'Record pass')
    expect(record.classes()).toContain('sat-acc-record-btn--active')
    expect(record.attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('leaves the inactive buttons unhighlighted', () => {
    const wrapper = mountRow()
    expect(button(wrapper, 'Track satellite').classes()).not.toContain('sat-acc-track-btn--active')
    expect(button(wrapper, 'Auto-tune SDR').classes()).not.toContain('sat-acc-autotune-btn--active')
    wrapper.unmount()
  })

  it('emits one event per button', async () => {
    const wrapper = mountRow({ autoTuneArmed: true })
    await button(wrapper, 'Track satellite').trigger('click')
    await button(wrapper, 'Enable pass alerts').trigger('click')
    await button(wrapper, 'Auto-tune SDR').trigger('click')
    await button(wrapper, 'Record pass').trigger('click')
    expect(Object.keys(wrapper.emitted())).toEqual(
      expect.arrayContaining(['track', 'toggle-pass-notif', 'toggle-auto-tune', 'toggle-record']),
    )
    for (const eventName of ['track', 'toggle-pass-notif', 'toggle-auto-tune', 'toggle-record']) {
      expect(wrapper.emitted(eventName)).toHaveLength(1)
    }
    wrapper.unmount()
  })

  it('does not let a click reach the accordion row behind it', async () => {
    const wrapper = mountRow()
    let reachedParent = false
    wrapper.element.addEventListener('click', () => {
      reachedParent = true
    })
    await button(wrapper, 'Track satellite').trigger('click')
    expect(reachedParent).toBe(false)
    wrapper.unmount()
  })

  it('shows the overlap warning only while auto-tune is armed', () => {
    const conflictText = 'Overlaps NOAA 19 @ 12:00 — earlier pass keeps the radio'
    const disarmed = mountRow({ conflictText })
    expect(disarmed.find('.sat-acc-autotune-warn').exists()).toBe(false)
    disarmed.unmount()

    const armedNoConflict = mountRow({ autoTuneArmed: true })
    expect(armedNoConflict.find('.sat-acc-autotune-warn').exists()).toBe(false)
    armedNoConflict.unmount()

    const armed = mountRow({ autoTuneArmed: true, conflictText })
    expect(armed.get('.sat-acc-autotune-warn').text()).toBe(conflictText)
    armed.unmount()
  })

  it('has no axe violations, idle or fully armed with a warning', async () => {
    const idle = mountRow()
    expect(await axe(idle.element)).toHaveNoViolations()
    idle.unmount()

    const armed = mountRow({
      following: true,
      notifying: true,
      autoTuneArmed: true,
      recordArmed: true,
      conflictText: 'Overlaps NOAA 19 @ 12:00 — earlier pass keeps the radio',
    })
    expect(await axe(armed.element)).toHaveNoViolations()
    armed.unmount()
  })
})
