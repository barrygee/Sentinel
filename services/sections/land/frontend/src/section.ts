import { getActivePinia } from 'pinia'
import { registerSection } from '@sentinel/shell-api/shell/sectionRegistry'
import { assertHostPinia, type ShellContext } from '@sentinel/shell-api/shell/shellContext'
import { registerSettingsHydrator } from '@sentinel/shell-api/shell/settingsHydration'
import { registerSidebarFilterSubTabs } from '@sentinel/shell-api/shell/sidebarRegistry'
import LandView from './LandView.vue'
import { landSidebarFilter } from './landSidebarFilter'
import { registerLandSettings } from './settings'
import { hydrateLandFromSettings } from './landSettingsHydration'

/**
 * Registers the LAND section with the shell (route + nav entry).
 *
 * The section's `./register` entry: the shell calls it once at boot, statically
 * in dev and tests and through Module Federation in the built app
 * (docs/plans/section-containers.md §3.6).
 */
export default function register(shell: ShellContext): void {
  assertHostPinia(shell, getActivePinia(), 'land')

  // Its Settings nav entry and items (F3).
  registerLandSettings()

  registerSection({
    id: 'land',
    label: 'LAND',
    navOrder: 40,
    enabledByDefault: false,
    route: { path: '/land/', component: LandView },
  })

  // FILTER rail sub-tabs (F2).
  registerSidebarFilterSubTabs('land', landSidebarFilter)

  // Applies its stored settings to its stores at boot, before the first render (F1).
  registerSettingsHydrator('land', hydrateLandFromSettings)
}
