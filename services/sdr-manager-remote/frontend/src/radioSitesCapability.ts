import {
  flashHostDeviceSerial,
  getHostDeviceRecords,
  getHostDevices,
  listHosts,
  listHostSites,
  patchHostDevice,
} from './api/sdrManagerRemoteApi'
import { onHostsChanged } from './hostsChanged'
import RemoteHostAddForm from './components/RemoteHostAddForm.vue'
import RemoteHostHeader from './components/RemoteHostHeader.vue'
import type {
  RadioSiteDevices,
  RadioSitesCapability,
} from '@sentinel/shell-api/shell/radioSitesCapability'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { sdrHostLabel } from '@sentinel/shell-api/utils/sdrHostLabel'

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
      // Read once, outside the per-host catch below, which is for unreachable hosts only.
      const thisMachine = useAppStore().thisMachineLabel
      for (const host of hosts) {
        if (!host.enabled) continue
        try {
          const snapshot = await getHostDevices(host.id)
          result.hosts.push({
            id: host.id,
            label: sdrHostLabel(host, thisMachine),
            devices: (snapshot.status?.sdrs ?? []).map((device) => ({
              deviceId: device.device_id,
              name: device.name || device.device_id,
              enabled: device.enabled,
              usable: device.visibility === 'public' || host.may_use_private,
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
    hostEditor: { HostHeader: RemoteHostHeader, NewHostForm: RemoteHostAddForm },
  }
}
