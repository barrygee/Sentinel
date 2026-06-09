import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// Persisted source of truth for the per-aircraft landing/departure notification
// opt-in (the "bell" toggle). Previously this lived as an in-memory Set on
// AdsbLiveControl, which meant opt-ins were lost the moment the user navigated
// away from the Air section. Hoisting it into a persisted store lets both the
// in-map control, the search/filter UI, and the app-level background alerts
// service share one source of truth that survives navigation and reloads.

const LS_HEXES_KEY = 'air_notif_enabled_hexes'
const LS_CALLSIGNS_KEY = 'air_notif_callsigns'

function _loadHexes(): string[] {
  try {
    const raw = localStorage.getItem(LS_HEXES_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((h): h is string => typeof h === 'string') : []
  } catch {
    return []
  }
}

function _loadCallsigns(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_CALLSIGNS_KEY)
    const obj = raw ? (JSON.parse(raw) as unknown) : {}
    return obj && typeof obj === 'object' && !Array.isArray(obj)
      ? (obj as Record<string, string>)
      : {}
  } catch {
    return {}
  }
}

export const useAirNotifStore = defineStore('airNotif', () => {
  const enabledHexes = ref<Set<string>>(new Set(_loadHexes()))
  // Cache the last-known callsign per hex so a notification/UI still has a
  // title even when the aircraft is momentarily absent from the feed.
  const callsigns = ref<Record<string, string>>(_loadCallsigns())

  const count = computed(() => enabledHexes.value.size)

  function _saveHexes(): void {
    try {
      localStorage.setItem(LS_HEXES_KEY, JSON.stringify([...enabledHexes.value]))
    } catch {}
  }
  function _saveCallsigns(): void {
    try {
      localStorage.setItem(LS_CALLSIGNS_KEY, JSON.stringify(callsigns.value))
    } catch {}
  }

  function isEnabled(hex: string): boolean {
    return enabledHexes.value.has(hex)
  }

  function callsignFor(hex: string): string {
    return callsigns.value[hex] || hex
  }

  function enable(hex: string, callsign?: string): void {
    if (callsign && callsign !== hex) {
      callsigns.value = { ...callsigns.value, [hex]: callsign }
      _saveCallsigns()
    }
    if (enabledHexes.value.has(hex)) return
    const next = new Set(enabledHexes.value)
    next.add(hex)
    enabledHexes.value = next
    _saveHexes()
  }

  function disable(hex: string): void {
    if (!enabledHexes.value.has(hex)) return
    const next = new Set(enabledHexes.value)
    next.delete(hex)
    enabledHexes.value = next
    _saveHexes()
  }

  function clear(): void {
    if (enabledHexes.value.size === 0) return
    enabledHexes.value = new Set()
    _saveHexes()
  }

  return { enabledHexes, callsigns, count, isEnabled, callsignFor, enable, disable, clear }
})

// Thin Set-like adapter so existing call sites that use `.has/.add/.delete` on a
// plain Set can delegate to the store with minimal churn. `add` accepts an
// optional callsign to seed the title cache.
export interface NotifEnabledAdapter {
  has(hex: string): boolean
  add(hex: string, callsign?: string): void
  delete(hex: string): void
}

export function createNotifEnabledAdapter(
  store: ReturnType<typeof useAirNotifStore>,
): NotifEnabledAdapter {
  return {
    has: (hex) => store.isEnabled(hex),
    add: (hex, callsign) => store.enable(hex, callsign),
    delete: (hex) => store.disable(hex),
  }
}
