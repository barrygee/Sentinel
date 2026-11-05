import type { SdrManagerDeviceStatus } from '@sentinel/shell-api/types/sdrManager'

/**
 * Why a Sentinel host's SDR can't be added as a radio, in the operator's
 * terms, or '' when it can.
 *
 * A **disabled** device, or a **private** one this Sentinel may not use, is not offered
 * as a source at all. Both are the operator saying, on the host, that this
 * dongle is not in service or not for sharing, and the host would refuse the
 * connection. A host offers its private dongles to itself and the Sentinels it
 * lists (`mayUsePrivate`). A device the host has only just detected has no output port yet,
 * so there is nothing to connect to. Each gets its own reason: an ADD button
 * that is merely greyed out with no reason is worse than one that is absent.
 */
export function hostDeviceAddBlockedReason(
  device: SdrManagerDeviceStatus,
  mayUsePrivate = false,
): string {
  if (device.visibility !== 'public' && !mayUsePrivate) {
    return 'This device is private on its SDR host — make it public to use it as a source'
  }
  if (!device.enabled) {
    return 'This device is disabled on its SDR host'
  }
  if (device.output === null) {
    return 'SDR host has not assigned this device an output port yet'
  }
  return ''
}

/**
 * Why an SDR on a host that adds its SDRs automatically (`auto_add_sdrs`) is
 * not a radio, as a short tag: **private** to this Sentinel (`mayUsePrivate` false)
 * or not set up yet, with no output port. Anything else is only waiting for the
 * next poll to add it.
 */
export function hostDeviceNotRadioReason(
  device: SdrManagerDeviceStatus,
  mayUsePrivate = false,
): string {
  if (device.visibility !== 'public' && !mayUsePrivate) return 'PRIVATE'
  if (device.output === null) return 'NOT SET UP'
  return 'ADDING…'
}
