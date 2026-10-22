import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrDevicesControl from './SdrDevicesControl.vue'
import SdrDeviceForm from './SdrDeviceForm.vue'
import SdrRadioRow from './SdrRadioRow.vue'
import SdrHostDeviceRow from './SdrHostDeviceRow.vue'
import SdrHostGroupHeader from './SdrHostGroupHeader.vue'
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import { RADIOS_CHANGED_EVENT } from '../composables/sdrDeviceEvents'
import type { SdrRadioRecord } from '../services/sdrRadiosApi'
import type {
  SdrManagerHost,
  SdrManagerDeviceSnapshot,
  SdrManagerDeviceStatus,
} from '@sentinel/shell-api/types/sdrManager'

vi.mock('../services/sdrRadiosApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/sdrRadiosApi')>()
  return {
    ...actual,
    listRadios: vi.fn(),
    createRadio: vi.fn(),
    deleteRadio: vi.fn(),
    getRadioStatus: vi.fn(),
  }
})
import {
  announceFakeHostsChanged,
  fakeSdrManagerHosts,
  useFakeSdrManagerHosts,
  withdrawFakeSdrManagerHosts,
} from '../testing/fakeSdrManagerHosts'
useFakeSdrManagerHosts()

import { listRadios, createRadio, deleteRadio, getRadioStatus } from '../services/sdrRadiosApi'

const mockListRadios = vi.mocked(listRadios)
const mockCreateRadio = vi.mocked(createRadio)
const mockDeleteRadio = vi.mocked(deleteRadio)
const mockGetRadioStatus = vi.mocked(getRadioStatus)
const mockListSentryHosts = vi.mocked(fakeSdrManagerHosts.listHosts)
const mockGetSentryHostDevices = vi.mocked(fakeSdrManagerHosts.getHostDevices)

const MANUAL_RADIO: SdrRadioRecord = {
  id: 1,
  name: 'Roof',
  host: '10.0.0.1',
  port: 1234,
  description: '',
  enabled: true,
  bandwidth: null,
  rf_gain: null,
  agc: null,
  sentry_host_id: null,
  sentry_device_id: null,
  notes: '',
  antenna: '',
  visibility: 'public',
}

const HOST: SdrManagerHost = {
  id: 1,
  name: 'Roof Pi',
  address: '192.168.1.50',
  port: 8000,
  enabled: true,
  auth_token_set: false,
  is_local: false,
  created_at: 0,
  last_seen_at: 0,
  last_error: null,
  reachable: true,
  api_version: '1.0.0',
}

const UNREACHABLE_HOST: SdrManagerHost = {
  ...HOST,
  id: 2,
  reachable: false,
  last_error: 'Connection refused',
}

const UNLABELLED_HOST: SdrManagerHost = { ...HOST, id: 3, name: null }

const DEVICE: SdrManagerDeviceStatus = {
  device_id: 'rtl-1',
  name: 'RTL 1',
  present: true,
  state: 'streaming',
  state_reason: null,
  enabled: true,
  visibility: 'public',
  notes: '',
  antenna: '',
  needs_identification: false,
  output: { iq_port: 1234, control_port: 1235, host: '192.168.1.50' },
  usb: null,
  usb_last_known: null,
}

const MIRRORED_RADIO: SdrRadioRecord = {
  ...MANUAL_RADIO,
  id: 2,
  name: 'RTL 1',
  sentry_host_id: 1,
  sentry_device_id: 'rtl-1',
}

function snapshot(
  devices: SdrManagerDeviceStatus[],
  overrides: Partial<SdrManagerDeviceSnapshot> = {},
) {
  return {
    reachable: true,
    last_error: null,
    last_polled_at: 0,
    last_success_at: 0,
    api_version: '1.0.0',
    status: { generated_at: 0, sdrs: devices },
    ...overrides,
  }
}

describe('SdrDevicesControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    // The notifications store fires-and-forgets a POST when a notice is added;
    // stub fetch so that call resolves quietly rather than rejecting to an
    // unhandled network error under jsdom.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    mockListRadios.mockResolvedValue([])
    mockListSentryHosts.mockResolvedValue([])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([]))
    mockGetRadioStatus.mockResolvedValue({ connected: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    activeWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  // Every mount is tracked and unmounted after its test — several tests
  // below dispatch global `document` CustomEvents, and a component left
  // mounted (never reaching onBeforeUnmount) keeps its RADIOS_CHANGED_EVENT/
  // SENTRY_HOSTS_CHANGED_EVENT listeners live, so a later dispatch would fan
  // out to every leaked instance instead of just the one under test.
  const activeWrappers: ReturnType<typeof mount>[] = []
  function mountControl(): ReturnType<typeof mount> {
    const wrapper = mount(SdrDevicesControl)
    activeWrappers.push(wrapper)
    return wrapper
  }

  it('shows an empty message when no Sentry hosts or manual radios are configured', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('.sdr-devices-empty').exists()).toBe(true)
  })

  it("groups a Sentry host's devices under its own header", async () => {
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([DEVICE]))
    const wrapper = mountControl()
    await flushPromises()
    const header = wrapper.findComponent(SdrHostGroupHeader)
    expect(header.props('label')).toBe('Roof Pi')
    expect(header.props('reachable')).toBe(true)
    expect(wrapper.findComponent(SdrHostDeviceRow).exists()).toBe(true)
  })

  it("falls back to the host's address for the group header label when it has no name", async () => {
    mockListSentryHosts.mockResolvedValue([UNLABELLED_HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([]))
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.findComponent(SdrHostGroupHeader).props('label')).toBe(UNLABELLED_HOST.address)
  })

  it('shows a not-yet-mirrored device as an ADD row, and a mirrored one as a full radio row', async () => {
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockListRadios.mockResolvedValue([MIRRORED_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.findComponent(SdrHostDeviceRow).exists()).toBe(false)
    expect(wrapper.findComponent(SdrRadioRow).exists()).toBe(true)
  })

  it('drives edit/delete/save through a mirrored Sentry radio row exactly like a manual one', async () => {
    const changed = vi.fn()
    document.addEventListener(RADIOS_CHANGED_EVENT, changed)
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockListRadios.mockResolvedValue([MIRRORED_RADIO])
    mockDeleteRadio.mockResolvedValue(true)
    const wrapper = mountControl()
    await flushPromises()

    const row = wrapper.findComponent(SdrRadioRow)
    expect(row.props('connected')).toBe(true) // entry.device.present
    row.vm.$emit('toggle-edit')
    await flushPromises()
    expect(wrapper.findComponent(SdrRadioRow).props('open')).toBe(true)
    wrapper.findComponent(SdrRadioRow).vm.$emit('cancel-edit')
    await flushPromises()
    expect(wrapper.findComponent(SdrRadioRow).props('open')).toBe(false)

    wrapper.findComponent(SdrRadioRow).vm.$emit('start-delete')
    await flushPromises()
    expect(wrapper.findComponent(SdrRadioRow).props('confirming')).toBe(true)
    wrapper.findComponent(SdrRadioRow).vm.$emit('cancel-delete')
    await flushPromises()
    expect(wrapper.findComponent(SdrRadioRow).props('confirming')).toBe(false)

    wrapper.findComponent(SdrRadioRow).vm.$emit('start-delete')
    wrapper.findComponent(SdrRadioRow).vm.$emit('confirm-delete')
    await flushPromises()
    expect(mockDeleteRadio).toHaveBeenCalledWith(MIRRORED_RADIO.id)
    expect(changed).toHaveBeenCalled()
    document.removeEventListener(RADIOS_CHANGED_EVENT, changed)
  })

  it("reloads and broadcasts when a mirrored Sentry radio row's form emits save", async () => {
    const changed = vi.fn()
    document.addEventListener(RADIOS_CHANGED_EVENT, changed)
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockListRadios.mockResolvedValue([MIRRORED_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    wrapper.findComponent(SdrRadioRow).vm.$emit('toggle-edit')
    await flushPromises()
    wrapper.findComponent(SdrRadioRow).vm.$emit('save')
    await flushPromises()
    expect(changed).toHaveBeenCalled()
    document.removeEventListener(RADIOS_CHANGED_EVENT, changed)
  })

  it('shows "no devices detected" for a host with an empty device list', async () => {
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([]))
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.text()).toContain('No devices detected on this host.')
  })

  it("renders an unreachable host's last_error via its group header", async () => {
    mockListSentryHosts.mockResolvedValue([UNREACHABLE_HOST])
    mockGetSentryHostDevices.mockResolvedValue(
      snapshot([], { reachable: false, last_error: 'Connection refused', status: null }),
    )
    const wrapper = mountControl()
    await flushPromises()
    const header = wrapper.findComponent(SdrHostGroupHeader)
    expect(header.props('lastError')).toBe('Connection refused')
    expect(header.props('reachable')).toBe(false)
  })

  it('shows a Sentry group header with reachable/last-error null before the first poll snapshot resolves', async () => {
    mockListSentryHosts.mockResolvedValue([HOST])
    // No snapshot has arrived for this host yet — mimic that by never letting
    // the device-status fetch resolve.
    mockGetSentryHostDevices.mockReturnValue(new Promise(() => {}))
    const wrapper = mountControl()
    await flushPromises()
    const header = wrapper.findComponent(SdrHostGroupHeader)
    expect(header.props('reachable')).toBeNull()
  })

  it('lists manual radios (sentry_host_id === null) under their own MANUAL RADIOS heading alongside a Sentry group', async () => {
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([]))
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.text()).toContain('MANUAL RADIOS')
    expect(wrapper.findComponent(SdrRadioRow).props('radio')).toMatchObject({ id: 1 })
  })

  it('omits the MANUAL RADIOS heading when there are no Sentry hosts at all', async () => {
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.text()).not.toContain('MANUAL RADIOS')
    expect(wrapper.findComponent(SdrRadioRow).exists()).toBe(true)
  })

  it('marks a manual radio disconnected when its status probe reports not connected', async () => {
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    mockGetRadioStatus.mockResolvedValue({ connected: false })
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.findComponent(SdrRadioRow).props('connected')).toBe(false)
  })

  it('opens and closes the edit form for a manual radio', async () => {
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(true)
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
  })

  it('opens and toggles closed a blank form via ADD SDR', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(true)
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
  })

  it('cancels a blank form via its cancel event', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    wrapper.findComponent(SdrDeviceForm).vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
  })

  it('reloads and broadcasts sdr:radios-changed when the form emits save', async () => {
    const changed = vi.fn()
    document.addEventListener(RADIOS_CHANGED_EVENT, changed)
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    wrapper.findComponent(SdrDeviceForm).vm.$emit('save')
    await flushPromises()
    expect(changed).toHaveBeenCalled()
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
    document.removeEventListener(RADIOS_CHANGED_EVENT, changed)
  })

  it('closes the form without a side effect when it emits cancel', async () => {
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    wrapper.findComponent(SdrDeviceForm).vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
  })

  it('confirms then deletes a manual radio and broadcasts the change', async () => {
    const changed = vi.fn()
    document.addEventListener(RADIOS_CHANGED_EVENT, changed)
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    mockDeleteRadio.mockResolvedValue(true)
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('.sdr-device-btn--danger').trigger('click')
    expect(wrapper.find('.sdr-device-confirm').exists()).toBe(true)
    await wrapper.find('.sdr-device-confirm-btn--yes').trigger('click')
    await flushPromises()
    expect(mockDeleteRadio).toHaveBeenCalledWith(1)
    expect(changed).toHaveBeenCalled()
    document.removeEventListener(RADIOS_CHANGED_EVENT, changed)
  })

  it('does not reload when the delete request fails', async () => {
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    mockDeleteRadio.mockResolvedValue(false)
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('.sdr-device-btn--danger').trigger('click')
    mockListRadios.mockClear()
    await wrapper.find('.sdr-device-confirm-btn--yes').trigger('click')
    await flushPromises()
    expect(mockListRadios).not.toHaveBeenCalled()
    expect(wrapper.find('.sdr-device-confirm').exists()).toBe(true)
  })

  it('cancels a pending delete with NO', async () => {
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('.sdr-device-btn--danger').trigger('click')
    const noButton = wrapper.findAll('.sdr-device-confirm-btn').at(-1)!
    await noButton.trigger('click')
    expect(wrapper.find('.sdr-device-confirm').exists()).toBe(false)
  })

  it('adds a Sentry-known device as a mirrored radio and broadcasts the change', async () => {
    const changed = vi.fn()
    document.addEventListener(RADIOS_CHANGED_EVENT, changed)
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockCreateRadio.mockResolvedValue(MIRRORED_RADIO)
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.findComponent(SdrHostDeviceRow).find('.sdr-devices-btn').trigger('click')
    await flushPromises()
    expect(mockCreateRadio).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'RTL 1',
        host: '192.168.1.50',
        port: 1234,
        sentry_host_id: 1,
        sentry_device_id: 'rtl-1',
      }),
    )
    expect(changed).toHaveBeenCalled()
    document.removeEventListener(RADIOS_CHANGED_EVENT, changed)
  })

  it('does not reload when adding a Sentry device fails', async () => {
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockCreateRadio.mockResolvedValue(null)
    const wrapper = mountControl()
    await flushPromises()
    mockListRadios.mockClear()
    await wrapper.findComponent(SdrHostDeviceRow).find('.sdr-devices-btn').trigger('click')
    await flushPromises()
    expect(mockListRadios).not.toHaveBeenCalled()
  })

  it('never calls createRadio for a device Sentry has not yet allocated an output port for', async () => {
    // The ADD button is `:disabled` in this state (SdrHostDeviceRow), so it
    // cannot be reached by clicking through the UI; call the guarded handler
    // directly to prove the early return holds.
    mockListSentryHosts.mockResolvedValue([HOST])
    const undetectedDevice = { ...DEVICE, output: null }
    mockGetSentryHostDevices.mockResolvedValue(snapshot([undetectedDevice]))
    const wrapper = mountControl()
    await flushPromises()
    await (
      wrapper.vm as unknown as {
        addDeviceAsRadio: (host: SdrManagerHost, device: SdrManagerDeviceStatus) => Promise<void>
      }
    ).addDeviceAsRadio(HOST, undetectedDevice)
    expect(mockCreateRadio).not.toHaveBeenCalled()
  })

  it('names a radio after the device id when the device has no name', async () => {
    // A Sentry device need not be named; the created radio still needs a label
    // that identifies it rather than an empty string.
    mockListSentryHosts.mockResolvedValue([HOST])
    const unnamed = { ...DEVICE, name: '' }
    mockGetSentryHostDevices.mockResolvedValue(snapshot([unnamed]))
    mockCreateRadio.mockResolvedValue({ id: 9 } as never)
    const wrapper = mountControl()
    await flushPromises()

    await (
      wrapper.vm as unknown as {
        addDeviceAsRadio: (host: SdrManagerHost, device: SdrManagerDeviceStatus) => Promise<void>
      }
    ).addDeviceAsRadio(HOST, unnamed)

    expect(mockCreateRadio).toHaveBeenCalledWith(
      expect.objectContaining({ name: unnamed.device_id }),
    )
  })

  it('keeps announcing nothing while a device simply stays plugged in', async () => {
    // Only transitions are worth a notification; a device present on every tick
    // must not announce itself once per poll.
    vi.useFakeTimers()
    const notificationsStore = useNotificationsStore()
    const addSpy = vi.spyOn(notificationsStore, 'add')
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([{ ...DEVICE, present: true }]))
    mountControl()
    await vi.runOnlyPendingTimersAsync()
    addSpy.mockClear()

    await vi.advanceTimersByTimeAsync(3000)
    await vi.advanceTimersByTimeAsync(3000)

    expect(addSpy).not.toHaveBeenCalled()
  })

  it("leaves the newer add's spinner alone when an older one finishes late", async () => {
    // Two adds can overlap — the operator clicks a second ADD before the first
    // request returns. The slower one must not clear the pending marker that
    // now belongs to the faster one, or the second row would lose its spinner
    // while it is still working.
    const second = { ...DEVICE, device_id: 'rtl-2', name: 'RTL 2' }
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([DEVICE, second]))

    let finishFirst: (value: unknown) => void = () => {}
    mockCreateRadio
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)) as never)
      .mockResolvedValue({ id: 2 } as never)

    const wrapper = mountControl()
    await flushPromises()
    const control = wrapper.vm as unknown as {
      addDeviceAsRadio: (host: SdrManagerHost, device: SdrManagerDeviceStatus) => Promise<void>
      addingDeviceKey: string | null
    }

    const firstAdd = control.addDeviceAsRadio(HOST, DEVICE)
    await control.addDeviceAsRadio(HOST, second)
    finishFirst({ id: 1 })
    await firstAdd
    await flushPromises()

    // The second add owns the marker and has already cleared its own; the first
    // finishing afterwards must not touch it.
    expect(control.addingDeviceKey).toBeNull()
    expect(mockCreateRadio).toHaveBeenCalledTimes(2)
  })

  it('still lists a radio whose device the Sentry no longer has', async () => {
    // The replug case. The list is built by walking the host's devices, so a
    // radio whose device identity has gone has nothing to hang off — it would
    // be invisible here, yet still fail whenever something connects to it, and
    // the operator would have no way to delete it.
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockListRadios.mockResolvedValue([
      {
        id: 9,
        name: 'Moved dongle',
        host: '192.168.1.50',
        port: 4444,
        description: '',
        enabled: true,
        bandwidth: null,
        rf_gain: null,
        agc: null,
        sentry_host_id: HOST.id,
        sentry_device_id: 'usb:1-1.2',
        notes: '',
        antenna: '',
        visibility: 'public',
        device_available: false,
        unavailable_reason: 'Device not found.',
      },
    ] as never)

    const wrapper = mountControl()
    await flushPromises()

    expect(wrapper.text()).toContain('Moved dongle')
  })

  it('lets an orphaned radio be edited and deleted like any other', async () => {
    // The whole point of rendering it: the operator can get rid of a radio
    // whose dongle has moved. Without these wired up it would be visible but
    // inert.
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockListRadios.mockResolvedValue([
      {
        id: 9,
        name: 'Moved dongle',
        host: '192.168.1.50',
        port: 4444,
        description: '',
        enabled: true,
        bandwidth: null,
        rf_gain: null,
        agc: null,
        sentry_host_id: HOST.id,
        sentry_device_id: 'usb:1-1.2',
        notes: '',
        antenna: '',
        visibility: 'public',
        device_available: false,
        unavailable_reason: 'Device not found.',
      },
    ] as never)
    mockDeleteRadio.mockResolvedValue(true as never)

    const wrapper = mountControl()
    await flushPromises()
    const orphan = wrapper
      .findAllComponents(SdrRadioRow)
      .find((row) => row.props('radio').id === 9)!

    orphan.vm.$emit('toggle-edit')
    await flushPromises()
    expect(orphan.props('open')).toBe(true)

    orphan.vm.$emit('cancel-edit')
    await flushPromises()
    expect(orphan.props('open')).toBe(false)

    orphan.vm.$emit('start-delete')
    await flushPromises()
    expect(orphan.props('confirming')).toBe(true)

    orphan.vm.$emit('cancel-delete')
    await flushPromises()
    expect(orphan.props('confirming')).toBe(false)

    orphan.vm.$emit('confirm-delete')
    await flushPromises()
    expect(mockDeleteRadio).toHaveBeenCalledWith(9)

    orphan.vm.$emit('save')
    await flushPromises()
  })

  it('does not treat every radio as orphaned while a host is still unreachable', async () => {
    // With no snapshot yet, a booting Pi would otherwise make every one of its
    // radios look like its device had vanished.
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue({
      reachable: false,
      last_error: 'Timed out',
      last_polled_at: 0,
      last_success_at: null,
      api_version: null,
      status: null,
    } as never)
    mockListRadios.mockResolvedValue([
      {
        id: 9,
        name: 'Moved dongle',
        host: '192.168.1.50',
        port: 4444,
        description: '',
        enabled: true,
        bandwidth: null,
        rf_gain: null,
        agc: null,
        sentry_host_id: HOST.id,
        sentry_device_id: 'usb:1-1.2',
        notes: '',
        antenna: '',
        visibility: 'public',
      },
    ] as never)

    const wrapper = mountControl()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Moved dongle')
  })

  it('reloads the radio list on an external sdr:radios-changed event', async () => {
    mountControl()
    await flushPromises()
    mockListRadios.mockClear()
    document.dispatchEvent(new CustomEvent(RADIOS_CHANGED_EVENT))
    await flushPromises()
    expect(mockListRadios).toHaveBeenCalled()
  })

  it('reloads the Sentry host list when SDR Manager announces a host change', async () => {
    mountControl()
    await flushPromises()
    mockListSentryHosts.mockClear()
    announceFakeHostsChanged()
    await flushPromises()
    expect(mockListSentryHosts).toHaveBeenCalled()
  })

  it('keeps the previous Sentry host list when loadSentryHosts fails', async () => {
    mockListSentryHosts.mockResolvedValueOnce([HOST])
    const wrapper = mountControl()
    await flushPromises()
    mockListSentryHosts.mockRejectedValueOnce(new Error('offline'))
    announceFakeHostsChanged()
    await flushPromises()
    expect(wrapper.findComponent(SdrHostGroupHeader).props('label')).toBe('Roof Pi')
  })

  it('skips the status poll while nothing is configured', async () => {
    vi.useFakeTimers()
    mountControl()
    await vi.runOnlyPendingTimersAsync()
    mockGetRadioStatus.mockClear()
    mockGetSentryHostDevices.mockClear()
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockGetRadioStatus).not.toHaveBeenCalled()
  })

  it('re-checks statuses on the 3s polling interval', async () => {
    vi.useFakeTimers()
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    mountControl()
    await vi.runOnlyPendingTimersAsync()
    mockGetRadioStatus.mockClear()
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockGetRadioStatus).toHaveBeenCalledWith(1)
  })

  it('skips an overlapping poll tick while a previous sweep is still in flight', async () => {
    vi.useFakeTimers()
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    let statusCalls = 0
    mockGetRadioStatus.mockImplementation(() => {
      statusCalls += 1
      return new Promise(() => {}) // never resolves — keeps the sweep in flight
    })
    mountControl()
    await vi.runOnlyPendingTimersAsync()
    expect(statusCalls).toBe(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(statusCalls).toBe(1) // the guard skipped the overlapping tick
  })

  it('falls back to ids when a device and host have no names', async () => {
    // A Sentry device need not be named, and a host row's name is optional, so
    // both notification halves have a fallback. Without this the arrival of an
    // unnamed dongle would announce "undefined on undefined".
    vi.useFakeTimers()
    const notificationsStore = useNotificationsStore()
    const addSpy = vi.spyOn(notificationsStore, 'add')
    mockListSentryHosts.mockResolvedValue([{ ...HOST, name: null }])
    mockGetSentryHostDevices.mockResolvedValueOnce(
      snapshot([{ ...DEVICE, name: '', present: false }]),
    )
    mountControl()
    await vi.runOnlyPendingTimersAsync()

    mockGetSentryHostDevices.mockResolvedValueOnce(
      snapshot([{ ...DEVICE, name: '', present: true }]),
    )
    await vi.advanceTimersByTimeAsync(3000)

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'SDR device connected',
        detail: `${DEVICE.device_id} on ${HOST.address}`,
      }),
    )

    // And the same fallbacks on the way out, where the remembered name is used.
    addSpy.mockClear()
    mockGetSentryHostDevices.mockResolvedValueOnce(
      snapshot([{ ...DEVICE, name: '', present: false }]),
    )
    await vi.advanceTimersByTimeAsync(3000)

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'SDR device disconnected',
        detail: `${DEVICE.device_id} on ${HOST.address}`,
      }),
    )
  })

  it('announces a device arriving and departing across poll ticks without a reload, via the notifications store', async () => {
    vi.useFakeTimers()
    const notificationsStore = useNotificationsStore()
    const addSpy = vi.spyOn(notificationsStore, 'add')
    mockListSentryHosts.mockResolvedValue([HOST])
    // Tick 1 (initial load): baseline snapshot with the device absent — no
    // notification, nothing to diff against yet.
    mockGetSentryHostDevices.mockResolvedValueOnce(snapshot([{ ...DEVICE, present: false }]))
    const wrapper = mountControl()
    await vi.runOnlyPendingTimersAsync()
    expect(addSpy).not.toHaveBeenCalled()

    // Tick 2 (3s later): the device is now present — a plug-in.
    mockGetSentryHostDevices.mockResolvedValueOnce(snapshot([{ ...DEVICE, present: true }]))
    await vi.advanceTimersByTimeAsync(3000)
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'SDR device connected', detail: 'RTL 1 on Roof Pi' }),
    )
    // Reflected live without an explicit reload of the radios/hosts lists.
    expect(wrapper.findComponent(SdrHostDeviceRow).props('device').present).toBe(true)

    // Tick 3 (another 3s later): the device is gone — an unplug.
    addSpy.mockClear()
    mockGetSentryHostDevices.mockResolvedValueOnce(snapshot([{ ...DEVICE, present: false }]))
    await vi.advanceTimersByTimeAsync(3000)
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'SDR device disconnected', detail: 'RTL 1 on Roof Pi' }),
    )
  })

  it('clears the poll interval, the radios listener and the hosts subscription on unmount', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith(RADIOS_CHANGED_EVENT, expect.any(Function))
    // The hosts-changed subscription is stopped too: a later announcement reloads nothing.
    mockListSentryHosts.mockClear()
    announceFakeHostsChanged()
    expect(mockListSentryHosts).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    mockListSentryHosts.mockResolvedValue([HOST])
    mockGetSentryHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })

  describe('with SDR Manager hosts (ADR 0007)', () => {
    const LOCAL_HOST: SdrManagerHost = {
      ...HOST,
      id: 7,
      name: null,
      address: 'host.docker.internal',
      is_local: true,
    }

    it('lists this machine first, as SDR Manager does, labelled "This machine"', async () => {
      mockListSentryHosts.mockResolvedValue([HOST, LOCAL_HOST])
      const wrapper = mountControl()
      await flushPromises()
      const headers = wrapper.findAllComponents(SdrHostGroupHeader)
      expect(headers.map((header) => header.props('label'))).toEqual(['This machine', 'Roof Pi'])
      expect(headers.map((header) => header.props('hostId'))).toEqual([7, 1])
    })

    it("uses the operator's label for this machine when one is set", async () => {
      mockListSentryHosts.mockResolvedValue([{ ...LOCAL_HOST, name: 'Shack' }])
      const wrapper = mountControl()
      await flushPromises()
      expect(wrapper.findComponent(SdrHostGroupHeader).props('label')).toBe('Shack')
    })

    it('names this machine in a device-connected notice', async () => {
      vi.useFakeTimers()
      const addSpy = vi.spyOn(useNotificationsStore(), 'add')
      mockListSentryHosts.mockResolvedValue([LOCAL_HOST])
      mockGetSentryHostDevices.mockResolvedValueOnce(snapshot([{ ...DEVICE, present: false }]))
      mountControl()
      await vi.runOnlyPendingTimersAsync()

      mockGetSentryHostDevices.mockResolvedValueOnce(snapshot([{ ...DEVICE, present: true }]))
      await vi.advanceTimersByTimeAsync(3000)

      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'SDR device connected',
          detail: 'RTL 1 on This machine',
        }),
      )
    })

    it('points an empty list at Settings › SDR Manager', async () => {
      const wrapper = mountControl()
      await flushPromises()
      expect(wrapper.find('.sdr-devices-empty').text()).toBe(
        'No SDRs configured. Add one below, or register an SDR host in Settings › SDR Manager.',
      )
    })
  })

  it('stops polling hosts, without failing, if SDR Manager goes away while the list is open', async () => {
    vi.useFakeTimers()
    mockListSentryHosts.mockResolvedValue([HOST])
    const wrapper = mountControl()
    await vi.runOnlyPendingTimersAsync()
    expect(mockGetSentryHostDevices).toHaveBeenCalled()

    withdrawFakeSdrManagerHosts()
    mockGetSentryHostDevices.mockClear()
    await vi.advanceTimersByTimeAsync(3000)

    expect(mockGetSentryHostDevices).not.toHaveBeenCalled()
    // The groups already shown stay, as they do when a host poll fails.
    expect(wrapper.findComponent(SdrHostGroupHeader).props('label')).toBe('Roof Pi')
  })

  describe('without SDR Manager (sdr-manager-remote not deployed)', () => {
    beforeEach(() => {
      withdrawFakeSdrManagerHosts()
    })

    it('asks nothing of SDR hosts and shows no host groups', async () => {
      mockListRadios.mockResolvedValue([MANUAL_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(mockListSentryHosts).not.toHaveBeenCalled()
      expect(mockGetSentryHostDevices).not.toHaveBeenCalled()
      expect(wrapper.findComponent(SdrHostGroupHeader).exists()).toBe(false)
      // Manual radios still list, with no MANUAL RADIOS heading: there are no hosts to set them apart from.
      expect(wrapper.findAllComponents(SdrRadioRow)).toHaveLength(1)
      expect(wrapper.text()).not.toContain('MANUAL RADIOS')
    })

    it('keeps polling manual radios while there are no hosts to poll', async () => {
      vi.useFakeTimers()
      mockListRadios.mockResolvedValue([MANUAL_RADIO])
      mountControl()
      await vi.runOnlyPendingTimersAsync()
      mockGetRadioStatus.mockClear()
      await vi.advanceTimersByTimeAsync(3000)
      expect(mockGetRadioStatus).toHaveBeenCalledWith(MANUAL_RADIO.id)
      expect(mockGetSentryHostDevices).not.toHaveBeenCalled()
    })

    it('does not mention SDR Manager in the empty message', async () => {
      const wrapper = mountControl()
      await flushPromises()
      expect(wrapper.find('.sdr-devices-empty').text()).toBe('No SDRs configured. Add one below.')
    })

    it('unmounts cleanly with no hosts subscription to stop', async () => {
      // Plain mount: this test unmounts it itself.
      const wrapper = mount(SdrDevicesControl)
      await flushPromises()
      expect(() => wrapper.unmount()).not.toThrow()
    })
  })
})
