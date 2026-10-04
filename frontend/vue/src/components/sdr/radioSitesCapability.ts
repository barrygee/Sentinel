import {
  getSentryHostDevices,
  listSentryHosts,
  listSentrySites,
  type SentryHost,
} from '@/services/sentryApi'
import type { RadioSiteDevices, RadioSitesCapability } from '@/shell/radioSitesCapability'

/**
 * The sdr section's `radioSites` capability: the Sentry fleet, read through
 * the Sentry admin API this section owns. Provided at registration
 * (`section.ts`), so core's site markers and Air's receiver picker never
 * import that API.
 */
export function createSdrRadioSitesCapability(): RadioSitesCapability {
  return {
    listSites: () => listSentrySites(),
    async listDevices(): Promise<RadioSiteDevices> {
      let hosts: SentryHost[]
      try {
        hosts = await listSentryHosts()
      } catch {
        // Sentinel itself being unreachable is the caller's problem to show;
        // here it just means there is nothing to offer.
        hosts = []
      }
      const result: RadioSiteDevices = { hostCount: hosts.length, hosts: [] }
      for (const host of hosts) {
        if (!host.enabled) continue
        try {
          const snapshot = await getSentryHostDevices(host.id)
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
  }
}
