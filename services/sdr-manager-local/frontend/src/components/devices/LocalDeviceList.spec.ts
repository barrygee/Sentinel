import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations, mountWithDeviceEdits } from '../../testing/componentTestUtils'
import { makeDevice } from '../../testing/factories'
import LocalDeviceList from './LocalDeviceList.vue'
import LocalDeviceRow from './LocalDeviceRow.vue'

function snapshot(devices: ReturnType<typeof makeDevice>[]) {
  useLocalSdrStore().applySnapshot({
    generated_at: 0,
    location: { latitude: 1, longitude: 1 },
    sdrs: devices,
  })
}

const PLUGGED = makeDevice({ device_id: 'plugged-1', name: 'Roof' })
const PLUGGED_TWO = makeDevice({
  device_id: 'plugged-2',
  name: 'Attic',
  usb: { manufacturer: null, product: null, serial: 'S2', topology_path: '1-2' },
})
const ABSENT = makeDevice({ device_id: 'absent-1', name: 'Shed', present: false, usb: null })
const DETECTED_GONE = makeDevice({
  device_id: 'gone-1',
  name: '',
  present: false,
  record_id: null,
  usb: null,
})

describe('LocalDeviceList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('says it is looking until the first read of the devices', () => {
    const { wrapper } = mountWithDeviceEdits(LocalDeviceList)
    expect(wrapper.get('.sdr-devices-empty').text()).toBe('Looking for SDRs…')
  })

  it('shows why the devices could not be read, as an alert', () => {
    const store = useLocalSdrStore()
    store.loaded = true
    store.loadError = 'Could not read this machine’s SDRs.'
    const { wrapper } = mountWithDeviceEdits(LocalDeviceList)
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not read this machine’s SDRs.')
  })

  it('says to plug one in when there are no devices at all', () => {
    snapshot([])
    const { wrapper } = mountWithDeviceEdits(LocalDeviceList)
    expect(wrapper.get('.sdr-devices-empty').text()).toContain('No SDRs found.')
    expect(wrapper.findAllComponents(LocalDeviceRow)).toHaveLength(0)
  })

  it('lists plugged-in devices in USB port order with no unplugged heading', () => {
    snapshot([PLUGGED_TWO, PLUGGED])
    const { wrapper } = mountWithDeviceEdits(LocalDeviceList)
    expect(wrapper.findAll('.local-device-name').map((name) => name.text())).toEqual([
      'Roof',
      'Attic',
    ])
    expect(wrapper.find('.local-absent-heading').exists()).toBe(false)
    expect(wrapper.find('.sdr-devices-empty').exists()).toBe(false)
  })

  it('lists configured unplugged devices under NOT PLUGGED IN', () => {
    snapshot([PLUGGED, ABSENT])
    const { wrapper } = mountWithDeviceEdits(LocalDeviceList)
    expect(wrapper.get('.local-absent-heading').text()).toBe('NOT PLUGGED IN')
    expect(wrapper.findAll('.local-device-name').map((name) => name.text())).toEqual([
      'Roof',
      'Shed',
    ])
  })

  it('says nothing is plugged in when only unplugged devices are remembered', () => {
    snapshot([ABSENT])
    const { wrapper } = mountWithDeviceEdits(LocalDeviceList)
    expect(wrapper.get('.sdr-devices-empty').text()).toBe('No SDRs are plugged in right now.')
    expect(wrapper.find('.local-absent-heading').exists()).toBe(true)
  })

  it('does not list an unplugged device that was never configured', () => {
    snapshot([DETECTED_GONE])
    const { wrapper } = mountWithDeviceEdits(LocalDeviceList)
    expect(wrapper.get('.sdr-devices-empty').text()).toBe('No SDRs are plugged in right now.')
    expect(wrapper.findAllComponents(LocalDeviceRow)).toHaveLength(0)
    expect(wrapper.find('.local-absent-heading').exists()).toBe(false)
  })

  it('opens one row at a time and closes it again when pressed twice', async () => {
    snapshot([PLUGGED, PLUGGED_TWO, ABSENT])
    const { wrapper, deviceEdits } = mountWithDeviceEdits(LocalDeviceList)
    const edit = (index: number) => wrapper.findAll('button[title="Edit"]')[index]!
    await edit(0).trigger('click')
    expect(deviceEdits.openDeviceId.value).toBe('plugged-1')
    await edit(1).trigger('click')
    expect(deviceEdits.openDeviceId.value).toBe('plugged-2')
    expect(wrapper.findAll('form')).toHaveLength(1)
    await edit(2).trigger('click')
    expect(deviceEdits.openDeviceId.value).toBe('absent-1')
    await edit(2).trigger('click')
    expect(deviceEdits.openDeviceId.value).toBeNull()
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('has no accessibility violations in every state', async () => {
    const empty = mountWithDeviceEdits(LocalDeviceList)
    await expectNoAxeViolations(empty.wrapper)
    snapshot([PLUGGED, ABSENT])
    const full = mountWithDeviceEdits(LocalDeviceList)
    await full.wrapper.get('button[title="Edit"]').trigger('click')
    await expectNoAxeViolations(full.wrapper)
  })
})
