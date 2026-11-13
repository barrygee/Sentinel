import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrDeviceRadioAction from './SdrDeviceRadioAction.vue'
import SdrHostDeviceAddButton from './SdrHostDeviceAddButton.vue'
import type { SdrRadioRecord } from '../services/sdrRadiosApi'
import type { SdrManagerDeviceStatus } from '@sentinel/shell-api/types/sdrManager'

const DEVICE: SdrManagerDeviceStatus = {
  device_id: 'serial:00000001',
  name: 'Roof RTL-SDR',
  present: true,
  state: 'streaming',
  state_reason: null,
  enabled: true,
  visibility: 'public',
  notes: '',
  antenna: '',
  needs_identification: false,
  output: { iq_port: 1234, control_port: 1236, host: '192.168.1.20' },
  usb: null,
  usb_last_known: null,
}

const RADIO: SdrRadioRecord = {
  id: 5,
  name: 'Roof RTL-SDR',
  host: '192.168.1.20',
  port: 1234,
  description: '',
  enabled: true,
  bandwidth: null,
  rf_gain: null,
  agc: null,
  sdr_manager_host_id: 1,
  sdr_manager_device_id: 'serial:00000001',
  notes: '',
  antenna: '',
  visibility: 'public',
}

type ActionProps = InstanceType<typeof SdrDeviceRadioAction>['$props']

function mountAction(props: Partial<ActionProps> = {}) {
  return mount(SdrDeviceRadioAction, {
    props: { device: DEVICE, radio: null, adding: false, confirming: false, ...props },
  })
}

/**
 * `SdrDeviceRadioAction` — the radio end of one of this machine's SDR rows:
 * ADD, or a cross that removes the radio after REMOVE? YES / NO.
 */
describe('SdrDeviceRadioAction', () => {
  it("shows ADS-B DECODER, not ADD, for the SDR Air's decoder reads from", () => {
    const wrapper = mountAction({ adsbSource: true })
    expect(wrapper.findComponent(SdrHostDeviceAddButton).exists()).toBe(false)
    expect(wrapper.text()).toContain('ADS-B DECODER')
  })

  it('shows the radio cross, not the tag, for a radio even on the ADS-B source', () => {
    const wrapper = mountAction({ adsbSource: true, radio: RADIO })
    expect(wrapper.find('button[aria-label="Remove Roof RTL-SDR from radios"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('ADS-B DECODER')
  })

  it('shows nothing for the ADS-B source before the host has reported it', () => {
    expect(mountAction({ adsbSource: true, device: undefined }).text()).toBe('')
  })

  it('offers ADD for an SDR that is not a radio yet, and asks to add it', async () => {
    const wrapper = mountAction()
    const add = wrapper.findComponent(SdrHostDeviceAddButton)
    expect(add.props()).toEqual({ device: DEVICE, adding: false, mayUsePrivate: true })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('ADDED')
  })

  it('passes an add in flight to the button', () => {
    const wrapper = mountAction({ adding: true })
    expect(wrapper.find('button').text()).toBe('ADDING…')
  })

  it('shows nothing before the host has reported the SDR', () => {
    const wrapper = mountAction({ device: undefined })
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('shows only a cross to remove it once the SDR is a radio, with no ADDED label', async () => {
    const wrapper = mountAction({ radio: RADIO })
    expect(wrapper.text()).toBe('')
    expect(wrapper.findComponent(SdrHostDeviceAddButton).exists()).toBe(false)
    const remove = wrapper.find('button[aria-label="Remove Roof RTL-SDR from radios"]')
    await remove.trigger('click')
    expect(wrapper.emitted('start-delete')).toHaveLength(1)
  })

  it('still offers the cross for a radio whose SDR the host no longer reports', () => {
    const wrapper = mountAction({ device: undefined, radio: RADIO })
    expect(wrapper.find('button[aria-label="Remove Roof RTL-SDR from radios"]').exists()).toBe(true)
  })

  it('asks REMOVE? and says which answer was given', async () => {
    const wrapper = mountAction({ radio: RADIO, confirming: true })
    expect(wrapper.find('.base-inline-confirm-label').text()).toBe('REMOVE?')
    expect(wrapper.find('.sdr-device-radio-added').exists()).toBe(false)
    await wrapper.find('.base-inline-confirm-btn--confirm').trigger('click')
    expect(wrapper.emitted('confirm-delete')).toHaveLength(1)
    await wrapper.findAll('.base-inline-confirm-btn').at(-1)!.trigger('click')
    expect(wrapper.emitted('cancel-delete')).toHaveLength(1)
  })

  describe('when This machine adds its SDRs automatically', () => {
    it('shows nothing and no cross, keeping its place so the pencils line up', () => {
      const wrapper = mountAction({ radio: RADIO, autoAdd: true })
      expect(wrapper.text()).toBe('')
      expect(wrapper.find('button').exists()).toBe(false)
      expect(wrapper.find('.sdr-device-btn-slot').attributes('aria-hidden')).toBe('true')
    })

    it.each([
      // Private doesn't keep an SDR from its own machine.
      ['ADDING…', { visibility: 'private' as const }],
      ['NOT SET UP', { output: null }],
    ])('has no ADD for an SDR that is not a radio, and says %s', (reason, overrides) => {
      const wrapper = mountAction({ device: { ...DEVICE, ...overrides }, autoAdd: true })
      expect(wrapper.findComponent(SdrHostDeviceAddButton).exists()).toBe(false)
      expect(wrapper.find('.sdr-host-device-reason').text()).toBe(reason)
    })

    it('shows nothing before the host has reported the SDR', () => {
      const wrapper = mountAction({ device: undefined, autoAdd: true })
      expect(wrapper.text()).toBe('')
    })
  })

  it.each([
    ['ADD', {}],
    ['the remove cross', { radio: RADIO }],
    ['REMOVE?', { radio: RADIO, confirming: true }],
  ] as const)('has no accessibility violations showing %s', async (_shown, props) => {
    const wrapper = mountAction(props)
    expect(
      await axe(`<div>${wrapper.html()}</div>`, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
