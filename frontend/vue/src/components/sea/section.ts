import { registerSection } from '@/shell/sectionRegistry'
import { registerSidebarFilterSubTabs } from '@/shell/sidebarRegistry'
import SeaView from './SeaView.vue'
import { seaSidebarFilter } from './seaSidebarFilter'
// Registers this section's Settings nav entry and items (F3).
import './settings'

/**
 * Registers the SEA section with the shell (route + nav entry).
 *
 * In-monolith stand-in for the `register(shell)` entry a future `sea`
 * Module Federation remote will export (docs/plans/section-containers.md §3.6).
 */
registerSection({
  id: 'sea',
  label: 'SEA',
  navOrder: 30,
  route: { path: '/sea/', component: SeaView },
})

// FILTER rail sub-tabs (F2).
registerSidebarFilterSubTabs('sea', seaSidebarFilter)
