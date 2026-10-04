import { registerBackgroundService } from '@/shell/backgroundServices'
import {
  registerNotificationDismissHook,
  registerNotificationTarget,
} from '@/shell/notificationRegistry'
import { registerSection } from '@/shell/sectionRegistry'
import { registerSidebarFilterSubTabs, registerSidebarSectionTab } from '@/shell/sidebarRegistry'
import SpaceView from './SpaceView.vue'
import { spaceSidebarFilter } from './spaceSidebarFilter'
import SpacePassesTabIcon from './SpacePassesTabIcon.vue'
import { useSpaceAlertsService } from '@/composables/useSpaceAlertsService'
import { cancelAutoTuneOnDismiss, satelliteNotificationTarget } from './satelliteNotificationTarget'
// Registers this section's Settings nav entry and items (F3).
import './settings'

/**
 * Registers the SPACE section with the shell: route + nav entry, the click
 * target for satellite alerts, cancel-auto-tune when an auto-tune card is
 * closed, and the satellite pass alert service that runs whichever section is
 * showing.
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
registerNotificationTarget(satelliteNotificationTarget)
registerNotificationDismissHook('autotune', cancelAutoTuneOnDismiss)
registerBackgroundService({ id: 'space-alerts', start: () => useSpaceAlertsService().start() })
