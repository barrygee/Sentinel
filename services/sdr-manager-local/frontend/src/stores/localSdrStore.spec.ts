import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import type { LocalNoticeEvent, LocalStatusResponse } from '../api/types'
import { makeConstraints, makeDevice } from '../testing/factories'
import { deviceLabel, isDeviceIdle, useLocalSdrStore } from './localSdrStore'

const api = vi.hoisted(() => ({
  getStatus: vi.fn(),
  listDevices: vi.fn(),
  patchDevice: vi.fn(),
  forgetDevice: vi.fn(),
  flashSerial: vi.fn(),
}))
vi.mock('../api/sdrManagerLocalApi', () => api)

function usbAt(topologyPath: string | null, serial: string | null = null) {
  return {
    manufacturer: null,
    product: null,
    serial,
    topology_path: topologyPath,
  }
}

function snapshotOf(...sdrs: ReturnType<typeof makeDevice>[]): LocalStatusResponse {
  return { generated_at: 1, location: { latitude: 51, longitude: -1 }, sdrs }
}

function notice(overrides: Partial<LocalNoticeEvent> = {}): LocalNoticeEvent {
  return {
    level: 'warn',
    code: 'device_busy',
    message: 'Busy',
    device_id: 'device-1',
    ts: 100,
    ...overrides,
  }
}

describe('localSdrStore helpers', () => {
  it('labels a device by its name, else its id', () => {
    expect(deviceLabel({ name: 'Roof', device_id: 'id-1' })).toBe('Roof')
    expect(deviceLabel({ name: '', device_id: 'id-1' })).toBe('id-1')
  })

  it('treats starting and streaming as busy and every other state as idle', () => {
    expect(isDeviceIdle(makeDevice({ state: 'starting' }))).toBe(false)
    expect(isDeviceIdle(makeDevice({ state: 'streaming' }))).toBe(false)
    expect(isDeviceIdle(makeDevice({ state: 'configured' }))).toBe(true)
    expect(isDeviceIdle(makeDevice({ state: 'error' }))).toBe(true)
  })
})

describe('localSdrStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const mock of Object.values(api)) mock.mockReset()
  })

  describe('applySnapshot', () => {
    it('replaces every device, location and clears a load error', () => {
      const store = useLocalSdrStore()
      store.loadError = 'old'
      store.applyDeviceChanged(makeDevice({ device_id: 'stale' }))

      store.applySnapshot(snapshotOf(makeDevice({ device_id: 'fresh' })))

      expect(store.devices.map((device) => device.device_id)).toEqual(['fresh'])
      expect(store.devicesById['stale']).toBeUndefined()
      expect(store.location).toEqual({ latitude: 51, longitude: -1 })
      expect(store.loaded).toBe(true)
      expect(store.loadError).toBeNull()
    })

    it('orders devices by USB topology numerically, absent devices last', () => {
      const store = useLocalSdrStore()
      store.applySnapshot(
        snapshotOf(
          makeDevice({ device_id: 'absent', present: false, usb: null, usb_last_known: null }),
          makeDevice({ device_id: 'ten', usb: usbAt('1-10') }),
          makeDevice({ device_id: 'two', usb: usbAt('1-2') }),
          makeDevice({ device_id: 'remembered', usb: null, usb_last_known: usbAt('1-5') }),
          makeDevice({ device_id: 'no-path', usb: usbAt(null) }),
        ),
      )

      expect(store.devices.map((device) => device.device_id)).toEqual([
        'two',
        'remembered',
        'ten',
        // Both have no known path: they keep the snapshot's relative order (stable sort).
        'absent',
        'no-path',
      ])
    })
  })

  describe('derived lists', () => {
    it('splits present devices from configured-but-absent ones and ignores unconfigured absent ones', () => {
      const store = useLocalSdrStore()
      store.applySnapshot(
        snapshotOf(
          makeDevice({ device_id: 'here' }),
          makeDevice({ device_id: 'gone-configured', present: false, record_id: 7 }),
          makeDevice({ device_id: 'gone-detected', present: false, record_id: null }),
        ),
      )

      expect(store.presentDevices.map((device) => device.device_id)).toEqual(['here'])
      expect(store.absentDevices.map((device) => device.device_id)).toEqual(['gone-configured'])
    })

    it('skips ids in the order that no longer have a device', () => {
      const store = useLocalSdrStore()
      store.applySnapshot(snapshotOf(makeDevice({ device_id: 'a' })))
      store.devicesById = {}

      expect(store.devices).toEqual([])
    })

    it('reports devices sharing a serial and ignores unique, missing and absent ones', () => {
      const store = useLocalSdrStore()
      store.applySnapshot(
        snapshotOf(
          makeDevice({ device_id: 'one', usb: usbAt('1-1', '0001') }),
          makeDevice({ device_id: 'two', usb: usbAt('1-2', '0001') }),
          makeDevice({ device_id: 'unique', usb: usbAt('1-3', '0002') }),
          makeDevice({ device_id: 'blank', usb: usbAt('1-4', '') }),
          makeDevice({ device_id: 'no-usb', usb: null }),
          makeDevice({ device_id: 'away', present: false, usb: usbAt('1-5', '0002') }),
        ),
      )

      expect(store.serialConflicts).toEqual([{ serial: '0001', deviceIds: ['one', 'two'] }])
    })

    it('flags a missing location only when one is known to be blank', () => {
      const store = useLocalSdrStore()
      expect(store.locationMissing).toBe(false)

      store.location = { latitude: 51, longitude: -1 }
      expect(store.locationMissing).toBe(false)
      store.location = { latitude: null, longitude: -1 }
      expect(store.locationMissing).toBe(true)
      store.location = { latitude: 51, longitude: null }
      expect(store.locationMissing).toBe(true)
    })
  })

  describe('announcements', () => {
    it('clears first then sets the sentence on a microtask, so a repeat is read again', async () => {
      const store = useLocalSdrStore()
      store.announce('Hello.')
      expect(store.announcement).toBe('')

      await flushPromises()
      expect(store.announcement).toBe('Hello.')

      store.announce('Hello.')
      expect(store.announcement).toBe('')
      await flushPromises()
      expect(store.announcement).toBe('Hello.')
    })

    async function announcementAfter(action: () => void): Promise<string> {
      action()
      await flushPromises()
      return useLocalSdrStore().announcement
    }

    it('announces a newly seen present device', async () => {
      const store = useLocalSdrStore()

      expect(
        await announcementAfter(() => store.applyDeviceChanged(makeDevice({ name: 'Roof' }))),
      ).toBe('Roof connected.')
    })

    it('stays silent for a newly seen absent device', async () => {
      const store = useLocalSdrStore()

      expect(
        await announcementAfter(() => store.applyDeviceChanged(makeDevice({ present: false }))),
      ).toBe('')
    })

    it('announces unplugging and replugging', async () => {
      const store = useLocalSdrStore()
      store.applyDeviceChanged(makeDevice({ name: 'Roof' }))

      expect(
        await announcementAfter(() => store.applyDeviceChanged(makeDevice({ present: false }))),
      ).toBe('Roof disconnected.')
      expect(await announcementAfter(() => store.applyDeviceChanged(makeDevice()))).toBe(
        'Roof connected.',
      )
    })

    it('announces a state change, with the reason for an error', async () => {
      const store = useLocalSdrStore()
      store.applyDeviceChanged(makeDevice({ name: 'Roof', state: 'configured' }))

      expect(
        await announcementAfter(() => store.applyDeviceChanged(makeDevice({ state: 'streaming' }))),
      ).toBe('Roof now streaming.')
      expect(
        await announcementAfter(() =>
          store.applyDeviceChanged(makeDevice({ state: 'error', state_reason: 'usb reset' })),
        ),
      ).toBe('Roof error: usb reset.')
      expect(
        await announcementAfter(() =>
          store.applyDeviceChanged(makeDevice({ state: 'configured' })),
        ),
      ).toBe('Roof now configured.')
      // error -> configured above; now error with no reason.
      store.applyDeviceChanged(makeDevice({ state: 'streaming' }))
      expect(
        await announcementAfter(() =>
          store.applyDeviceChanged(makeDevice({ state: 'error', state_reason: null })),
        ),
      ).toBe('Roof error.')
    })

    it('stays silent when nothing worth saying changed', async () => {
      const store = useLocalSdrStore()
      store.applyDeviceChanged(makeDevice())
      await flushPromises()
      store.announce('') // reset
      await flushPromises()

      expect(
        await announcementAfter(() => store.applyDeviceChanged(makeDevice({ notes: 'edited' }))),
      ).toBe('')
    })
  })

  describe('applyDeviceChanged', () => {
    it('adds a new device in topology order and replaces a known one in place', () => {
      const store = useLocalSdrStore()
      store.applyDeviceChanged(makeDevice({ device_id: 'b', usb: usbAt('1-2') }))
      store.applyDeviceChanged(makeDevice({ device_id: 'a', usb: usbAt('1-1') }))
      store.applyDeviceChanged(makeDevice({ device_id: 'b', usb: usbAt('1-2'), name: 'Renamed' }))

      expect(store.devices.map((device) => device.device_id)).toEqual(['a', 'b'])
      expect(store.devicesById['b']?.name).toBe('Renamed')
    })
  })

  describe('applyDeviceRemoved', () => {
    it('removes the device, announces it and closes its serial panel', async () => {
      const store = useLocalSdrStore()
      store.applyDeviceChanged(makeDevice({ device_id: 'a', name: 'Roof' }))
      store.openSerialFlash('a')

      store.applyDeviceRemoved('a')
      await flushPromises()

      expect(store.devices).toEqual([])
      expect(store.devicesById['a']).toBeUndefined()
      expect(store.serialFlashDeviceId).toBeNull()
      expect(store.announcement).toBe('Roof disconnected.')
    })

    it('leaves another device’s serial panel open', () => {
      const store = useLocalSdrStore()
      store.applyDeviceChanged(makeDevice({ device_id: 'a' }))
      store.applyDeviceChanged(makeDevice({ device_id: 'b', usb: usbAt('1-2') }))
      store.openSerialFlash('b')

      store.applyDeviceRemoved('a')

      expect(store.serialFlashDeviceId).toBe('b')
      expect(store.devices.map((device) => device.device_id)).toEqual(['b'])
    })

    it('ignores a device it never had', async () => {
      const store = useLocalSdrStore()

      store.applyDeviceRemoved('ghost')
      await flushPromises()

      expect(store.announcement).toBe('')
    })
  })

  describe('serial flash panel', () => {
    it('opens for a device, exposes it, and closes', () => {
      const store = useLocalSdrStore()
      store.applyDeviceChanged(makeDevice({ device_id: 'a' }))
      expect(store.serialFlashDevice).toBeNull()

      store.openSerialFlash('a')
      expect(store.serialFlashDevice?.device_id).toBe('a')

      store.closeSerialFlash()
      expect(store.serialFlashDeviceId).toBeNull()
      expect(store.serialFlashDevice).toBeNull()
    })

    it('exposes null when the chosen device is unknown', () => {
      const store = useLocalSdrStore()
      store.openSerialFlash('ghost')

      expect(store.serialFlashDevice).toBeNull()
    })

    it('flashSerial delegates to the API and returns its answer', async () => {
      const accepted = { device_id: 'a', operation_id: 'op', status: 'in_progress' }
      api.flashSerial.mockResolvedValue(accepted)
      const store = useLocalSdrStore()

      await expect(store.flashSerial('a', 'NEW-1')).resolves.toBe(accepted)
      expect(api.flashSerial).toHaveBeenCalledWith('a', 'NEW-1')
    })
  })

  describe('notices', () => {
    it('adds newest first with a counter of one', () => {
      const store = useLocalSdrStore()
      store.applyNotice(notice({ ts: 1, code: 'first' }))
      store.applyNotice(notice({ ts: 2, code: 'second' }))

      expect(store.notices.map((item) => item.code)).toEqual(['second', 'first'])
      expect(store.notices[0]).toMatchObject({ repeatCount: 1, dismissed: false, lastSeenTs: 2 })
      expect(new Set(store.notices.map((item) => item.id)).size).toBe(2)
    })

    it('folds an identical undismissed notice into a counter and keeps its place', () => {
      const store = useLocalSdrStore()
      store.applyNotice(notice({ ts: 1 }))
      store.applyNotice(notice({ ts: 2, code: 'other' }))
      store.applyNotice(notice({ ts: 3 }))

      expect(store.notices).toHaveLength(2)
      const folded = store.notices.find((item) => item.code === 'device_busy')
      expect(folded).toMatchObject({ repeatCount: 2, lastSeenTs: 3 })
      expect(store.notices.map((item) => item.code)).toEqual(['other', 'device_busy'])
    })

    it.each([
      ['device', { device_id: 'device-2' }],
      ['code', { code: 'different' }],
      ['message', { message: 'Different' }],
    ])('does not fold notices that differ in %s', (_field, override) => {
      const store = useLocalSdrStore()
      store.applyNotice(notice())
      store.applyNotice(notice(override))

      expect(store.notices).toHaveLength(2)
    })

    it('starts a new entry when the identical earlier one was dismissed', () => {
      const store = useLocalSdrStore()
      store.applyNotice(notice())
      store.dismissNotice(store.notices[0]!.id)
      store.applyNotice(notice({ ts: 5 }))

      expect(store.notices).toHaveLength(2)
      expect(store.visibleNotices).toHaveLength(1)
      expect(store.visibleNotices[0]!.lastSeenTs).toBe(5)
    })

    it('dismisses only the named notice', () => {
      const store = useLocalSdrStore()
      store.applyNotice(notice({ code: 'one' }))
      store.applyNotice(notice({ code: 'two' }))
      const [newest] = store.notices

      store.dismissNotice(newest!.id)

      expect(store.visibleNotices.map((item) => item.code)).toEqual(['one'])
    })

    it('keeps at most 50 notices, dropping the oldest', () => {
      const store = useLocalSdrStore()
      for (let index = 0; index < 55; index += 1) {
        store.applyNotice(notice({ code: `code-${index}`, ts: index }))
      }

      expect(store.notices).toHaveLength(50)
      expect(store.notices[0]!.code).toBe('code-54')
      expect(store.notices.at(-1)!.code).toBe('code-5')
    })
  })

  it('setConnection records the stream state', () => {
    const store = useLocalSdrStore()
    expect(store.connection).toBe('connecting')

    store.setConnection('live')

    expect(store.connection).toBe('live')
  })

  describe('refreshStatus', () => {
    it('applies the status as a snapshot', async () => {
      api.getStatus.mockResolvedValue(snapshotOf(makeDevice({ device_id: 'a' })))
      const store = useLocalSdrStore()

      await store.refreshStatus()

      expect(store.devices.map((device) => device.device_id)).toEqual(['a'])
      expect(store.loaded).toBe(true)
    })

    it('reports an unreadable machine and still counts as loaded', async () => {
      api.getStatus.mockRejectedValue(new Error('down'))
      const store = useLocalSdrStore()

      await store.refreshStatus()

      expect(store.loaded).toBe(true)
      expect(store.loadError).toBe('Could not read this machine’s SDRs.')
    })
  })

  describe('refreshConstraints', () => {
    it('stores the port rules and suggestion', async () => {
      const constraints = makeConstraints()
      api.listDevices.mockResolvedValue({ devices: [], port_suggestion: 1300, constraints })
      const store = useLocalSdrStore()

      await store.refreshConstraints()

      expect(store.constraints).toEqual(constraints)
      expect(store.portSuggestion).toBe(1300)
    })

    it('leaves the rules alone when the API cannot answer', async () => {
      api.listDevices.mockRejectedValue(new Error('down'))
      const store = useLocalSdrStore()

      await expect(store.refreshConstraints()).resolves.toBeUndefined()

      expect(store.constraints).toBeNull()
      expect(store.portSuggestion).toBeNull()
    })
  })

  describe('patchDevice', () => {
    beforeEach(() => {
      api.patchDevice.mockResolvedValue({})
      api.listDevices.mockResolvedValue({
        devices: [],
        port_suggestion: 1400,
        constraints: makeConstraints(),
      })
    })

    it('saves, announces the summary and re-reads port rules when the port changed', async () => {
      const store = useLocalSdrStore()

      await store.patchDevice('a', { output_port: 1500 }, 'Saved Roof.')
      await flushPromises()

      expect(api.patchDevice).toHaveBeenCalledWith('a', { output_port: 1500 })
      expect(store.announcement).toBe('Saved Roof.')
      expect(api.listDevices).toHaveBeenCalledOnce()
      expect(store.portSuggestion).toBe(1400)
    })

    it('does not re-read port rules for an edit that leaves the port alone', async () => {
      const store = useLocalSdrStore()

      await store.patchDevice('a', { name: 'New' }, 'Saved New.')

      expect(api.listDevices).not.toHaveBeenCalled()
    })

    it('lets a refusal propagate without announcing', async () => {
      api.patchDevice.mockRejectedValue(new Error('refused'))
      const store = useLocalSdrStore()

      await expect(store.patchDevice('a', { name: 'x' }, 'Saved.')).rejects.toThrow('refused')
      await flushPromises()

      expect(store.announcement).toBe('')
    })
  })

  describe('forgetDevice', () => {
    beforeEach(() => {
      api.forgetDevice.mockResolvedValue(undefined)
      api.listDevices.mockResolvedValue({
        devices: [],
        port_suggestion: null,
        constraints: makeConstraints(),
      })
    })

    it('forgets by name, removes the device and re-reads port rules', async () => {
      const store = useLocalSdrStore()
      store.applyDeviceChanged(
        makeDevice({ device_id: 'a', name: 'Roof', present: false, record_id: 3 }),
      )

      await store.forgetDevice('a')
      await flushPromises()

      expect(api.forgetDevice).toHaveBeenCalledWith('a')
      expect(store.devicesById['a']).toBeUndefined()
      expect(store.announcement).toBe('Forgot Roof.')
      expect(api.listDevices).toHaveBeenCalledOnce()
    })

    it('falls back to the id for a device the store does not hold', async () => {
      const store = useLocalSdrStore()

      await store.forgetDevice('ghost')
      await flushPromises()

      expect(store.announcement).toBe('Forgot ghost.')
    })

    it('lets a refusal propagate and keeps the device', async () => {
      api.forgetDevice.mockRejectedValue(new Error('still plugged in'))
      const store = useLocalSdrStore()
      store.applyDeviceChanged(makeDevice({ device_id: 'a' }))

      await expect(store.forgetDevice('a')).rejects.toThrow('still plugged in')

      expect(store.devicesById['a']).toBeDefined()
    })
  })
})
