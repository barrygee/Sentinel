import type { Component } from 'vue'
import type {
  SdrManagerDevicePatch,
  SdrManagerDeviceRecord,
  SdrManagerDeviceRecordsPayload,
  SdrManagerDeviceSnapshot,
  SdrManagerHost,
} from '@sentinel/shell-api/types/sdrManager'

/**
 * The `radioSites` capability — the SDR hosts as other parts of the app see
 * them (docs/plans/section-containers.md §3.6, ADR 0007). Provided by
 * `@sentinel/sdr-manager-remote`, which owns the hosts; read through
 * `getCapability('radioSites')`, which is `undefined` while sdr-manager-remote
 * is not deployed.
 *
 * Core uses it for the site markers on every map, the overhead-alert zones and
 * the range-ring origin; Air uses it to pick its ADS-B receiver; the SDR
 * section mirrors host devices into its radios and edits them, and the hosts
 * themselves (`hostEditor`), through it. None
 * of them needs the hosts' API, its auth or its host records.
 */

/** An SDR host that reports where it is. */
export interface RadioSite {
  id: number
  name: string | null
  address: string
  port: number
  reachable: boolean
  latitude: number
  longitude: number
  /** When the host last updated its own position (Unix ms), if it says. */
  updated_at: number | null
}

/** One device a host publishes. */
export interface RadioSiteDevice {
  deviceId: string
  name: string
  enabled: boolean
  /** The host's operator marked it public (shareable). */
  public: boolean
}

/** The devices of every enabled host that answered. */
export interface RadioSiteDevices {
  /** Every registered host, enabled or not — tells "none registered" from "none answering". */
  hostCount: number
  hosts: Array<{ id: number; label: string; devices: RadioSiteDevice[] }>
}

/**
 * The pieces Settings › SDR's Radios card shows the hosts with, owned by
 * sdr-manager-remote so the SDR section edits hosts without importing it.
 */
export interface RadioSiteHostEditor {
  /**
   * One host as an accordion title above its SDRs, with edit and remove.
   * Props `{ host: SdrManagerHost, expanded: boolean, sdrCount: number | null,
   * controlsId: string }` (`controlsId` names the list it opens and folds);
   * emits `toggle`, and `stage` with the closure that saves its edits, for
   * APPLY CHANGES.
   */
  HostHeader: Component
  /** The form that adds a host. Emits `done` once the host is added or the form cancelled. */
  NewHostForm: Component
}

/**
 * Every call below that reaches a host rejects with an `Error` carrying a
 * string `code` (e.g. `port_conflict`, `network_error`) and a `message` that is
 * the host's own rejection, worded to show the operator as it is.
 */
export interface RadioSitesCapability {
  /** Every enabled host with a known position. Rejects when the list cannot be read. */
  listSites(): Promise<RadioSite[]>
  /** The published devices of every enabled host; an unreachable host contributes none. */
  listDevices(): Promise<RadioSiteDevices>
  /** Every registered host, enabled or not, this machine's own included. */
  listHosts(): Promise<SdrManagerHost[]>
  /** The poller's cached device snapshot of one host: live presence and state, no tuning. */
  getHostDevices(hostId: number): Promise<SdrManagerDeviceSnapshot>
  /** One host's persisted device configuration, read live — for an edit form to pre-fill. */
  getHostDeviceRecords(hostId: number): Promise<SdrManagerDeviceRecordsPayload>
  /** Applies a partial update to one device; resolves with what the host stored. */
  patchHostDevice(
    hostId: number,
    deviceId: string,
    patch: SdrManagerDevicePatch,
  ): Promise<SdrManagerDeviceRecord>
  /** Starts a permanent EEPROM serial flash. Callers must have the operator's confirmation first. */
  flashHostDeviceSerial(hostId: number, deviceId: string, serial: string): Promise<void>
  /**
   * Calls `listener` whenever a host is added, edited or deleted.
   *
   * @returns a function that stops the calls.
   */
  onHostsChanged(listener: () => void): () => void
  /** Settings › SDR's host title rows and add form. */
  hostEditor: RadioSiteHostEditor
}
