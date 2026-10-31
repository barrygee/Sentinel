/**
 * The Settings › SDR nav entry, shared by the three remotes that fill it in
 * the full app: the SDR section (its radios, options and frequency data) and
 * sdr-manager-local (this machine's cards). sdr-manager-remote adds no card:
 * its hosts appear in the Radios card through the `radioSites` capability.
 * Each registers this identical entry, and whichever loads first creates it
 * (`registerSettingsSection` accepts an identical re-registration). Here, not
 * in any one remote, because none may import another.
 */
export const SDR_SETTINGS_SECTION = {
  key: 'sdr',
  label: 'SDR',
  order: 50,
  domain: true,
} as const

/**
 * Where each remote's groups sit on the SDR page (`SettingItem.position`).
 * The remotes register in whatever order the service registry lists them, so
 * without these this machine's cards could land above Radios.
 */
export const SDR_SETTINGS_POSITIONS = {
  devices: 10,
  thisMachine: 30,
  options: 40,
  frequencyData: 50,
} as const
