import { APP_SETTINGS_POSITIONS } from '@sentinel/shell-api/shell/appSettingsSection'
import { registerSettingItems } from '@sentinel/shell-api/shell/settingsRegistry'
import GlobeEnabledControl from './settings/GlobeEnabledControl.vue'

/** Core's App Settings section, which this remote adds its switch to. */
const APP_SETTINGS_SECTION_KEY = 'app'
const APP_SETTINGS_SECTION_LABEL = 'App Settings'

/**
 * Adds the 3D Globe switch to Settings › App Settings.
 *
 * Registered by the globe's own remote rather than core, so the switch exists
 * only while the `globe` service is deployed: with `SENTINEL_GLOBE_REPLICAS=0`
 * there is nothing to switch on. Offered in the full app only (SDR
 * Manager-only mode has no sections).
 */
export function registerGlobeSettings(): void {
  registerSettingItems([
    {
      section: APP_SETTINGS_SECTION_KEY,
      sectionLabel: APP_SETTINGS_SECTION_LABEL,
      id: 'globe-enabled',
      modes: ['full'],
      label: '3D Globe',
      desc: 'Show the GLOBE section: live aircraft, satellites, vessels and APRS stations on a 3D globe',
      searchTerms: 'globe 3d earth world section enable show',
      groupLabel: 'SECTIONS',
      position: APP_SETTINGS_POSITIONS.optionalSections,
      docPath: 'use/globe',
      control: { component: GlobeEnabledControl, emits: ['stage'] },
    },
  ])
}
