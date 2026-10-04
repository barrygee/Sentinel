import { useAirNotifStore } from '@/stores/airNotif'
import { useAirStore } from '@/stores/air'
import { useOverheadAlertZones } from '@/composables/useOverheadAlertZones'
import * as settingsApi from '@/services/settingsApi'
import type { NotificationSubscriptionSource } from '@/shell/notificationRegistry'

/**
 * Air's switched-on alerts for Settings › Alerts (moved out of the core
 * `useNotificationSubscriptions`): the per-aircraft landing/departure bells,
 * and the per-location overhead-aircraft alerts.
 */
export const aircraftBellSubscriptions: NotificationSubscriptionSource = {
  kind: 'aircraft',
  order: 10,
  list() {
    const airNotifStore = useAirNotifStore()
    return [...airNotifStore.enabledHexes].map((hex) => ({
      id: hex,
      label: `${airNotifStore.callsignFor(hex)} — landing & departure`,
    }))
  },
  turnOff(hexes) {
    const airNotifStore = useAirNotifStore()
    for (const hex of hexes) airNotifStore.disable(hex)
  },
}

/** Built once, on first use — Pinia is installed by then, unlike at import. */
let overheadZones: ReturnType<typeof useOverheadAlertZones> | null = null
function overheadAlertZones(): ReturnType<typeof useOverheadAlertZones> {
  overheadZones ??= useOverheadAlertZones()
  return overheadZones
}

/** Test seam: drop the cached zones so a spec's fresh Pinia is used. */
export function resetAirNotificationSubscriptionsForTests(): void {
  overheadZones = null
}

/** Ordered after Space's pass bells (order 20), as the Alerts card always listed them. */
export const overheadAlertSubscriptions: NotificationSubscriptionSource = {
  kind: 'overhead',
  order: 30,
  list() {
    return overheadAlertZones().locations.value.flatMap((location) => {
      const place = location.isUser ? 'Sentinel location' : `Sentry: ${location.label}`
      return [
        ...(location.civil
          ? [{ id: `${location.id}:civil`, label: `${place} — civil aircraft overhead` }]
          : []),
        ...(location.mil
          ? [{ id: `${location.id}:mil`, label: `${place} — military aircraft overhead` }]
          : []),
      ]
    })
  },
  /** The overhead alerts live in the config database; this browser may not have them yet. */
  refresh() {
    void useAirStore().loadOverheadAlertsFromConfig()
  },
  /**
   * Switched off locally, then written to the backend (`air.overheadAlerts`) so
   * they stay off after a reload and on other browsers.
   */
  async turnOff(ids) {
    const airStore = useAirStore()
    let changed = false
    for (const id of ids) {
      // The location id can itself contain a colon (`sentry:3`), so the flag is the last part.
      const separator = id.lastIndexOf(':')
      const flag = id.slice(separator + 1)
      if (flag === 'civil' || flag === 'mil') {
        airStore.setOverheadAlert(id.slice(0, separator), { [flag]: false })
        changed = true
      }
    }
    if (changed) await settingsApi.put('air', 'overheadAlerts', airStore.overheadAlerts)
  },
}
