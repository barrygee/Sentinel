/**
 * Which section owns which frontend files — the map the `sentinel/section-
 * boundaries` lint rule enforces (docs/plans/section-containers.md, P2).
 *
 * Everything under `components/<section>/` belongs to that section. The flat
 * `stores/`, `composables/`, `services/` and `utils/` folders mix core and
 * section files, so their section-owned files are listed here. Anything not
 * matched is core (the shell, shared UI, core stores).
 *
 * Paths are relative to `src/`, without extension. Add a section-owned file in
 * a flat folder here, or the rule will treat it as core.
 */
export type SectionId = 'air' | 'space' | 'sea' | 'land' | 'sdr'

export const SECTION_OWNERSHIP: Record<SectionId, RegExp[]> = {
  air: [
    /^components\/air\//,
    /^stores\/air$/,
    /^stores\/airNotif$/,
    /^composables\/useAirAlertsService$/,
    /^composables\/useAdsbSourceClaim$/,
    /^composables\/useOverheadAlertZones$/,
    /^services\/adsbSourceApi$/,
  ],
  space: [
    /^components\/space\//,
    /^stores\/space$/,
    /^composables\/useSpaceAlertsService$/,
    /^utils\/satelliteUtils$/,
  ],
  sea: [
    /^components\/sea\//,
    /^stores\/sea$/,
    /^composables\/useOffgridAisDecode$/,
    /^services\/seaApi$/,
    /^utils\/aisShipType$/,
    /^utils\/marineVhf$/,
    /^utils\/mmsiCountry$/,
  ],
  land: [
    /^components\/land\//,
    /^stores\/land$/,
    /^stores\/repeaters$/,
    /^services\/repeatersApi$/,
  ],
  sdr: [
    /^components\/sdr\//,
    /^stores\/sdr$/,
    /^composables\/useSdr[A-Z]/,
    /^composables\/sdrDeviceEvents$/,
    /^composables\/useFrequencyGroupFilter$/,
    /^services\/sdrRadiosApi$/,
    /^services\/sdrSearchApi$/,
    /^services\/sentryApi$/,
  ],
}

/**
 * The one core file allowed to import sections: it is where every section is
 * registered (and what the federated shell replaces with a runtime loader).
 */
export const COMPOSITION_ROOTS = ['shell/sections']

/** The section that owns a `src/`-relative path (no extension), or 'core'. */
export function ownerOf(srcRelativePath: string): SectionId | 'core' {
  for (const [section, patterns] of Object.entries(SECTION_OWNERSHIP) as [SectionId, RegExp[]][]) {
    if (patterns.some((pattern) => pattern.test(srcRelativePath))) return section
  }
  return 'core'
}
