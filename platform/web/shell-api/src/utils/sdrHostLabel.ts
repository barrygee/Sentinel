import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'

/** What this Sentinel's own SDR Manager is called when the operator hasn't labelled it. */
export const THIS_MACHINE_LABEL = 'This machine'

/**
 * How an SDR host is named anywhere in the UI: the label the operator gave it,
 * else "This machine" for this Sentinel's own SDR Manager, else its address.
 *
 * One rule for every place a host shows, so this machine never surfaces as the
 * address Docker reaches it by (`host.docker.internal`) or as the name its SDR
 * Manager reports for itself (`sdr-manager`), and a Pi is never mistaken for it.
 */
export function sdrHostLabel(host: Pick<SdrManagerHost, 'name' | 'address' | 'is_local'>): string {
  return host.name || (host.is_local ? THIS_MACHINE_LABEL : host.address)
}
