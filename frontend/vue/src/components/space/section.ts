import { registerSection } from '@/shell/sectionRegistry'
import { registerSidebarFilterSubTabs, registerSidebarSectionTab } from '@/shell/sidebarRegistry'
import SpaceView from './SpaceView.vue'
import { spaceSidebarFilter } from './spaceSidebarFilter'
import SpacePassesTabIcon from './SpacePassesTabIcon.vue'

/**
 * Registers the SPACE section with the shell (route + nav entry).
 *
 * In-monolith stand-in for the `register(shell)` entry a future `space`
 * Module Federation remote will export (docs/plans/section-containers.md §3.6).
 */
registerSection({
  id: 'space',
  label: 'SPACE',
  navOrder: 20,
  route: { path: '/space/', component: SpaceView },
})

// FILTER rail sub-tabs and the PASSES rail tab (F2).
registerSidebarFilterSubTabs('space', spaceSidebarFilter)
registerSidebarSectionTab({
  id: 'passes',
  label: 'PASSES',
  sectionId: 'space',
  icon: SpacePassesTabIcon,
})
