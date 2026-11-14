/** What this machine is called on its own screens, before and after the operator's name. */
export const THIS_MACHINE_LABEL = 'This machine'

/** The longest machine name kept, as sdr-manager-local and sdr-manager-remote cut it. */
export const MACHINE_NAME_MAX_LENGTH = 64

/**
 * How this machine is named on its own screens: `<name> (This machine)`, or
 * just `This machine` while the operator hasn't named it.
 *
 * One machine, one name: its position (Settings › Location, the range-ring
 * origin, overhead alerts) and its own SDR Manager (Settings › SDR's SENTINEL
 * HOSTS, the device selector, the map site) are all this machine, so every one
 * of them reads the same. Other Sentinels see only the name (`source.machine_name`).
 *
 * @param machineName the `app.machineName` setting; blank means unnamed.
 */
export function thisMachineLabel(machineName: string | null | undefined): string {
  const name = machineName?.trim() ?? ''
  return name ? `${name} (${THIS_MACHINE_LABEL})` : THIS_MACHINE_LABEL
}
