import { registerBackgroundService } from '@sentinel/shell-api/shell/backgroundServices'
import {
  registerNotificationSubscriptionSource,
  registerNotificationTarget,
} from '@sentinel/shell-api/shell/notificationRegistry'
import { registerSection } from '@sentinel/shell-api/shell/sectionRegistry'
import { registerSettingsHydrator } from '@sentinel/shell-api/shell/settingsHydration'
import { registerSidebarFilterSubTabs } from '@sentinel/shell-api/shell/sidebarRegistry'
import AirView from './AirView.vue'
import { airSidebarFilter } from './airSidebarFilter'
import { useAirAlertsService } from './composables/useAirAlertsService'
import { aircraftNotificationTarget } from './aircraftNotificationTarget'
import {
  aircraftBellSubscriptions,
  overheadAlertSubscriptions,
} from './airNotificationSubscriptions'
import { registerAirSettings } from './settings'
import { hydrateAirFromSettings } from './airSettingsHydration'

/**
 * Registers the AIR section with the shell: route + nav entry, the click
 * target for aircraft alerts, and the aircraft/overhead alert service that
 * runs whichever section is showing.
 *
 * The section's `./register` entry: the shell calls it once at boot, statically
 * in dev and tests and through Module Federation in the built app
 * (docs/plans/section-containers.md §3.6).
 */
export default function register(): void {
  // Its Settings nav entry and items (F3).
  registerAirSettings()

  registerSection({
    id: 'air',
    label: 'AIR',
    navOrder: 10,
    enabledByDefault: true,
    route: { path: '/air/', component: AirView },
  })

  // FILTER rail sub-tabs (F2).
  registerSidebarFilterSubTabs('air', airSidebarFilter)
  registerNotificationTarget(aircraftNotificationTarget)
  // Its switched-on alerts, listed and cancelled in Settings › Alerts.
  registerNotificationSubscriptionSource(aircraftBellSubscriptions)
  registerNotificationSubscriptionSource(overheadAlertSubscriptions)
  registerBackgroundService({ id: 'air-alerts', start: () => useAirAlertsService().start() })

  // Applies its stored settings to its stores at boot, before the first render (F1).
  registerSettingsHydrator('air', hydrateAirFromSettings)
}
