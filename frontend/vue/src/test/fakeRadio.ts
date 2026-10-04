import { reactive } from 'vue'
import { vi } from 'vitest'
import { provideCapability } from '@/shell/capabilities'
import type {
  RadioCapability,
  RadioDecoderKind,
  RadioDecoders,
  RadioSummary,
} from '@/shell/radioCapability'
import type { RadioSite, RadioSiteDevices } from '@/shell/radioSitesCapability'

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
 * A stand-in `radioSites` capability (the Sentry fleet) for core's site
 * markers and Air's receiver picker. Withdraw it afterwards, like the radio.
 */
export function provideFakeRadioSites(
  initial: { sites?: RadioSite[]; devices?: RadioSiteDevices } = {},
) {
  const listSites = vi.fn<() => Promise<RadioSite[]>>().mockResolvedValue(initial.sites ?? [])
  const listDevices = vi
    .fn<() => Promise<RadioSiteDevices>>()
    .mockResolvedValue(initial.devices ?? { hostCount: 0, hosts: [] })
  const withdraw = provideCapability('radioSites', { listSites, listDevices })
  return { listSites, listDevices, withdraw }
}
