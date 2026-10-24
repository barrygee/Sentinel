/**
 * The Settings › SDR Manager nav entry (ADR 0007), shared by the two remotes
 * that fill it: sdr-manager-local adds the THIS MACHINE group and
 * sdr-manager-remote the REMOTE SDR HOSTS group. Each registers this identical
 * entry, and whichever loads first creates it (`registerSettingsSection`
 * accepts an identical re-registration). Here, not in either remote, because
 * neither may import the other.
 */
export const SDR_MANAGER_SETTINGS_SECTION = {
  key: 'sdr-manager',
  label: 'SDR Manager',
  order: 15,
  domain: false,
} as const
