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
 * ADD, or ADDED with a cross that removes the radio after REMOVE? YES / NO.
 */
describe('SdrDeviceRadioAction', () => {
  it('offers ADD for an SDR that is not a radio yet, and asks to add it', async () => {
    const wrapper = mountAction()
    const add = wrapper.findComponent(SdrHostDeviceAddButton)
    expect(add.props()).toEqual({ device: DEVICE, adding: false })
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

  it('reads ADDED once the SDR is a radio, with a cross to remove it', async () => {
    const wrapper = mountAction({ radio: RADIO })
    expect(wrapper.find('.sdr-device-radio-added-label').text()).toBe('ADDED')
    expect(wrapper.findComponent(SdrHostDeviceAddButton).exists()).toBe(false)
    const remove = wrapper.find('button[aria-label="Remove Roof RTL-SDR from radios"]')
    await remove.trigger('click')
    expect(wrapper.emitted('start-delete')).toHaveLength(1)
  })

  it('still reads ADDED for a radio whose SDR the host no longer reports', () => {
    const wrapper = mountAction({ device: undefined, radio: RADIO })
    expect(wrapper.text()).toContain('ADDED')
  })

  it('asks REMOVE? and says which answer was given', async () => {
    const wrapper = mountAction({ radio: RADIO, confirming: true })
    expect(wrapper.find('.sdr-device-confirm-label').text()).toBe('REMOVE?')
    expect(wrapper.find('.sdr-device-radio-added').exists()).toBe(false)
    await wrapper.find('.sdr-device-confirm-btn--yes').trigger('click')
    expect(wrapper.emitted('confirm-delete')).toHaveLength(1)
    await wrapper.findAll('.sdr-device-confirm-btn').at(-1)!.trigger('click')
    expect(wrapper.emitted('cancel-delete')).toHaveLength(1)
  })

  it.each([
    ['ADD', {}],
    ['ADDED', { radio: RADIO }],
    ['REMOVE?', { radio: RADIO, confirming: true }],
  ] as const)('has no accessibility violations showing %s', async (_shown, props) => {
    const wrapper = mountAction(props)
    expect(
      await axe(`<div>${wrapper.html()}</div>`, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
