import { useNotificationsStore } from '@/stores/notifications'
import { useUserLocation } from '@/composables/useUserLocation'
import { SatellitePassScheduler } from '@/components/space/controls/satellite/SatellitePassScheduler'
import { getAllPassNotifs, updatePassNotifName, isPassNotifEnabled, isAutoTuneEnabled, isRecordOnPassEnabled } from '@/components/space/controls/satellite/passNotifStore'

// App-level background service that drives per-satellite pass alerts for EVERY
// satellite the user has enabled — regardless of which section is active and
// regardless of which satellite is currently selected. Previously only the
// active satellite's notifier ran, and only while the Space section was mounted.
//
// Each enabled satellite gets ONE SatellitePassScheduler, which internally runs
// two independent action tracks off a single fetch loop: a "~5 min before AOS"
// heads-up (when the bell is on) and an AOS auto-tune + LOS restore (when
// auto-tune is on). The two flags are independent, so a scheduler exists when
// EITHER is on, and the tracks read the flags live.
//
// Module-singleton (mirrors useUserLocation). Instantiated and started once from
// App.vue. Reacts to `satellite-pass-notif-changed` and
// `satellite-auto-tune-changed` (toggled from the Space UI) to spin schedulers
// up/down, and `satellite-selected` to refresh the cached display name.

let _started = false
const _schedulers = new Map<string, SatellitePassScheduler>()

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

// Create the scheduler for a satellite if either the bell or auto-tune is on,
// and tear it down once both are off. Idempotent — safe to call on every toggle.
function _syncScheduler(noradId: string, name: string): void {
  const wantBell = isPassNotifEnabled(noradId)
  const wantAutoTune = isAutoTuneEnabled(noradId)
  const existing = _schedulers.get(noradId)

  if (!wantBell && !wantAutoTune) {
    if (existing) { existing.stop(); _schedulers.delete(noradId) }
    return
  }
  if (existing) return // already running; tracks read the flags live

  if (wantAutoTune) _ensureDownlinkCache()
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
    headsUpEnabled: () => isPassNotifEnabled(noradId),
    autoTuneEnabled: () => isAutoTuneEnabled(noradId),
    recordOnPass: () => isRecordOnPassEnabled(noradId),
    getDownlink: () => _getDownlink(noradId),
  })
  _schedulers.set(noradId, sched)
  sched.start()
}

function _onNotifChanged(e: Event): void {
  const { noradId } = (e as CustomEvent<{ noradId: string; enabled: boolean }>).detail
  _syncScheduler(noradId, getAllPassNotifs()[noradId]?.name || noradId)
}

function _onAutoTuneChanged(e: Event): void {
  const { noradId } = (e as CustomEvent<{ noradId: string; enabled: boolean }>).detail
  _syncScheduler(noradId, getAllPassNotifs()[noradId]?.name || noradId)
}

function _onSatSelected(e: Event): void {
  const { noradId, name } = (e as CustomEvent<{ noradId: string; name: string }>).detail
  if (name) updatePassNotifName(noradId, name)
}

function start(): void {
  if (_started) return
  _started = true

  // Spin up a scheduler for each already-enabled satellite (restored from
  // persistence, including the migration of legacy per-key flags). An entry may
  // have the bell on, auto-tune on, or both.
  const enabled = getAllPassNotifs()
  for (const [noradId, entry] of Object.entries(enabled)) {
    _syncScheduler(noradId, entry.name)
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
  _schedulers.clear()
  _started = false
}

export function useSpaceAlertsService() {
  return { start, stop }
}
