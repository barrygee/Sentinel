import { getActivePinia } from 'pinia'
import { registerSection } from '@sentinel/shell-api/shell/sectionRegistry'
import { assertHostPinia, type ShellContext } from '@sentinel/shell-api/shell/shellContext'
import { registerSidebarFilterSubTabs } from '@sentinel/shell-api/shell/sidebarRegistry'
import SeaView from './SeaView.vue'
import { seaSidebarFilter } from './seaSidebarFilter'
import { registerSeaSettings } from './settings'

/**
 * Registers the SEA section with the shell (route + nav entry).
 *
 * The section's `./register` entry: the shell calls it once at boot, statically
 * in dev and tests and through Module Federation in the built app
 * (docs/plans/section-containers.md §3.6).
 */
export default function register(shell: ShellContext): void {
  assertHostPinia(shell, getActivePinia(), 'sea')

  // Its Settings nav entry and items (F3).
  registerSeaSettings()

  registerSection({
    id: 'sea',
    label: 'SEA',
    navOrder: 30,
    enabledByDefault: false,
    route: { path: '/sea/', component: SeaView },
  })

  // FILTER rail sub-tabs (F2).
  registerSidebarFilterSubTabs('sea', seaSidebarFilter)
}
