/**
 * The Settings › SDR Manager nav entry (ADR 0007): the one page of SDR
 * Manager-only mode, which sdr-manager-local's THIS MACHINE group fills. In the
 * full app that group sits on Settings › SDR instead (`SDR_SETTINGS_SECTION`).
 */
export const SDR_MANAGER_SETTINGS_SECTION = {
  key: 'sdr-manager',
  label: 'SDR Manager',
  order: 15,
  domain: false,
} as const
