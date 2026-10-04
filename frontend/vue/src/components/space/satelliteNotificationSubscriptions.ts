import {
  getAllPassNotifs,
  isPassNotifEnabled,
  setPassNotifEnabled,
} from './controls/satellite/passNotifStore'
import type { NotificationSubscriptionSource } from '@/shell/notificationRegistry'

/**
 * Space's switched-on alerts for Settings › Alerts (moved out of the core
 * `useNotificationSubscriptions`): the satellite pass bells. Satellite
 * auto-tune is deliberately not listed — it tunes a radio rather than notifying.
 *
 * The pass store is plain localStorage, not reactive; the Alerts card re-reads
 * every source on `refresh()`.
 */
export const satellitePassSubscriptions: NotificationSubscriptionSource = {
  kind: 'satellite',
  order: 20,
  list: () =>
    Object.entries(getAllPassNotifs())
      .filter(([noradId]) => isPassNotifEnabled(noradId))
      .map(([noradId, entry]) => ({ id: noradId, label: `${entry.name || noradId} — pass alert` })),
  turnOff(noradIds) {
    for (const noradId of noradIds) setPassNotifEnabled(noradId, false)
  },
}
