import { reactive } from 'vue'
import { vi } from 'vitest'
import { provideCapability } from '@sentinel/shell-api/shell/capabilities'
import type {
  RadioCapability,
  RadioDecoderKind,
  RadioDecoders,
  RadioSummary,
} from '@sentinel/shell-api/shell/radioCapability'
import type {
  RadioSite,
  RadioSiteDevices,
  RadioSitesCapability,
} from '@sentinel/shell-api/shell/radioSitesCapability'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'

/**
 * A stand-in `radio` capability for specs of the sections that *use* the SDR
 * (Air/Sea/Land filters, the pass scheduler), so they no longer need the real
 * SDR store or engine. `connected` and `storedHz` are reactive, so a spec can
 * flip them after mount and see the UI follow.
 *
 * Call `provideFakeRadio()` before mounting; call the returned `withdraw()`
 * afterwards (an un-withdrawn provider makes the next `provide` throw).
 */
export function provideFakeRadio(
  initial: {
    connected?: boolean
    storedHz?: number[]
    /** Which radio each background decoder runs on, e.g. `{ aprs: 2 }`. */
    activeDecoders?: Partial<Record<RadioDecoderKind, number | null>>
    radios?: RadioSummary[]
  } = {},
) {
  const state = reactive({
    connected: initial.connected ?? false,
    storedHz: [...(initial.storedHz ?? [])],
    activeDecoders: { aprs: null, ais: null, ...initial.activeDecoders } as Record<
      RadioDecoderKind,
      number | null
    >,
  })
  const tune = vi.fn<RadioCapability['tune']>()
  const restore = vi.fn<RadioCapability['restore']>()
  const frequencies = {
    ensureLoaded: vi.fn<RadioCapability['frequencies']['ensureLoaded']>(),
    has: vi.fn((frequencyHz: number) => state.storedHz.includes(frequencyHz)),
    save: vi.fn<RadioCapability['frequencies']['save']>().mockResolvedValue(undefined),
    remove: vi.fn<RadioCapability['frequencies']['remove']>().mockResolvedValue(undefined),
    ensureGroup: vi.fn<RadioCapability['frequencies']['ensureGroup']>().mockResolvedValue(1),
  }
  // A started decoder becomes the active one; a stopped one clears it — as the
  // radio platform's bridges behave. Override with mockResolvedValue(false) to
  // simulate a refusal (state then left as it was).
  const decoders = {
    activeRadioId: vi.fn((kind: RadioDecoderKind) => state.activeDecoders[kind]),
    refresh: vi.fn<RadioDecoders['refresh']>().mockResolvedValue(undefined),
    start: vi.fn(async (kind: RadioDecoderKind, radioId: number) => {
      state.activeDecoders[kind] = radioId
      return true
    }),
    stop: vi.fn(async (kind: RadioDecoderKind) => {
      state.activeDecoders[kind] = null
      return true
    }),
  }
  const listRadios = vi.fn<RadioCapability['listRadios']>().mockResolvedValue(initial.radios ?? [])
  const capability: RadioCapability = {
    get connected() {
      return state.connected
    },
    tune,
    restore,
    frequencies,
    decoders,
    listRadios,
  }
  const withdraw = provideCapability('radio', capability)
  return { state, tune, restore, frequencies, decoders, listRadios, withdraw }
}

/**
 * A stand-in `radioSites` capability (the SDR hosts) for core's site markers,
 * Air's receiver picker and the SDR section's host groups. Withdraw it
 * afterwards, like the radio. `notifyHostsChanged` calls every
 * `onHostsChanged` listener, as an add/edit/delete in SDR Manager would.
 */
export function provideFakeRadioSites(
  initial: {
    sites?: RadioSite[]
    devices?: RadioSiteDevices
    hosts?: SdrManagerHost[]
  } = {},
) {
  const listSites = vi.fn<() => Promise<RadioSite[]>>().mockResolvedValue(initial.sites ?? [])
  const listDevices = vi
    .fn<() => Promise<RadioSiteDevices>>()
    .mockResolvedValue(initial.devices ?? { hostCount: 0, hosts: [] })
  const listHosts = vi
    .fn<RadioSitesCapability['listHosts']>()
    .mockResolvedValue(initial.hosts ?? [])
  const getHostDevices = vi.fn<RadioSitesCapability['getHostDevices']>().mockResolvedValue({
    reachable: true,
    last_error: null,
    last_polled_at: null,
    last_success_at: null,
    api_version: null,
    status: { generated_at: 0, sdrs: [] },
  })
  const getHostDeviceRecords = vi
    .fn<RadioSitesCapability['getHostDeviceRecords']>()
    .mockResolvedValue({
      devices: [],
      port_suggestion: null,
      constraints: { min_port: 1024, max_port: 65535, control_port_offset: 1, reserved_ports: [] },
    })
  const patchHostDevice = vi.fn<RadioSitesCapability['patchHostDevice']>()
  const flashHostDeviceSerial = vi
    .fn<RadioSitesCapability['flashHostDeviceSerial']>()
    .mockResolvedValue(undefined)
  const hostsChangedListeners = new Set<() => void>()
  const onHostsChanged = vi.fn((listener: () => void) => {
    hostsChangedListeners.add(listener)
    return () => hostsChangedListeners.delete(listener)
  })
  const notifyHostsChanged = (): void => {
    for (const listener of hostsChangedListeners) listener()
  }
  const withdraw = provideCapability('radioSites', {
    listSites,
    listDevices,
    listHosts,
    getHostDevices,
    getHostDeviceRecords,
    patchHostDevice,
    flashHostDeviceSerial,
    onHostsChanged,
  })
  return {
    listSites,
    listDevices,
    listHosts,
    getHostDevices,
    getHostDeviceRecords,
    patchHostDevice,
    flashHostDeviceSerial,
    onHostsChanged,
    notifyHostsChanged,
    withdraw,
  }
}
