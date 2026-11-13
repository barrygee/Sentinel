import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useAdsbSourceDevice } from './adsbSourceDevice'

describe('useAdsbSourceDevice', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function pickAdsbSource(hostId: number, deviceId: string): void {
    useSettingsStore().setSetting('air', 'offgridSdrSource', {
      sdr_manager_host_id: hostId,
      sdr_manager_device_id: deviceId,
    })
  }

  it('is true for exactly the host and device Air picked', () => {
    pickAdsbSource(1, 'serial:97710286')
    const isAdsbSource = useAdsbSourceDevice()

    expect(isAdsbSource(1, 'serial:97710286')).toBe(true)
    expect(isAdsbSource(1, 'usb:1-1.1')).toBe(false)
    expect(isAdsbSource(2, 'serial:97710286')).toBe(false)
  })

  it('is false for every device while Air has no source', () => {
    expect(useAdsbSourceDevice()(1, 'serial:97710286')).toBe(false)
    useSettingsStore().setSetting('air', 'offgridSdrSource', null)
    expect(useAdsbSourceDevice()(1, 'serial:97710286')).toBe(false)
  })

  it('follows a change of source without being asked again', () => {
    const isAdsbSource = useAdsbSourceDevice()
    pickAdsbSource(1, 'usb:1-1.1')
    expect(isAdsbSource(1, 'usb:1-1.1')).toBe(true)

    pickAdsbSource(1, 'serial:97710286')

    expect(isAdsbSource(1, 'usb:1-1.1')).toBe(false)
    expect(isAdsbSource(1, 'serial:97710286')).toBe(true)
  })
})
