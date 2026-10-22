import { getCapability } from '@sentinel/shell-api/shell/capabilities'
import type { RadioSitesCapability } from '@sentinel/shell-api/shell/radioSitesCapability'

/**
 * The SDR section's way to the SDR hosts: the `radioSites` capability
 * sdr-manager-remote provides (ADR 0007). The section never calls the hosts
 * API itself, so DEVICES keeps working, minus its host groups, while
 * sdr-manager-remote is not deployed.
 */

/** Thrown when a radio mirrors a host device but sdr-manager-remote is not deployed. */
export class SdrManagerUnavailableError extends Error {
  readonly code = 'sdr_manager_unavailable'

  constructor() {
    super("SDR Manager isn't running, so this device's settings can't be reached.")
    this.name = 'SdrManagerUnavailableError'
  }
}

/** The hosts capability, or `undefined` while sdr-manager-remote is not deployed. */
export function findSdrManagerHosts(): RadioSitesCapability | undefined {
  return getCapability('radioSites')
}

/**
 * The hosts capability, for a call that cannot do without it.
 *
 * @throws SdrManagerUnavailableError while sdr-manager-remote is not deployed.
 */
export function requireSdrManagerHosts(): RadioSitesCapability {
  const hosts = findSdrManagerHosts()
  if (!hosts) throw new SdrManagerUnavailableError()
  return hosts
}

/**
 * What to tell the operator about a failed host call: the host's own
 * rejection (an error carrying a string `code`, as every capability rejection
 * and `SdrManagerUnavailableError` do), or `fallback` for anything else — a
 * failed request to Sentinel's own radio API, whose raw text means nothing to
 * an operator.
 */
export function hostErrorMessage(error: unknown, fallback: string): string {
  const isHostRejection =
    error instanceof Error && typeof (error as { code?: unknown }).code === 'string'
  return isHostRejection ? error.message : fallback
}
