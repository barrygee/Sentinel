import { useNotificationsStore } from '@/stores/notifications'
import { useUserLocation } from '@/composables/useUserLocation'
import { SatellitePassScheduler } from '@/components/space/controls/satellite/SatellitePassScheduler'
import { SatelliteAutoTuneScheduler } from '@/components/space/controls/satellite/SatelliteAutoTuneScheduler'
import { getAllPassNotifs, updatePassNotifName, isPassNotifEnabled } from '@/components/space/controls/satellite/passNotifStore'

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
const _autoTuners = new Map<string, SatelliteAutoTuneScheduler>()

// Downlink (freq + mode) per satellite, primed lazily from /api/space/tle/list
// for entries whose cached downlink is missing (e.g. legacy entries enabled
// before the field existed). The cached value on the persisted entry is used
// first; this is only a fallback.
let _downlinkCache: Record<string, { hz: number; mode: string }> | null = null
let _downlinkFetch: Promise<void> | null = null

function _ensureDownlinkCache(): void {
  if (_downlinkCache || _downlinkFetch) return
  _downlinkFetch = (async () => {
    try {
      const resp = await fetch('/api/space/tle/list')
      if (!resp.ok) { _downlinkCache = {}; return }
      const data = await resp.json() as { satellites?: Array<{ norad_id: string; downlink_hz?: number | null; downlink_mode?: string | null }> }
      const map: Record<string, { hz: number; mode: string }> = {}
      for (const s of data.satellites ?? []) {
        if (s.downlink_hz) map[s.norad_id] = { hz: s.downlink_hz, mode: s.downlink_mode || 'NFM' }
      }
      _downlinkCache = map
    } catch { _downlinkCache = {} }
  })()
}

function _getDownlink(noradId: string): { hz: number; mode: string } | null {
  const entry = getAllPassNotifs()[noradId]
  if (entry?.downlinkHz) return { hz: entry.downlinkHz, mode: entry.downlinkMode || 'NFM' }
  return _downlinkCache?.[noradId] ?? null
}

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

function _ensureAutoTuner(noradId: string, name: string): void {
  if (_autoTuners.has(noradId)) return
  _ensureDownlinkCache()
  const notificationsStore = useNotificationsStore()
  const { location } = useUserLocation()
  const sched = new SatelliteAutoTuneScheduler({
    noradId,
    notificationsStore,
    getUserLocation: () => {
      const l = location.value
      return l ? [l.lon, l.lat] : null
    },
    getName: () => getAllPassNotifs()[noradId]?.name || name,
    getDownlink: () => _getDownlink(noradId),
  })
  _autoTuners.set(noradId, sched)
  sched.start()
}

function _removeAutoTuner(noradId: string): void {
  const s = _autoTuners.get(noradId)
  if (s) { s.stop(); _autoTuners.delete(noradId) }
}

function _onNotifChanged(e: Event): void {
  const { noradId, enabled } = (e as CustomEvent<{ noradId: string; enabled: boolean }>).detail
  if (enabled) _ensureScheduler(noradId, getAllPassNotifs()[noradId]?.name || noradId)
  else _removeScheduler(noradId)
}

function _onAutoTuneChanged(e: Event): void {
  const { noradId, enabled } = (e as CustomEvent<{ noradId: string; enabled: boolean }>).detail
  if (enabled) _ensureAutoTuner(noradId, getAllPassNotifs()[noradId]?.name || noradId)
  else _removeAutoTuner(noradId)
}

function _onSatSelected(e: Event): void {
  const { noradId, name } = (e as CustomEvent<{ noradId: string; name: string }>).detail
  if (name) updatePassNotifName(noradId, name)
}

function start(): void {
  if (_started) return
  _started = true

  // Spin up the right scheduler(s) for each already-enabled satellite (restored
  // from persistence, including the migration of legacy per-key flags). An entry
  // may have the bell on, auto-tune on, or both.
  const enabled = getAllPassNotifs()
  for (const [noradId, entry] of Object.entries(enabled)) {
    if (isPassNotifEnabled(noradId)) _ensureScheduler(noradId, entry.name)
    if (entry.autoTune) _ensureAutoTuner(noradId, entry.name)
  }

  document.addEventListener('satellite-pass-notif-changed', _onNotifChanged)
  document.addEventListener('satellite-auto-tune-changed', _onAutoTuneChanged)
  document.addEventListener('satellite-selected', _onSatSelected)
}

function stop(): void {
  document.removeEventListener('satellite-pass-notif-changed', _onNotifChanged)
  document.removeEventListener('satellite-auto-tune-changed', _onAutoTuneChanged)
  document.removeEventListener('satellite-selected', _onSatSelected)
  for (const s of _schedulers.values()) s.stop()
  for (const s of _autoTuners.values()) s.stop()
  _schedulers.clear()
  _autoTuners.clear()
  _started = false
}

export function useSpaceAlertsService() {
  return { start, stop }
}
