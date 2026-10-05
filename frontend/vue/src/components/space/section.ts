import { registerBackgroundService } from '@sentinel/shell-api/shell/backgroundServices'
import {
  registerNotificationDismissHook,
  registerNotificationSubscriptionSource,
  registerNotificationTarget,
} from '@sentinel/shell-api/shell/notificationRegistry'
import { registerSection } from '@sentinel/shell-api/shell/sectionRegistry'
import {
  registerSidebarFilterSubTabs,
  registerSidebarSectionTab,
} from '@sentinel/shell-api/shell/sidebarRegistry'
import SpaceView from './SpaceView.vue'
import { spaceSidebarFilter } from './spaceSidebarFilter'
import SpacePassesTabIcon from './SpacePassesTabIcon.vue'
import { useSpaceAlertsService } from '@/composables/useSpaceAlertsService'
import { cancelAutoTuneOnDismiss, satelliteNotificationTarget } from './satelliteNotificationTarget'
import { satellitePassSubscriptions } from './satelliteNotificationSubscriptions'
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
  enabledByDefault: true,
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
// Its pass bells, listed and cancelled in Settings › Alerts.
registerNotificationSubscriptionSource(satellitePassSubscriptions)
registerBackgroundService({ id: 'space-alerts', start: () => useSpaceAlertsService().start() })
