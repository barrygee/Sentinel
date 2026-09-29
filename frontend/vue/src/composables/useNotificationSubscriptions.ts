import { computed, ref, type ComputedRef } from 'vue'
import { useAirNotifStore } from '@/stores/airNotif'
import { useAirStore } from '@/stores/air'
import {
  getAllPassNotifs,
  isPassNotifEnabled,
  setPassNotifEnabled,
} from '@/components/space/controls/satellite/passNotifStore'
import { useOverheadAlertZones } from '@/composables/useOverheadAlertZones'
import * as settingsApi from '@/services/settingsApi'

/** One thing the app is currently set to notify the operator about. */
export interface NotificationSubscription {
  /** Stable across refreshes, e.g. `aircraft:4ca7b1`, `satellite:25544`, `overhead:user:civil`. */
  key: string
  /** What the operator reads, e.g. "BAW123 — landing & departure". */
  label: string
}

/**
 * Every notification the operator has switched on, gathered from the three
 * places they are switched on: the aircraft bell (landing/departure), the
 * satellite pass bell, and the per-location overhead-aircraft alerts.
 *
 * The satellite pass store is plain localStorage, not reactive, so the list is
 * re-read with `refresh()` (e.g. whenever the Settings panel opens), which also
 * loads the overhead alerts from the config database — this browser may not
 * have them yet. Satellite auto-tune is deliberately not listed: it tunes a
 * radio rather than notifying.
 */
export function useNotificationSubscriptions(): {
  subscriptions: ComputedRef<NotificationSubscription[]>
  refresh: () => void
  turnOff: (keys: Iterable<string>) => Promise<void>
} {
  const airNotifStore = useAirNotifStore()
  const airStore = useAirStore()
  const { locations: overheadLocations } = useOverheadAlertZones()
  /** Bumped by `refresh()` so the non-reactive satellite list is re-read. */
  const passNotifVersion = ref(0)

  const subscriptions = computed<NotificationSubscription[]>(() => {
    void passNotifVersion.value
    const aircraft = [...airNotifStore.enabledHexes].map((hex) => ({
      key: `aircraft:${hex}`,
      label: `${airNotifStore.callsignFor(hex)} — landing & departure`,
    }))
    const satellites = Object.entries(getAllPassNotifs())
      .filter(([noradId]) => isPassNotifEnabled(noradId))
      .map(([noradId, entry]) => ({
        key: `satellite:${noradId}`,
        label: `${entry.name || noradId} — pass alert`,
      }))
    const overhead = overheadLocations.value.flatMap((location) => {
      const place = location.isUser ? 'Sentinel location' : `Sentry: ${location.label}`
      return [
        ...(location.civil
          ? [{ key: `overhead:${location.id}:civil`, label: `${place} — civil aircraft overhead` }]
          : []),
        ...(location.mil
          ? [{ key: `overhead:${location.id}:mil`, label: `${place} — military aircraft overhead` }]
          : []),
      ]
    })
    return [...aircraft, ...satellites, ...overhead]
  })

  /** Re-read the satellite bells, and the overhead alerts from the config database. */
  function refresh(): void {
    passNotifVersion.value += 1
    void airStore.loadOverheadAlertsFromConfig()
  }

  /**
   * Switch off the given subscriptions. Overhead alerts are also written to the
   * backend (`air.overheadAlerts`) so they stay off after the page reloads and
   * on other browsers; the bells are per-browser and live in localStorage.
   */
  async function turnOff(keys: Iterable<string>): Promise<void> {
    let overheadChanged = false
    for (const key of keys) {
      const [kind, ...rest] = key.split(':')
      if (kind === 'aircraft') {
        airNotifStore.disable(rest.join(':'))
      } else if (kind === 'satellite') {
        setPassNotifEnabled(rest.join(':'), false)
      } else if (kind === 'overhead') {
        // The location id can itself contain a colon (`sentry:3`), so the flag is the last part.
        const flag = rest.pop()
        if (flag === 'civil' || flag === 'mil') {
          airStore.setOverheadAlert(rest.join(':'), { [flag]: false })
          overheadChanged = true
        }
      }
    }
    refresh()
    if (overheadChanged) await settingsApi.put('air', 'overheadAlerts', airStore.overheadAlerts)
  }

  return { subscriptions, refresh, turnOff }
}
