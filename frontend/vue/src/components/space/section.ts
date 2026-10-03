import { registerBackgroundService } from '@/shell/backgroundServices'
import {
  registerNotificationDismissHook,
  registerNotificationTarget,
} from '@/shell/notificationRegistry'
import { registerSection } from '@/shell/sectionRegistry'
import { useSpaceAlertsService } from '@/composables/useSpaceAlertsService'
import SpaceView from './SpaceView.vue'
import { cancelAutoTuneOnDismiss, satelliteNotificationTarget } from './satelliteNotificationTarget'

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

registerNotificationTarget(satelliteNotificationTarget)
registerNotificationDismissHook('autotune', cancelAutoTuneOnDismiss)
registerBackgroundService({ id: 'space-alerts', start: () => useSpaceAlertsService().start() })
