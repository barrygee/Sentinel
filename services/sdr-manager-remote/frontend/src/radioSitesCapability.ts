import {
  flashHostDeviceSerial,
  getHostDeviceRecords,
  getHostDevices,
  listHosts,
  listHostSites,
  patchHostDevice,
} from './api/sdrManagerRemoteApi'
import { onHostsChanged } from './hostsChanged'
import type {
  RadioSiteDevices,
  RadioSitesCapability,
} from '@sentinel/shell-api/shell/radioSitesCapability'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'

/**
 * sdr-manager-remote's `radioSites` capability: the SDR hosts, read through
 * the hosts API this package owns. Provided at registration (`register.ts`),
 * so core's site markers, Air's receiver picker and the SDR section's host
 * groups never import that API.
 */
export function createRadioSitesCapability(): RadioSitesCapability {
  return {
    listSites: () => listHostSites(),
    async listDevices(): Promise<RadioSiteDevices> {
      let hosts: SdrManagerHost[]
      try {
        hosts = await listHosts()
      } catch {
        // Sentinel itself being unreachable is the caller's problem to show;
        // here it just means there is nothing to offer.
        hosts = []
      }
      const result: RadioSiteDevices = { hostCount: hosts.length, hosts: [] }
      for (const host of hosts) {
        if (!host.enabled) continue
        try {
          const snapshot = await getHostDevices(host.id)
          result.hosts.push({
            id: host.id,
            label: host.name || host.address,
            devices: (snapshot.status?.sdrs ?? []).map((device) => ({
              deviceId: device.device_id,
              name: device.name || device.device_id,
              enabled: device.enabled,
              public: device.visibility === 'public',
            })),
          })
        } catch {
          /* an unreachable host contributes nothing rather than failing the list */
        }
      }
      return result
    },
    listHosts: () => listHosts(),
    getHostDevices: (hostId) => getHostDevices(hostId),
    getHostDeviceRecords: (hostId) => getHostDeviceRecords(hostId),
    patchHostDevice: (hostId, deviceId, patch) => patchHostDevice(hostId, deviceId, patch),
    async flashHostDeviceSerial(hostId, deviceId, serial): Promise<void> {
      await flashHostDeviceSerial(hostId, deviceId, serial)
    },
    onHostsChanged,
  }
}
