import { registerSection } from '@/shell/sectionRegistry'
import { registerSidebarFilterSubTabs } from '@/shell/sidebarRegistry'
import AirView from './AirView.vue'
import { airSidebarFilter } from './airSidebarFilter'

/**
 * Registers the AIR section with the shell (route + nav entry).
 *
 * This is the in-monolith stand-in for the `register(shell)` entry a future
 * `air` Module Federation remote will export (docs/plans/section-containers.md
 * §3.6) — importing it (via `shell/sections.ts`) has the same effect as
 * calling `register()` would.
 */
registerSection({
  id: 'air',
  label: 'AIR',
  navOrder: 10,
  route: { path: '/air/', component: AirView },
})

// FILTER rail sub-tabs (F2).
registerSidebarFilterSubTabs('air', airSidebarFilter)
