import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'
import { THIS_MACHINE_LABEL } from '@sentinel/shell-api/utils/thisMachineLabel'

export { THIS_MACHINE_LABEL }

/**
 * How an SDR host is named anywhere in the UI: this Sentinel's own SDR Manager
 * as this machine (`thisMachineLabel`, passed in by the caller from the app
 * store), any other host by the label this operator gave it, else the name its
 * own operator gave it, else its address.
 *
 * One rule for every place a host shows, so this machine never surfaces as the
 * address Docker reaches it by (`host.docker.internal`) or as the name its SDR
 * Manager reports for itself (`sdr-manager`), and a Pi is never mistaken for it.
 *
 * @param thisMachine what to call this machine — `useAppStore().thisMachineLabel`.
 */
export function sdrHostLabel(
  host: Pick<SdrManagerHost, 'name' | 'address' | 'is_local' | 'machine_name'>,
  thisMachine: string = THIS_MACHINE_LABEL,
): string {
  if (host.is_local) return thisMachine
  return host.name || host.machine_name || host.address
}
