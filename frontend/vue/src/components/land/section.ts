import { registerSection } from '@/shell/sectionRegistry'
import { registerSidebarFilterSubTabs } from '@/shell/sidebarRegistry'
import LandView from './LandView.vue'
import { landSidebarFilter } from './landSidebarFilter'

/**
 * Registers the LAND section with the shell (route + nav entry).
 *
 * In-monolith stand-in for the `register(shell)` entry a future `land`
 * Module Federation remote will export (docs/plans/section-containers.md §3.6).
 */
registerSection({
  id: 'land',
  label: 'LAND',
  navOrder: 40,
  route: { path: '/land/', component: LandView },
})

// FILTER rail sub-tabs (F2).
registerSidebarFilterSubTabs('land', landSidebarFilter)
