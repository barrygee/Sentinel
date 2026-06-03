import { useNotificationsStore } from '@/stores/notifications'
import { useUserLocation } from '@/composables/useUserLocation'
import { SatellitePassScheduler } from '@/components/space/controls/satellite/SatellitePassScheduler'
import { getAllPassNotifs, updatePassNotifName } from '@/components/space/controls/satellite/passNotifStore'

// App-level background service that fires "~10 min before next pass" alerts for
// EVERY satellite the user has enabled pass notifications on — regardless of
// which section is active and regardless of which satellite is currently
// selected. Previously only the active satellite's notifier ran, and only while
// the Space section was mounted.
//
// Module-singleton (mirrors useUserLocation). Instantiated and started once from
// App.vue. Reacts to the `satellite-pass-notif-changed` event (toggled from the
// Space UI) to spin schedulers up/down, and `satellite-selected` to refresh the
// cached display name.

let _started = false
const _schedulers = new Map<string, SatellitePassScheduler>()

function _ensureScheduler(noradId: string, name: string): void {
  if (_schedulers.has(noradId)) return
  const notificationsStore = useNotificationsStore()
  const { location } = useUserLocation()
  const sched = new SatellitePassScheduler({
    noradId,
    notificationsStore,
    getUserLocation: () => {
      const l = location.value
      return l ? [l.lon, l.lat] : null
    },
    getName: () => getAllPassNotifs()[noradId]?.name || name,
  })
  _schedulers.set(noradId, sched)
  sched.start()
}

function _removeScheduler(noradId: string): void {
  const s = _schedulers.get(noradId)
  if (s) { s.stop(); _schedulers.delete(noradId) }
}

function _onNotifChanged(e: Event): void {
  const { noradId, enabled } = (e as CustomEvent<{ noradId: string; enabled: boolean }>).detail
  if (enabled) _ensureScheduler(noradId, getAllPassNotifs()[noradId]?.name || noradId)
  else _removeScheduler(noradId)
}

function _onSatSelected(e: Event): void {
  const { noradId, name } = (e as CustomEvent<{ noradId: string; name: string }>).detail
  if (name) updatePassNotifName(noradId, name)
}

function start(): void {
  if (_started) return
  _started = true

  // Spin up a scheduler for each already-enabled satellite (restored from
  // persistence, including the migration of legacy per-key flags).
  const enabled = getAllPassNotifs()
  for (const [noradId, entry] of Object.entries(enabled)) {
    _ensureScheduler(noradId, entry.name)
  }

  document.addEventListener('satellite-pass-notif-changed', _onNotifChanged)
  document.addEventListener('satellite-selected', _onSatSelected)
}

function stop(): void {
  document.removeEventListener('satellite-pass-notif-changed', _onNotifChanged)
  document.removeEventListener('satellite-selected', _onSatSelected)
  for (const s of _schedulers.values()) s.stop()
  _schedulers.clear()
  _started = false
}

export function useSpaceAlertsService() {
  return { start, stop }
}
