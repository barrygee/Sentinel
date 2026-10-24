import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import { makeDevice } from '../../testing/factories'
import SerialConflictBanner from './SerialConflictBanner.vue'

const CONFLICT = { serial: '00000001', deviceIds: ['device-1', 'device-2'] }

describe('SerialConflictBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useLocalSdrStore()
    store.applyDeviceChanged(makeDevice({ device_id: 'device-1', name: 'Roof' }))
    store.applyDeviceChanged(makeDevice({ device_id: 'device-2', name: '' }))
  })

  it('says how many SDRs share which serial', () => {
    const wrapper = mount(SerialConflictBanner, { props: { conflict: CONFLICT } })
    expect(wrapper.get('.warning-notice').text()).toContain(
      '2 SDRs share the serial 00000001. Flash a unique serial onto all but one.',
    )
  })

  it('offers one FLASH button per device, named by device name or else its id', () => {
    const wrapper = mount(SerialConflictBanner, { props: { conflict: CONFLICT } })
    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.text())).toEqual(['FLASH Roof', 'FLASH device-2'])
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual([
      'Flash a new serial onto Roof',
      'Flash a new serial onto device-2',
    ])
  })

  it('falls back to the raw id for a device the store no longer knows', () => {
    const wrapper = mount(SerialConflictBanner, {
      props: { conflict: { serial: 'X', deviceIds: ['vanished-1', 'vanished-2', 'vanished-3'] } },
    })
    expect(wrapper.get('.warning-notice').text()).toContain('3 SDRs share the serial X')
    expect(wrapper.findAll('button')[0]!.text()).toBe('FLASH vanished-1')
  })

  it('opens the serial flash panel for the device whose button is pressed', async () => {
    const wrapper = mount(SerialConflictBanner, { props: { conflict: CONFLICT } })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(useLocalSdrStore().serialFlashDeviceId).toBe('device-2')
    await wrapper.findAll('button')[0]!.trigger('click')
    expect(useLocalSdrStore().serialFlashDeviceId).toBe('device-1')
  })

  it('has no accessibility violations', async () => {
    await expectNoAxeViolations(mount(SerialConflictBanner, { props: { conflict: CONFLICT } }))
  })
})
