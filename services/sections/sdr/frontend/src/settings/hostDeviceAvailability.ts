import type { SdrManagerDeviceStatus } from '@sentinel/shell-api/types/sdrManager'

/**
 * Why a Sentinel host's SDR can't be added as a radio, in the operator's
 * terms, or '' when it can.
 *
 * A **private** or **disabled** device is not offered as a source at all. Both
 * are the operator saying, on the host, that this dongle is not for sharing or
 * not in service; mirroring it into Sentinel would quietly contradict that, and
 * the radio would then fail to connect for a reason nothing in Sentinel
 * explains. A device the host has only just detected has no output port yet,
 * so there is nothing to connect to. Each gets its own reason: an ADD button
 * that is merely greyed out with no reason is worse than one that is absent.
 */
export function hostDeviceAddBlockedReason(device: SdrManagerDeviceStatus): string {
  if (device.visibility !== 'public') {
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
