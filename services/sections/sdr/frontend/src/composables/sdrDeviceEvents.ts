/**
 * Shared `document` `CustomEvent` names for the SDR devices settings surface.
 * Kept in one small module (rather than exported from a `.vue` SFC) so the
 * components that fire and hear them import the same string without
 * depending on each other's component module.
 *
 * Host changes are not an event here: SDR Manager owns the hosts and
 * announces changes through the `radioSites` capability's `onHostsChanged`.
 */

/** Fired after any Sentinel radio is added/edited/deleted. Pre-dates this
 * feature — several components already listen for it (e.g. `SdrPanel.vue`,
 * `SdrDeviceSelector.vue`'s host store reload). */
export const RADIOS_CHANGED_EVENT = 'sdr:radios-changed'
