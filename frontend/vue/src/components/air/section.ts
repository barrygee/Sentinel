import { registerBackgroundService } from '@/shell/backgroundServices'
import { registerNotificationTarget } from '@/shell/notificationRegistry'
import { registerSection } from '@/shell/sectionRegistry'
import { registerSidebarFilterSubTabs } from '@/shell/sidebarRegistry'
import AirView from './AirView.vue'
import { airSidebarFilter } from './airSidebarFilter'
import { useAirAlertsService } from '@/composables/useAirAlertsService'
import { aircraftNotificationTarget } from './aircraftNotificationTarget'

/**
 * Registers the AIR section with the shell: route + nav entry, the click
 * target for aircraft alerts, and the aircraft/overhead alert service that
 * runs whichever section is showing.
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
registerNotificationTarget(aircraftNotificationTarget)
registerBackgroundService({ id: 'air-alerts', start: () => useAirAlertsService().start() })
