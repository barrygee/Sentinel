import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrDevicesControl from './SdrDevicesControl.vue'
import SdrDeviceForm from './SdrDeviceForm.vue'
import SdrRadioRow from './SdrRadioRow.vue'
import SdrHostDeviceRow from './SdrHostDeviceRow.vue'
import SdrDeviceRadioAction from './SdrDeviceRadioAction.vue'
import SdrHostDeviceAddButton from './SdrHostDeviceAddButton.vue'
import { defineComponent, h, type Slot } from 'vue'
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import { RADIOS_CHANGED_EVENT } from '../composables/sdrDeviceEvents'
import { provideCapability } from '@sentinel/shell-api/shell/capabilities'
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
const mockListSdrManagerHosts = vi.mocked(fakeSdrManagerHosts.listHosts)
const mockGetSdrManagerHostDevices = vi.mocked(fakeSdrManagerHosts.getHostDevices)

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
  sdr_manager_host_id: null,
  sdr_manager_device_id: null,
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
  sdr_manager_host_id: 1,
  sdr_manager_device_id: 'rtl-1',
}

/** What the poll says of a host it can't reach. */
const UNREACHABLE_SNAPSHOT = { reachable: false, last_error: 'Connection refused', status: null }

/** The host title rows (the capability's `HostHeader`, faked), in order. */
function hostHeaders(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAllComponents({ name: 'FakeHostHeader' })
}

/** The ids of the hosts whose title rows are shown, in order. */
function hostHeaderIds(wrapper: ReturnType<typeof mount>): number[] {
  return hostHeaders(wrapper).map((header) => (header.props('host') as SdrManagerHost).id)
}

/** The ids of the radio rows inside one element, in order. */
function radioIdsIn(wrapper: ReturnType<typeof mount>, heading: string): number[] {
  const section = subcategory(wrapper, heading)!.element
  return wrapper
    .findAllComponents(SdrRadioRow)
    .filter((row) => section.contains(row.element))
    .map((row) => (row.props('radio') as SdrRadioRecord).id)
}

/** The SENTINEL HOSTS or NON-SENTINEL SDR DEVICES subcategory, by its heading. */
function subcategory(wrapper: ReturnType<typeof mount>, heading: string) {
  return wrapper
    .findAll('.sdr-devices-subcategory')
    .find((section) => section.find('h3').text() === heading)
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
    mockListSdrManagerHosts.mockResolvedValue([])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([]))
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
  // SDR_MANAGER_HOSTS_CHANGED_EVENT listeners live, so a later dispatch would fan
  // out to every leaked instance instead of just the one under test.
  const activeWrappers: ReturnType<typeof mount>[] = []
  function mountControl(): ReturnType<typeof mount> {
    const wrapper = mount(SdrDevicesControl)
    activeWrappers.push(wrapper)
    return wrapper
  }

  it('says each subcategory is empty when nothing is configured', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.findAll('.sdr-devices-empty').map((empty) => empty.text())).toEqual([
      'No Sentinel hosts yet.',
      'No remote SDR devices yet.',
    ])
  })

  it('splits the card into SENTINEL HOSTS and NON-SENTINEL SDR DEVICES, each named for assistive tech', async () => {
    const wrapper = mountControl()
    await flushPromises()
    const sections = wrapper.findAll('section.sdr-devices-subcategory')
    expect(sections.map((section) => section.find('h3').text())).toEqual([
      'Sentinel Hosts',
      'Non-Sentinel SDR Devices',
    ])
    for (const section of sections) {
      const headingId = section.attributes('aria-labelledby')!
      expect(section.find(`h3#${headingId}`).exists()).toBe(true)
    }
  })

  it("titles each host with the capability's header row, above that host's SDRs", async () => {
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
    const wrapper = mountControl()
    await flushPromises()
    const [header] = hostHeaders(wrapper)
    expect(header!.props()).toMatchObject({
      host: HOST,
      expanded: true,
      sdrCount: 1,
      controlsId: 'sdr-host-1-sdrs',
    })
    const sdrList = wrapper.find('#sdr-host-1-sdrs')
    expect(sdrList.findComponent(SdrHostDeviceRow).exists()).toBe(true)
    const hosts = subcategory(wrapper, 'Sentinel Hosts')!
    expect(hosts.findComponent({ name: 'FakeHostHeader' }).exists()).toBe(true)
  })

  it('gives the header no SDR count until the host has answered', async () => {
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockReturnValue(new Promise(() => {}))
    const wrapper = mountControl()
    await flushPromises()
    expect(hostHeaders(wrapper)[0]!.props('sdrCount')).toBeNull()
  })

  it('gives the header no SDR count for a host it cannot reach', async () => {
    mockListSdrManagerHosts.mockResolvedValue([UNREACHABLE_HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([], UNREACHABLE_SNAPSHOT))
    const wrapper = mountControl()
    await flushPromises()
    expect(hostHeaders(wrapper)[0]!.props('sdrCount')).toBeNull()
  })

  describe('the host accordion', () => {
    it("folds a host's SDRs away and opens them again, telling its header", async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST, UNLABELLED_HOST])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
      const wrapper = mountControl()
      await flushPromises()
      // v-show: folded means display:none on the host's SDR list.
      const folded = (hostId: number) =>
        (wrapper.find(`#sdr-host-${hostId}-sdrs`).element as HTMLElement).style.display === 'none'
      expect(folded(1)).toBe(false)

      hostHeaders(wrapper)[0]!.vm.$emit('toggle')
      await flushPromises()
      expect(folded(1)).toBe(true)
      expect(hostHeaders(wrapper)[0]!.props('expanded')).toBe(false)
      // Only that host folds.
      expect(folded(3)).toBe(false)
      expect(hostHeaders(wrapper)[1]!.props('expanded')).toBe(true)

      hostHeaders(wrapper)[0]!.vm.$emit('toggle')
      await flushPromises()
      expect(folded(1)).toBe(false)
      expect(hostHeaders(wrapper)[0]!.props('expanded')).toBe(true)
    })
  })

  describe("staging the hosts' edits for APPLY CHANGES", () => {
    it("emits one closure that runs every host's staged save", async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST, UNLABELLED_HOST])
      const wrapper = mountControl()
      await flushPromises()
      const saveRoofPi = vi.fn().mockResolvedValue(undefined)
      const saveUnlabelled = vi.fn().mockResolvedValue(undefined)
      hostHeaders(wrapper)[0]!.vm.$emit('stage', saveRoofPi)
      hostHeaders(wrapper)[1]!.vm.$emit('stage', saveUnlabelled)
      const stages = wrapper.emitted('stage')!
      expect(stages).toHaveLength(2)
      // Nothing is saved until APPLY CHANGES runs the closure.
      expect(saveRoofPi).not.toHaveBeenCalled()
      await (stages.at(-1)![0] as () => Promise<void>)()
      expect(saveRoofPi).toHaveBeenCalledOnce()
      expect(saveUnlabelled).toHaveBeenCalledOnce()
    })

    it("keeps only a host's latest closure", async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      const wrapper = mountControl()
      await flushPromises()
      const first = vi.fn().mockResolvedValue(undefined)
      const latest = vi.fn().mockResolvedValue(undefined)
      hostHeaders(wrapper)[0]!.vm.$emit('stage', first)
      hostHeaders(wrapper)[0]!.vm.$emit('stage', latest)
      await (wrapper.emitted('stage')!.at(-1)![0] as () => Promise<void>)()
      expect(first).not.toHaveBeenCalled()
      expect(latest).toHaveBeenCalledOnce()
    })

    it('runs every save even when one fails, then throws the first failure', async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST, UNLABELLED_HOST])
      const wrapper = mountControl()
      await flushPromises()
      const refusal = new Error('Port 8000 is already in use.')
      const failing = vi.fn().mockRejectedValue(refusal)
      const later = vi.fn().mockRejectedValue(new Error('second'))
      hostHeaders(wrapper)[0]!.vm.$emit('stage', failing)
      hostHeaders(wrapper)[1]!.vm.$emit('stage', later)
      await expect((wrapper.emitted('stage')!.at(-1)![0] as () => Promise<void>)()).rejects.toBe(
        refusal,
      )
      expect(later).toHaveBeenCalledOnce()
    })
  })

  it('shows a not-yet-mirrored device as an ADD row, and a mirrored one as a full radio row', async () => {
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockListRadios.mockResolvedValue([MIRRORED_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.findComponent(SdrHostDeviceRow).exists()).toBe(false)
    expect(wrapper.findComponent(SdrRadioRow).exists()).toBe(true)
  })

  it('drives edit/delete/save through a mirrored SDR host radio row exactly like a manual one', async () => {
    const changed = vi.fn()
    document.addEventListener(RADIOS_CHANGED_EVENT, changed)
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
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

  it("reloads and broadcasts when a mirrored SDR host radio row's form emits save", async () => {
    const changed = vi.fn()
    document.addEventListener(RADIOS_CHANGED_EVENT, changed)
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
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

  it('says an answering host with nothing plugged in has no SDRs', async () => {
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([]))
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('#sdr-host-1-sdrs').text()).toBe('No SDRs plugged in.')
    expect(hostHeaders(wrapper)[0]!.props('sdrCount')).toBe(0)
  })

  it('leaves an unreachable host to say why in its own header, not under it', async () => {
    mockListSdrManagerHosts.mockResolvedValue([UNREACHABLE_HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([], UNREACHABLE_SNAPSHOT))
    const wrapper = mountControl()
    await flushPromises()
    expect(hostHeaders(wrapper)[0]!.props('host')).toEqual(UNREACHABLE_HOST)
    expect(wrapper.text()).not.toContain('No SDRs plugged in.')
  })

  it('says nothing of a host whose first poll has not answered', async () => {
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    // No snapshot has arrived for this host yet — mimic that by never letting
    // the device-status fetch resolve.
    mockGetSdrManagerHostDevices.mockReturnValue(new Promise(() => {}))
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('#sdr-host-1-sdrs').text()).toBe('')
  })

  it('lists manual radios under NON-SENTINEL SDR DEVICES, apart from the hosts', async () => {
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([]))
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    const remote = subcategory(wrapper, 'Non-Sentinel SDR Devices')!
    expect(remote.findComponent(SdrRadioRow).props('radio')).toMatchObject({ id: 1 })
    expect(remote.text()).not.toContain('No remote SDR devices yet.')
    expect(subcategory(wrapper, 'Sentinel Hosts')!.findComponent(SdrRadioRow).exists()).toBe(false)
  })

  describe("a radio added by IP and port at a Sentinel host's address", () => {
    const DEVICE_ON_1234: SdrManagerDeviceStatus = {
      ...DEVICE,
      output: { iq_port: 1234, control_port: 1235, host: HOST.address },
    }
    // Added by IP and port, before the host was: same address as HOST.
    const ADDRESS_RADIO: SdrRadioRecord = {
      ...MANUAL_RADIO,
      id: 8,
      name: 'Old entry',
      host: ' 192.168.1.50 ',
      port: 1234,
    }

    it('lists it under that host, not under NON-SENTINEL SDR DEVICES', async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([]))
      mockListRadios.mockResolvedValue([ADDRESS_RADIO, MANUAL_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      const hostSdrs = wrapper.find('#sdr-host-1-sdrs').element
      const row = wrapper
        .findAllComponents(SdrRadioRow)
        .find((candidate) => (candidate.props('radio') as SdrRadioRecord).id === 8)!
      expect(hostSdrs.contains(row.element)).toBe(true)
      expect(radioIdsIn(wrapper, 'Non-Sentinel SDR Devices')).toEqual([MANUAL_RADIO.id])
      // Its reachability is its own TCP probe's, as for any radio added by IP and port.
      expect(mockGetRadioStatus).toHaveBeenCalledWith(8)
      expect(row.props('connected')).toBe(true)
      // The host lists a radio, so it is not said to have no SDRs.
      expect(wrapper.text()).not.toContain('No SDRs plugged in.')
    })

    it('matches the address whatever its case', async () => {
      mockListSdrManagerHosts.mockResolvedValue([{ ...HOST, address: 'RPI.local' }])
      mockListRadios.mockResolvedValue([{ ...ADDRESS_RADIO, host: 'rpi.LOCAL' }])
      const wrapper = mountControl()
      await flushPromises()
      expect(radioIdsIn(wrapper, 'Sentinel Hosts')).toEqual([8])
      expect(wrapper.text()).toContain('No remote SDR devices yet.')
    })

    it('points out a second entry for an SDR already added from the host', async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE_ON_1234]))
      mockListRadios.mockResolvedValue([MIRRORED_RADIO, ADDRESS_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(radioIdsIn(wrapper, 'Sentinel Hosts')).toEqual([MIRRORED_RADIO.id, 8])
      expect(wrapper.find('.sdr-host-duplicate-note').text()).toBe(
        'Added by IP and port, and also listed above as RTL 1. Delete one so this SDR is listed once.',
      )
    })

    it('says nothing of a duplicate when the SDR on that port was not added from the host', async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE_ON_1234]))
      mockListRadios.mockResolvedValue([ADDRESS_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(wrapper.find('.sdr-host-duplicate-note').exists()).toBe(false)
      // The device still offers ADD beside it.
      expect(wrapper.findComponent(SdrHostDeviceRow).exists()).toBe(true)
    })

    it('says nothing of a duplicate on another port, or before the host has answered', async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE_ON_1234]))
      mockListRadios.mockResolvedValue([MIRRORED_RADIO, { ...ADDRESS_RADIO, port: 4444 }])
      const wrapper = mountControl()
      await flushPromises()
      expect(wrapper.find('.sdr-host-duplicate-note').exists()).toBe(false)

      mockGetSdrManagerHostDevices.mockReturnValue(new Promise(() => {}))
      mockListRadios.mockResolvedValue([MIRRORED_RADIO, ADDRESS_RADIO])
      const waiting = mountControl()
      await flushPromises()
      expect(radioIdsIn(waiting, 'Sentinel Hosts')).toEqual([8])
      expect(waiting.find('.sdr-host-duplicate-note').exists()).toBe(false)
    })

    it('can be edited and deleted from under the host', async () => {
      const changed = vi.fn()
      document.addEventListener(RADIOS_CHANGED_EVENT, changed)
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      mockListRadios.mockResolvedValue([ADDRESS_RADIO])
      mockDeleteRadio.mockResolvedValue(true)
      const wrapper = mountControl()
      await flushPromises()
      const row = () => wrapper.findComponent(SdrRadioRow)
      row().vm.$emit('toggle-edit')
      await flushPromises()
      expect(row().props('open')).toBe(true)
      row().vm.$emit('cancel-edit')
      await flushPromises()
      expect(row().props('open')).toBe(false)
      row().vm.$emit('toggle-edit')
      await flushPromises()
      row().vm.$emit('save')
      await flushPromises()
      expect(row().props('open')).toBe(false)
      row().vm.$emit('start-delete')
      await flushPromises()
      expect(row().props('confirming')).toBe(true)
      row().vm.$emit('cancel-delete')
      await flushPromises()
      expect(row().props('confirming')).toBe(false)
      row().vm.$emit('start-delete')
      row().vm.$emit('confirm-delete')
      await flushPromises()
      expect(mockDeleteRadio).toHaveBeenCalledWith(8)
      expect(changed).toHaveBeenCalled()
      document.removeEventListener(RADIOS_CHANGED_EVENT, changed)
    })

    it('has no accessibility violations with the duplicate note', async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE_ON_1234]))
      mockListRadios.mockResolvedValue([MIRRORED_RADIO, ADDRESS_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(
        await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    })
  })

  it("shows only the port of a host's radios, whose address its title gives, and the full address elsewhere", async () => {
    const orphan: SdrRadioRecord = { ...MIRRORED_RADIO, id: 6, sdr_manager_device_id: 'gone' }
    const atHostAddress: SdrRadioRecord = { ...MANUAL_RADIO, id: 8, host: HOST.address }
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockListRadios.mockResolvedValue([MIRRORED_RADIO, orphan, atHostAddress, MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    const portOnlyById = Object.fromEntries(
      wrapper
        .findAllComponents(SdrRadioRow)
        .map((row) => [(row.props('radio') as SdrRadioRecord).id, row.props('portOnly')]),
    )
    expect(portOnlyById).toEqual({
      [MIRRORED_RADIO.id]: true,
      6: true,
      8: true,
      [MANUAL_RADIO.id]: false,
    })
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

  /** The "+ ADD A REMOTE SDR DEVICE" or "+ ADD A NEW SENTINEL HOST" button. */
  function addButton(wrapper: ReturnType<typeof mount>, label: string) {
    return wrapper.findAll('.sdr-devices-add-btn').find((button) => button.text() === label)!
  }

  it('opens and toggles closed a blank form via + ADD A REMOTE SDR DEVICE, under that subcategory', async () => {
    const wrapper = mountControl()
    await flushPromises()
    const add = addButton(wrapper, '+ ADD A REMOTE SDR DEVICE')
    expect(add.attributes('aria-expanded')).toBe('false')
    await add.trigger('click')
    const remote = subcategory(wrapper, 'Non-Sentinel SDR Devices')!
    expect(remote.findComponent(SdrDeviceForm).exists()).toBe(true)
    expect(add.attributes('aria-expanded')).toBe('true')
    // The open form stands in for the empty line.
    expect(remote.text()).not.toContain('No remote SDR devices yet.')
    await add.trigger('click')
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
  })

  it('opens and closes the new-host form via + ADD A NEW SENTINEL HOST, under that subcategory', async () => {
    const wrapper = mountControl()
    await flushPromises()
    const add = addButton(wrapper, '+ ADD A NEW SENTINEL HOST')
    expect(add.attributes('aria-expanded')).toBe('false')
    await add.trigger('click')
    const hosts = subcategory(wrapper, 'Sentinel Hosts')!
    expect(hosts.find('.fake-new-host-form').exists()).toBe(true)
    expect(add.attributes('aria-expanded')).toBe('true')
    await add.trigger('click')
    expect(wrapper.find('.fake-new-host-form').exists()).toBe(false)
  })

  it('closes the new-host form when it is done', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await addButton(wrapper, '+ ADD A NEW SENTINEL HOST').trigger('click')
    wrapper.findComponent({ name: 'FakeNewHostForm' }).vm.$emit('done')
    await flushPromises()
    expect(wrapper.find('.fake-new-host-form').exists()).toBe(false)
  })

  it('cancels a blank form via its cancel event', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await addButton(wrapper, '+ ADD A REMOTE SDR DEVICE').trigger('click')
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

  it('adds an SDR-Manager-known device as a mirrored radio and broadcasts the change', async () => {
    const changed = vi.fn()
    document.addEventListener(RADIOS_CHANGED_EVENT, changed)
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
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
        sdr_manager_host_id: 1,
        sdr_manager_device_id: 'rtl-1',
      }),
    )
    expect(changed).toHaveBeenCalled()
    document.removeEventListener(RADIOS_CHANGED_EVENT, changed)
  })

  it('does not reload when adding an SDR Manager device fails', async () => {
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockCreateRadio.mockResolvedValue(null)
    const wrapper = mountControl()
    await flushPromises()
    mockListRadios.mockClear()
    await wrapper.findComponent(SdrHostDeviceRow).find('.sdr-devices-btn').trigger('click')
    await flushPromises()
    expect(mockListRadios).not.toHaveBeenCalled()
  })

  it('never calls createRadio for a device SDR host has not yet allocated an output port for', async () => {
    // The ADD button is `:disabled` in this state (SdrHostDeviceRow), so it
    // cannot be reached by clicking through the UI; call the guarded handler
    // directly to prove the early return holds.
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    const undetectedDevice = { ...DEVICE, output: null }
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([undetectedDevice]))
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
    // An SDR Manager device need not be named; the created radio still needs a label
    // that identifies it rather than an empty string.
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    const unnamed = { ...DEVICE, name: '' }
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([unnamed]))
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
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([{ ...DEVICE, present: true }]))
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
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE, second]))

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

  it('still lists a radio whose device the SDR host no longer has', async () => {
    // The replug case. The list is built by walking the host's devices, so a
    // radio whose device identity has gone has nothing to hang off — it would
    // be invisible here, yet still fail whenever something connects to it, and
    // the operator would have no way to delete it.
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
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
        sdr_manager_host_id: HOST.id,
        sdr_manager_device_id: 'usb:1-1.2',
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
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
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
        sdr_manager_host_id: HOST.id,
        sdr_manager_device_id: 'usb:1-1.2',
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
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue({
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
        sdr_manager_host_id: HOST.id,
        sdr_manager_device_id: 'usb:1-1.2',
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

  it('reloads the SDR host list when SDR Manager announces a host change', async () => {
    mountControl()
    await flushPromises()
    mockListSdrManagerHosts.mockClear()
    announceFakeHostsChanged()
    await flushPromises()
    expect(mockListSdrManagerHosts).toHaveBeenCalled()
  })

  it('keeps the previous SDR host list when loadSdrManagerHosts fails', async () => {
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    const wrapper = mountControl()
    await flushPromises()
    mockListSdrManagerHosts.mockRejectedValueOnce(new Error('offline'))
    announceFakeHostsChanged()
    await flushPromises()
    expect(hostHeaderIds(wrapper)).toEqual([HOST.id])
  })

  it('skips the status poll while nothing is configured', async () => {
    vi.useFakeTimers()
    mountControl()
    await vi.runOnlyPendingTimersAsync()
    mockGetRadioStatus.mockClear()
    mockGetSdrManagerHostDevices.mockClear()
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
    // An SDR Manager device need not be named, and a host row's name is optional, so
    // both notification halves have a fallback. Without this the arrival of an
    // unnamed dongle would announce "undefined on undefined".
    vi.useFakeTimers()
    const notificationsStore = useNotificationsStore()
    const addSpy = vi.spyOn(notificationsStore, 'add')
    mockListSdrManagerHosts.mockResolvedValue([{ ...HOST, name: null }])
    mockGetSdrManagerHostDevices.mockResolvedValueOnce(
      snapshot([{ ...DEVICE, name: '', present: false }]),
    )
    mountControl()
    await vi.runOnlyPendingTimersAsync()

    mockGetSdrManagerHostDevices.mockResolvedValueOnce(
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
    mockGetSdrManagerHostDevices.mockResolvedValueOnce(
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
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    // Tick 1 (initial load): baseline snapshot with the device absent — no
    // notification, nothing to diff against yet.
    mockGetSdrManagerHostDevices.mockResolvedValueOnce(snapshot([{ ...DEVICE, present: false }]))
    const wrapper = mountControl()
    await vi.runOnlyPendingTimersAsync()
    expect(addSpy).not.toHaveBeenCalled()

    // Tick 2 (3s later): the device is now present — a plug-in.
    mockGetSdrManagerHostDevices.mockResolvedValueOnce(snapshot([{ ...DEVICE, present: true }]))
    await vi.advanceTimersByTimeAsync(3000)
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'SDR device connected', detail: 'RTL 1 on Roof Pi' }),
    )
    // Reflected live without an explicit reload of the radios/hosts lists.
    expect(wrapper.findComponent(SdrHostDeviceRow).props('device').present).toBe(true)

    // Tick 3 (another 3s later): the device is gone — an unplug.
    addSpy.mockClear()
    mockGetSdrManagerHostDevices.mockResolvedValueOnce(snapshot([{ ...DEVICE, present: false }]))
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
    mockListSdrManagerHosts.mockClear()
    announceFakeHostsChanged()
    expect(mockListSdrManagerHosts).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations with an unreachable host', async () => {
    mockListSdrManagerHosts.mockResolvedValue([UNREACHABLE_HOST])
    mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([], UNREACHABLE_SNAPSHOT))
    mockListRadios.mockResolvedValue([MANUAL_RADIO])
    const wrapper = mountControl()
    await flushPromises()
    expect(hostHeaders(wrapper)).toHaveLength(1)
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

    it('lists this machine first, as SDR Manager does', async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST, LOCAL_HOST])
      const wrapper = mountControl()
      await flushPromises()
      expect(hostHeaderIds(wrapper)).toEqual([LOCAL_HOST.id, HOST.id])
    })

    it('names this machine in a device-connected notice', async () => {
      vi.useFakeTimers()
      const addSpy = vi.spyOn(useNotificationsStore(), 'add')
      mockListSdrManagerHosts.mockResolvedValue([LOCAL_HOST])
      mockGetSdrManagerHostDevices.mockResolvedValueOnce(snapshot([{ ...DEVICE, present: false }]))
      mountControl()
      await vi.runOnlyPendingTimersAsync()

      mockGetSdrManagerHostDevices.mockResolvedValueOnce(snapshot([{ ...DEVICE, present: true }]))
      await vi.advanceTimersByTimeAsync(3000)

      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'SDR device connected',
          detail: 'RTL 1 on This machine',
        }),
      )
    })
  })

  it('stops polling hosts, without failing, if SDR Manager goes away while the list is open', async () => {
    vi.useFakeTimers()
    mockListSdrManagerHosts.mockResolvedValue([HOST])
    const wrapper = mountControl()
    await vi.runOnlyPendingTimersAsync()
    expect(mockGetSdrManagerHostDevices).toHaveBeenCalled()

    withdrawFakeSdrManagerHosts()
    mockGetSdrManagerHostDevices.mockClear()
    await vi.advanceTimersByTimeAsync(3000)

    expect(mockGetSdrManagerHostDevices).not.toHaveBeenCalled()
    // The groups already shown stay, as they do when a host poll fails.
    expect(wrapper.find('#sdr-host-1-sdrs').text()).toBe('No SDRs plugged in.')
  })

  describe("this machine's SDRs (sdr-manager-local deployed)", () => {
    const THIS_MACHINE: SdrManagerHost = {
      ...HOST,
      id: 7,
      name: null,
      address: 'host.docker.internal',
      is_local: true,
    }
    const LOCAL_DEVICE: SdrManagerDeviceStatus = { ...DEVICE, device_id: 'rtl-local' }
    const LOCAL_RADIO: SdrRadioRecord = {
      ...MANUAL_RADIO,
      id: 9,
      name: 'Shack RTL',
      host: THIS_MACHINE.address,
      sdr_manager_host_id: THIS_MACHINE.id,
      sdr_manager_device_id: 'rtl-local',
    }

    /**
     * Stands in for sdr-manager-local's list: one row per id, each ending in
     * the `device-actions` slot. Like the real rows, each reads the slot it
     * was given once and doesn't redraw when the card does.
     */
    const FakeLocalRow = defineComponent({
      props: {
        deviceId: { type: String, required: true },
        getSlot: { type: Function, required: true },
      },
      setup(props) {
        return () =>
          h(
            'div',
            { class: 'fake-local-row', 'data-device-id': props.deviceId },
            (props.getSlot() as Slot | undefined)?.({ deviceId: props.deviceId }),
          )
      },
    })
    const FakeDevicesPanel = defineComponent({
      name: 'FakeDevicesPanel',
      props: { portOnly: Boolean },
      emits: ['stage'],
      setup(_props, { slots }) {
        const getSlot = () => slots['device-actions']
        return () =>
          h(
            'div',
            { class: 'fake-this-machine' },
            ['rtl-local'].map((deviceId) => h(FakeLocalRow, { key: deviceId, deviceId, getSlot })),
          )
      },
    })

    let withdrawThisMachine: () => void = () => {}
    beforeEach(() => {
      withdrawThisMachine = provideCapability('thisMachineSdrs', {
        DevicesPanel: FakeDevicesPanel,
      })
    })
    afterEach(() => {
      withdrawThisMachine()
    })

    function localRow(wrapper: ReturnType<typeof mount>) {
      return wrapper.find('.fake-local-row[data-device-id="rtl-local"]')
    }

    it("lists them inside This machine's accordion, in place of its device rows", async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST, THIS_MACHINE])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([LOCAL_DEVICE]))
      const wrapper = mountControl()
      await flushPromises()
      // Its title gives the address: the rows give only their ports.
      expect(wrapper.findComponent(FakeDevicesPanel).props('portOnly')).toBe(true)
      const thisMachineList = wrapper.find('#sdr-host-7-sdrs')
      expect(thisMachineList.find('.fake-this-machine').exists()).toBe(true)
      expect(thisMachineList.findComponent(SdrHostDeviceRow).exists()).toBe(false)
      expect(thisMachineList.text()).not.toContain('No SDRs plugged in.')
      // Other hosts list their SDRs as before.
      expect(wrapper.find('#sdr-host-1-sdrs').findComponent(SdrHostDeviceRow).exists()).toBe(true)
      expect(wrapper.findAll('.fake-this-machine')).toHaveLength(1)
    })

    it("ends each row with ADD, which adds that SDR from this machine's host", async () => {
      mockListSdrManagerHosts.mockResolvedValue([THIS_MACHINE])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([LOCAL_DEVICE]))
      mockCreateRadio.mockResolvedValue(LOCAL_RADIO)
      const wrapper = mountControl()
      await flushPromises()
      const add = localRow(wrapper).findComponent(SdrDeviceRadioAction)
      expect(add.props('radio')).toBeNull()
      add.vm.$emit('add')
      await flushPromises()
      expect(mockCreateRadio).toHaveBeenCalledWith(
        expect.objectContaining({
          host: THIS_MACHINE.address,
          port: 1234,
          sdr_manager_host_id: THIS_MACHINE.id,
          sdr_manager_device_id: 'rtl-local',
        }),
      )
    })

    it('shows ADD once the host reports the SDR, though the rows drew before it did', async () => {
      // The regression this guards: the rows keep the slot they first got,
      // so it must read the current device list, not one captured then.
      let reportDevices: (value: ReturnType<typeof snapshot>) => void = () => {}
      mockListSdrManagerHosts.mockResolvedValue([THIS_MACHINE])
      mockGetSdrManagerHostDevices.mockReturnValue(
        new Promise((resolve) => {
          reportDevices = resolve
        }),
      )
      const wrapper = mountControl()
      await flushPromises()
      expect(localRow(wrapper).findComponent(SdrHostDeviceAddButton).exists()).toBe(false)
      reportDevices(snapshot([LOCAL_DEVICE]))
      await flushPromises()
      expect(localRow(wrapper).findComponent(SdrHostDeviceAddButton).exists()).toBe(true)
    })

    it('reads ADDED for an SDR that is a radio, and removes the radio after asking', async () => {
      const changed = vi.fn()
      document.addEventListener(RADIOS_CHANGED_EVENT, changed)
      mockListSdrManagerHosts.mockResolvedValue([THIS_MACHINE])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([LOCAL_DEVICE]))
      mockListRadios.mockResolvedValue([LOCAL_RADIO])
      mockDeleteRadio.mockResolvedValue(true)
      const wrapper = mountControl()
      await flushPromises()
      const action = () => localRow(wrapper).findComponent(SdrDeviceRadioAction)
      expect(action().props('radio')).toMatchObject({ id: 9 })
      expect(action().props('confirming')).toBe(false)

      action().vm.$emit('start-delete')
      await flushPromises()
      expect(action().props('confirming')).toBe(true)
      action().vm.$emit('cancel-delete')
      await flushPromises()
      expect(action().props('confirming')).toBe(false)

      action().vm.$emit('start-delete')
      action().vm.$emit('confirm-delete')
      await flushPromises()
      expect(mockDeleteRadio).toHaveBeenCalledWith(9)
      expect(changed).toHaveBeenCalled()
      document.removeEventListener(RADIOS_CHANGED_EVENT, changed)
    })

    it('ignores the radio actions of an SDR the host has not reported', async () => {
      mockListSdrManagerHosts.mockResolvedValue([THIS_MACHINE])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([]))
      const wrapper = mountControl()
      await flushPromises()
      const action = localRow(wrapper).findComponent(SdrDeviceRadioAction)
      expect(action.props('device')).toBeUndefined()
      action.vm.$emit('add')
      action.vm.$emit('start-delete')
      action.vm.$emit('confirm-delete')
      await flushPromises()
      expect(mockCreateRadio).not.toHaveBeenCalled()
      expect(mockDeleteRadio).not.toHaveBeenCalled()
      expect(action.props('confirming')).toBe(false)
    })

    it("hands this machine's staged edits to APPLY CHANGES with the hosts'", async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST, THIS_MACHINE])
      const wrapper = mountControl()
      await flushPromises()
      const saveLocal = vi.fn().mockResolvedValue(undefined)
      const saveHost = vi.fn().mockResolvedValue(undefined)
      wrapper.findComponent(FakeDevicesPanel).vm.$emit('stage', saveLocal)
      hostHeaders(wrapper)[1]!.vm.$emit('stage', saveHost)
      await (wrapper.emitted('stage')!.at(-1)![0] as () => Promise<void>)()
      expect(saveLocal).toHaveBeenCalledOnce()
      expect(saveHost).toHaveBeenCalledOnce()
    })

    describe('before this machine is a listed host', () => {
      it('lists them under a This machine title, with no actions, and no empty line', async () => {
        mockListSdrManagerHosts.mockResolvedValue([HOST])
        const wrapper = mountControl()
        await flushPromises()
        const hosts = subcategory(wrapper, 'Sentinel Hosts')!
        expect(hosts.find('.sdr-this-machine-title').text()).toBe('This machine')
        expect(hosts.find('.fake-this-machine').exists()).toBe(true)
        expect(localRow(wrapper).findComponent(SdrDeviceRadioAction).exists()).toBe(false)
        expect(hosts.text()).not.toContain('No Sentinel hosts yet.')
      })

      it('stages its edits too', async () => {
        const wrapper = mountControl()
        await flushPromises()
        const saveLocal = vi.fn().mockResolvedValue(undefined)
        wrapper.findComponent(FakeDevicesPanel).vm.$emit('stage', saveLocal)
        await (wrapper.emitted('stage')!.at(-1)![0] as () => Promise<void>)()
        expect(saveLocal).toHaveBeenCalledOnce()
      })

      it('shows SENTINEL HOSTS for them even without sdr-manager-remote', async () => {
        withdrawFakeSdrManagerHosts()
        const wrapper = mountControl()
        await flushPromises()
        const hosts = subcategory(wrapper, 'Sentinel Hosts')!
        expect(hosts.find('.fake-this-machine').exists()).toBe(true)
        // No hosts to add without sdr-manager-remote.
        expect(hosts.find('.sdr-devices-add-btn').exists()).toBe(false)
      })
    })

    it('has no accessibility violations', async () => {
      mockListSdrManagerHosts.mockResolvedValue([THIS_MACHINE])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([LOCAL_DEVICE]))
      const wrapper = mountControl()
      await flushPromises()
      expect(
        await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    })
  })

  describe('without SDR Manager (sdr-manager-remote not deployed)', () => {
    beforeEach(() => {
      withdrawFakeSdrManagerHosts()
    })

    it('asks nothing of SDR hosts and shows no host groups', async () => {
      mockListRadios.mockResolvedValue([MANUAL_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(mockListSdrManagerHosts).not.toHaveBeenCalled()
      expect(mockGetSdrManagerHostDevices).not.toHaveBeenCalled()
      expect(hostHeaders(wrapper)).toHaveLength(0)
      // No SENTINEL HOSTS subcategory and no way to add a host: only the remote SDR devices.
      expect(subcategory(wrapper, 'Sentinel Hosts')).toBeUndefined()
      expect(wrapper.findAll('.sdr-devices-add-btn').map((button) => button.text())).toEqual([
        '+ ADD A REMOTE SDR DEVICE',
      ])
      expect(
        subcategory(wrapper, 'Non-Sentinel SDR Devices')!.findAllComponents(SdrRadioRow),
      ).toHaveLength(1)
    })

    it('keeps polling manual radios while there are no hosts to poll', async () => {
      vi.useFakeTimers()
      mockListRadios.mockResolvedValue([MANUAL_RADIO])
      mountControl()
      await vi.runOnlyPendingTimersAsync()
      mockGetRadioStatus.mockClear()
      await vi.advanceTimersByTimeAsync(3000)
      expect(mockGetRadioStatus).toHaveBeenCalledWith(MANUAL_RADIO.id)
      expect(mockGetSdrManagerHostDevices).not.toHaveBeenCalled()
    })

    it('says only that there are no remote SDR devices yet', async () => {
      const wrapper = mountControl()
      await flushPromises()
      expect(wrapper.findAll('.sdr-devices-empty').map((empty) => empty.text())).toEqual([
        'No remote SDR devices yet.',
      ])
    })

    it('lists the SDRs of hosts SDR Manager brings once it comes up, without a header to edit them', async () => {
      // The card was opened before sdr-manager-remote registered, so it has no
      // host editor; a later poll finds the hosts all the same.
      vi.useFakeTimers()
      const unlistedRadio = { ...MANUAL_RADIO, id: 9, sdr_manager_host_id: 42 }
      mockListRadios.mockResolvedValue([unlistedRadio])
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
      const wrapper = mountControl()
      await vi.runOnlyPendingTimersAsync()
      const withdraw = provideCapability('radioSites', fakeSdrManagerHosts)
      await vi.advanceTimersByTimeAsync(3000)
      expect(wrapper.find('#sdr-host-1-sdrs').findComponent(SdrHostDeviceRow).exists()).toBe(true)
      expect(hostHeaders(wrapper)).toHaveLength(0)
      withdraw()
    })

    it('unmounts cleanly with no hosts subscription to stop', async () => {
      // Plain mount: this test unmounts it itself.
      const wrapper = mount(SdrDevicesControl)
      await flushPromises()
      expect(() => wrapper.unmount()).not.toThrow()
    })
  })

  describe('radios whose SDR host is not listed', () => {
    // The live case: radio 2 named host 1 after the hosts table was emptied, so
    // no host group existed to list it under and it could not be reached at all.
    const UNLISTED_HOST_RADIO: SdrRadioRecord = {
      ...MANUAL_RADIO,
      id: 5,
      name: 'RTL-SDR V4',
      host: '192.168.5.67',
      port: 4444,
      sdr_manager_host_id: 42,
      sdr_manager_device_id: 'serial:00000001',
    }

    function unlistedRow(wrapper: ReturnType<typeof mount>) {
      return wrapper
        .findAllComponents(SdrRadioRow)
        .find((row) => row.props('radio').id === UNLISTED_HOST_RADIO.id)
    }

    it('lists one under UNLISTED SENTINEL HOST, in SENTINEL HOSTS, editable as a remote SDR device', async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      mockGetSdrManagerHostDevices.mockResolvedValue(snapshot([DEVICE]))
      mockListRadios.mockResolvedValue([MIRRORED_RADIO, UNLISTED_HOST_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      const hosts = subcategory(wrapper, 'Sentinel Hosts')!
      expect(hosts.text()).toContain('UNLISTED SENTINEL HOST')
      expect(hosts.text()).toContain(
        'Their Sentinel host is no longer listed. Edit one to keep it as a remote SDR device, or delete it.',
      )
      const rows = wrapper.findAllComponents(SdrRadioRow)
      // The radio on a listed host stays in its host group, not here.
      expect(rows.map((row) => row.props('radio').id)).toEqual([MIRRORED_RADIO.id, 5])
      expect(unlistedRow(wrapper)!.props('editAsManual')).toBe(true)
    })

    it('reads its reachability from the TCP probe, as a manual radio does', async () => {
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      mockListRadios.mockResolvedValue([UNLISTED_HOST_RADIO])
      mockGetRadioStatus.mockResolvedValue({ connected: false })
      const wrapper = mountControl()
      await flushPromises()
      expect(mockGetRadioStatus).toHaveBeenCalledWith(5)
      expect(unlistedRow(wrapper)!.props('connected')).toBe(false)
    })

    it('does not call the list empty when it is the only radio', async () => {
      mockListRadios.mockResolvedValue([UNLISTED_HOST_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(wrapper.text()).not.toContain('No Sentinel hosts yet.')
      expect(unlistedRow(wrapper)).toBeDefined()
    })

    it('keeps it apart from the remote SDR devices', async () => {
      mockListRadios.mockResolvedValue([UNLISTED_HOST_RADIO, MANUAL_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(radioIdsIn(wrapper, 'Non-Sentinel SDR Devices')).toEqual([MANUAL_RADIO.id])
    })

    it('shows nothing until the hosts list has answered', async () => {
      // A radio on a perfectly good host must not flash up as unlisted while loading.
      mockListSdrManagerHosts.mockReturnValue(new Promise(() => {}))
      mockListRadios.mockResolvedValue([UNLISTED_HOST_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(unlistedRow(wrapper)).toBeUndefined()
      expect(wrapper.text()).not.toContain('UNLISTED SENTINEL HOST')
    })

    it('still lists it when the hosts list fails, but edits it through its host', async () => {
      // The host may well exist; detaching the radio on save would be wrong.
      mockListSdrManagerHosts.mockRejectedValue(new Error('offline'))
      mockListRadios.mockResolvedValue([UNLISTED_HOST_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(wrapper.text()).toContain(
        'The Sentinel host list could not be loaded, so these radios cannot be matched to a host yet.',
      )
      expect(unlistedRow(wrapper)!.props('editAsManual')).toBe(false)
    })

    it('edits it as manual once a later fetch of the hosts list succeeds', async () => {
      mockListSdrManagerHosts.mockRejectedValueOnce(new Error('offline'))
      mockListRadios.mockResolvedValue([UNLISTED_HOST_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      mockListSdrManagerHosts.mockResolvedValue([HOST])
      announceFakeHostsChanged()
      await flushPromises()
      expect(unlistedRow(wrapper)!.props('editAsManual')).toBe(true)
    })

    it('leaves the group once its host is listed again', async () => {
      mockListRadios.mockResolvedValue([UNLISTED_HOST_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(unlistedRow(wrapper)).toBeDefined()
      mockListSdrManagerHosts.mockResolvedValue([{ ...HOST, id: 42 }])
      announceFakeHostsChanged()
      await flushPromises()
      expect(wrapper.text()).not.toContain('UNLISTED SENTINEL HOST')
    })

    it('can be edited, saved and deleted', async () => {
      const changed = vi.fn()
      document.addEventListener(RADIOS_CHANGED_EVENT, changed)
      mockListRadios.mockResolvedValue([UNLISTED_HOST_RADIO])
      mockDeleteRadio.mockResolvedValue(true)
      const wrapper = mountControl()
      await flushPromises()
      const row = unlistedRow(wrapper)!

      row.vm.$emit('toggle-edit')
      await flushPromises()
      expect(row.props('open')).toBe(true)
      row.vm.$emit('cancel-edit')
      await flushPromises()
      expect(row.props('open')).toBe(false)

      row.vm.$emit('toggle-edit')
      await flushPromises()
      mockListRadios.mockClear()
      row.vm.$emit('save')
      await flushPromises()
      expect(row.props('open')).toBe(false)
      expect(mockListRadios).toHaveBeenCalled()

      row.vm.$emit('start-delete')
      await flushPromises()
      expect(row.props('confirming')).toBe(true)
      row.vm.$emit('cancel-delete')
      await flushPromises()
      expect(row.props('confirming')).toBe(false)

      changed.mockClear()
      row.vm.$emit('confirm-delete')
      await flushPromises()
      expect(mockDeleteRadio).toHaveBeenCalledWith(5)
      expect(changed).toHaveBeenCalledOnce()
      document.removeEventListener(RADIOS_CHANGED_EVENT, changed)
    })

    it('has no accessibility violations', async () => {
      mockListRadios.mockResolvedValue([UNLISTED_HOST_RADIO, MANUAL_RADIO])
      const wrapper = mountControl()
      await flushPromises()
      expect(
        await axe(wrapper.html(), {
          rules: { region: { enabled: false } },
        }),
      ).toHaveNoViolations()
    })

    describe('without SDR Manager', () => {
      beforeEach(() => {
        withdrawFakeSdrManagerHosts()
      })

      it('lists it under SENTINEL HOSTS, says SDR Manager is not deployed, and edits it as remote', async () => {
        mockListRadios.mockResolvedValue([UNLISTED_HOST_RADIO])
        const wrapper = mountControl()
        await flushPromises()
        const hosts = subcategory(wrapper, 'Sentinel Hosts')!
        expect(hosts.text()).toContain(
          'Their Sentinel host needs SDR Manager, which is not deployed. Edit one to keep it as a remote SDR device, or delete it.',
        )
        // Still no way to add a host without SDR Manager.
        expect(hosts.find('.sdr-devices-add-btn').exists()).toBe(false)
        expect(unlistedRow(wrapper)!.props('editAsManual')).toBe(true)
      })
    })
  })
})
