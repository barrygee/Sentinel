import { afterEach, beforeEach, vi } from 'vitest'
import { provideCapability } from '@sentinel/shell-api/shell/capabilities'
import type { RadioSitesCapability } from '@sentinel/shell-api/shell/radioSitesCapability'

/**
 * Spec double for the `radioSites` capability the SDR section reaches the SDR
 * hosts through (`services/sdrManagerHosts.ts`). A spec calls
 * `useFakeSdrManagerHosts()` at the top level: the fake is then provided
 * through the real capability registry before each test (so the section's
 * real lookup code runs) and withdrawn after it. A test of the "SDR Manager
 * not deployed" case calls `withdrawFakeSdrManagerHosts()` before mounting.
 * Each method is driven with `vi.mocked(fakeSdrManagerHosts.<method>)`.
 */
const hostsChangedListeners = new Set<() => void>()

export const fakeSdrManagerHosts = {
  listSites: vi.fn<RadioSitesCapability['listSites']>(),
  listDevices: vi.fn<RadioSitesCapability['listDevices']>(),
  listHosts: vi.fn<RadioSitesCapability['listHosts']>(),
  getHostDevices: vi.fn<RadioSitesCapability['getHostDevices']>(),
  getHostDeviceRecords: vi.fn<RadioSitesCapability['getHostDeviceRecords']>(),
  patchHostDevice: vi.fn<RadioSitesCapability['patchHostDevice']>(),
  flashHostDeviceSerial: vi.fn<RadioSitesCapability['flashHostDeviceSerial']>(),
  // A plain function, not a mock: `restoreMocks` must never drop a subscription.
  onHostsChanged(listener: () => void): () => void {
    hostsChangedListeners.add(listener)
    return () => {
      hostsChangedListeners.delete(listener)
    }
  },
} satisfies RadioSitesCapability

/** Calls every `onHostsChanged` listener, as an add/edit/delete in SDR Manager would. */
export function announceFakeHostsChanged(): void {
  for (const listener of [...hostsChangedListeners]) listener()
}

/**
 * A host's rejection as the capability delivers it: an `Error` carrying the
 * SDR Manager API's `status`, `code` and any extra context.
 */
export function hostRejection(
  status: number,
  code: string,
  message: string,
  context: Record<string, unknown> = {},
): Error & { status: number; code: string; context: Record<string, unknown> } {
  return Object.assign(new Error(message), { status, code, context })
}

let withdrawProvided: () => void = () => {}

/** Provides the fake before each test of the calling spec and withdraws it after. */
export function useFakeSdrManagerHosts(): void {
  beforeEach(() => {
    withdrawProvided = provideCapability('radioSites', fakeSdrManagerHosts)
  })
  afterEach(() => {
    withdrawFakeSdrManagerHosts()
  })
}

/** As if sdr-manager-remote were not deployed: no `radioSites` capability. */
export function withdrawFakeSdrManagerHosts(): void {
  withdrawProvided()
  withdrawProvided = () => {}
}
