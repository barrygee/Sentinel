/**
 * Where each part of Settings › App Settings sits (`SettingItem.position`).
 *
 * Core registers App Settings' own cards (`frontend/vue`'s appSettings.ts) and
 * sdr-manager-local adds this machine's, in whatever order the remotes load,
 * so the page's order is pinned here rather than left to registration order:
 *
 * - `ownGroups` — core's cards from GENERAL down to CONFIGURATION (the
 *   default position, 0).
 * - `configurationExtras` — another service's card that belongs under
 *   CONFIGURATION (this machine's SDR Manager config), straight after Export
 *   All so it joins that heading.
 * - `optionalSections` — the switch of a section that is off until turned on
 *   and adds it itself (the globe's 3D Globe), in its own SECTIONS group, so
 *   it shows only while that section's service runs.
 * - `security` — core's Certificate card (SECURITY).
 * - `thisMachine` — sdr-manager-local's THIS MACHINE group.
 */
export const APP_SETTINGS_POSITIONS = {
  ownGroups: 0,
  configurationExtras: 10,
  optionalSections: 15,
  security: 20,
  thisMachine: 30,
} as const

/**
 * The CONFIGURATION group heading. A card that names the same heading as the
 * card above it joins that group, so a remote's card uses this to sit under
 * core's Application Config and Export All instead of starting a group of its
 * own (it still gets the heading where those are absent, in SDR Manager-only
 * mode).
 */
export const APP_SETTINGS_CONFIGURATION_GROUP = 'CONFIGURATION'
