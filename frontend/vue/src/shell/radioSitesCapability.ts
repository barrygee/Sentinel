/**
 * The `radioSites` capability — the Sentry fleet as other parts of the app see
 * it (docs/plans/section-containers.md §3.6). Provided by the radio platform
 * (the sdr section in the monolith); read through `getCapability('radioSites')`.
 *
 * Core uses it for the site markers on every map, the overhead-alert zones and
 * the range-ring origin; Air uses it to pick its ADS-B receiver. None of them
 * needs the Sentry admin API, its auth or its host records.
 */

/** A Sentry host that reports where it is. */
export interface RadioSite {
  id: number
  name: string | null
  address: string
  port: number
  reachable: boolean
  latitude: number
  longitude: number
  /** When the Sentry last updated its own position (Unix ms), if it says. */
  updated_at: number | null
}

/** One device a Sentry publishes. */
export interface RadioSiteDevice {
  deviceId: string
  name: string
  enabled: boolean
  /** The Sentry operator marked it public (shareable). */
  public: boolean
}

/** The devices of every enabled Sentry host that answered. */
export interface RadioSiteDevices {
  /** Every registered host, enabled or not — tells "none registered" from "none answering". */
  hostCount: number
  hosts: Array<{ id: number; label: string; devices: RadioSiteDevice[] }>
}

export interface RadioSitesCapability {
  /** Every enabled host with a known position. Rejects when the list cannot be read. */
  listSites(): Promise<RadioSite[]>
  /** The published devices of every enabled host; an unreachable host contributes none. */
  listDevices(): Promise<RadioSiteDevices>
}
