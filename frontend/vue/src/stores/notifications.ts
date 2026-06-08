import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { playNotificationSound } from '../composables/useNotificationSound'
import { useAppStore } from './app'

export type NotificationType =
  | 'flight'
  | 'departure'
  | 'track'
  | 'untrack'
  | 'tracking'
  | 'autotune'
  | 'notif-off'
  | 'system'
  | 'message'
  | 'emergency'
  | 'squawk-clr'
  | 'overhead'

export interface NotificationAction {
  label: string
  callback: () => void
}

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  detail: string
  ts: number
  action?: NotificationAction
  clickAction?: () => void
  hex?: string
  // For autotune notifications: the satellite this card controls. Closing the
  // card cancels auto-tune for this NORAD id. Also used to focus the satellite
  // on the space map when the alert is clicked.
  noradId?: string
  // Clean satellite display name for click-to-focus (the title may be decorated,
  // e.g. "GOMX-1 PASS"). Falls back to title/noradId when absent.
  satName?: string
}

export interface AddOptions {
  type?: NotificationType
  title: string
  detail?: string
  action?: NotificationAction
  clickAction?: () => void
  hex?: string
  noradId?: string
  satName?: string
}

export interface UpdateOptions {
  id: string
  type?: NotificationType
  title?: string
  detail?: string
  action?: NotificationAction | null
}

const LS_KEY = 'notifications'

function _load(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as NotificationItem[]) : []
  } catch {
    return []
  }
}

function _save(items: NotificationItem[]): void {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify(items.map((i) => ({ ...i, action: undefined, clickAction: undefined }))),
    )
  } catch {}
}

let _aircraftClickHandler: ((hex: string) => void) | null = null
export function registerAircraftClickHandler(fn: (hex: string) => void): void {
  _aircraftClickHandler = fn
  if (_pendingAircraftTarget) {
    const hex = _pendingAircraftTarget
    _pendingAircraftTarget = null
    fn(hex)
  }
}
export function getAircraftClickHandler(): ((hex: string) => void) | null {
  return _aircraftClickHandler
}

// Satellite click handler — registered by SpaceMap while it is mounted. Clicking
// a satellite alert focuses/tracks that satellite on the space map. Mirrors the
// aircraft handler above.
let _satelliteClickHandler: ((noradId: string, name: string) => void) | null = null
export function registerSatelliteClickHandler(fn: (noradId: string, name: string) => void): void {
  _satelliteClickHandler = fn
  if (_pendingSatelliteTarget) {
    const { noradId, name } = _pendingSatelliteTarget
    _pendingSatelliteTarget = null
    fn(noradId, name)
  }
}
export function getSatelliteClickHandler(): ((noradId: string, name: string) => void) | null {
  return _satelliteClickHandler
}
// Cleared when SpaceMap unmounts so a sat alert clicked from another section
// routes to Space (rather than calling a stale, torn-down handler).
export function clearSatelliteClickHandler(): void {
  _satelliteClickHandler = null
}

// When an alert is clicked from another section, the target map isn't mounted
// yet (so no handler is registered). The panel routes to the right section and
// stashes the target here; the map drains it on registration (see above).
let _pendingAircraftTarget: string | null = null
let _pendingSatelliteTarget: { noradId: string; name: string } | null = null
export function setPendingAircraftTarget(hex: string): void {
  _pendingAircraftTarget = hex
}
export function setPendingSatelliteTarget(noradId: string, name: string): void {
  _pendingSatelliteTarget = { noradId, name }
}

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<NotificationItem[]>(_load())
  const panelOpen = ref(false)
  const unreadCount = ref(0)
  let _bellTimer: ReturnType<typeof setInterval> | null = null

  const visible = computed(() => [...items.value].sort((a, b) => b.ts - a.ts))
  const total = computed(() => items.value.length)

  function getLabelForType(type: string): string {
    const map: Record<string, string> = {
      flight: 'LANDED',
      departure: 'DEPARTED',
      track: 'TRACKING',
      untrack: 'UNTRACKED',
      tracking: 'NOTIFICATIONS ON',
      autotune: 'AUTOTUNE',
      'notif-off': 'NOTIFICATIONS OFF',
      system: 'SYSTEM',
      message: 'MESSAGE',
      emergency: '⚠ EMERGENCY',
      'squawk-clr': 'SQUAWK CLEARED',
      overhead: 'OVERHEAD NOTIFICATION',
    }
    return map[type] ?? 'NOTICE'
  }

  function add(opts: AddOptions): string {
    const item: NotificationItem = {
      id: `${opts.type ?? 'system'}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: opts.type ?? 'system',
      title: opts.title,
      detail: opts.detail ?? '',
      ts: Date.now(),
      action: opts.action,
      clickAction: opts.clickAction,
      hex: opts.hex,
      noradId: opts.noradId,
      satName: opts.satName,
    }
    items.value.unshift(item)
    _save(items.value)

    if (useAppStore().notificationSound) playNotificationSound(item.type === 'emergency')

    fetch('/api/air/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_id: item.id,
        type: item.type,
        title: item.title,
        detail: item.detail,
        ts: item.ts,
      }),
    }).catch(() => {})

    if (!panelOpen.value) {
      unreadCount.value++
      _startBellPulse()
    }
    return item.id
  }

  function update(opts: UpdateOptions): void {
    const idx = items.value.findIndex((i) => i.id === opts.id)
    if (idx === -1) return
    const prev = items.value[idx]
    const next: NotificationItem = {
      ...prev,
      type: opts.type !== undefined ? opts.type : prev.type,
      title: opts.title !== undefined ? opts.title : prev.title,
      detail: opts.detail !== undefined ? opts.detail : prev.detail,
      action: opts.action !== undefined ? (opts.action ?? undefined) : prev.action,
    }
    items.value.splice(idx, 1, next)
    _save(items.value)
  }

  function dismiss(id: string): void {
    items.value = items.value.filter((i) => i.id !== id)
    _save(items.value)
    fetch(`/api/air/messages/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
  }

  function clearAll(): void {
    // Keep items that have an action (active tracking notifications)
    const toKeep = items.value.filter((i) => !!i.action || i.type === 'tracking')
    const toRemove = items.value.filter((i) => !i.action && i.type !== 'tracking')
    toRemove.forEach((i) => {
      fetch(`/api/air/messages/${encodeURIComponent(i.id)}`, { method: 'DELETE' }).catch(() => {})
    })
    items.value = toKeep
    _save(items.value)
    unreadCount.value = 0
    if (!toKeep.length) _stopBellPulse()
  }

  function openPanel(): void {
    panelOpen.value = true
    unreadCount.value = 0
    _stopBellPulse()
  }

  function closePanel(): void {
    panelOpen.value = false
  }

  function togglePanel(): void {
    if (panelOpen.value) closePanel()
    else openPanel()
  }

  // Sync from backend on init
  async function syncFromBackend(): Promise<void> {
    try {
      const res = await fetch('/api/air/messages')
      if (!res.ok) return
      const rows = (await res.json()) as Array<{
        msg_id: string
        type: string
        title: string
        detail: string
        ts: number
      }>
      if (!Array.isArray(rows) || !rows.length) return
      const localById = new Map(items.value.map((i) => [i.id, i]))
      const fromBackend: NotificationItem[] = rows
        .filter((r) => r.type !== 'tracking' && r.type !== 'track' && r.type !== 'autotune')
        .map((r) => {
          const prev = localById.get(r.msg_id)
          return {
            id: r.msg_id,
            type: r.type as NotificationType,
            title: r.title,
            detail: r.detail ?? '',
            ts: r.ts,
            hex: prev?.hex,
            clickAction: prev?.clickAction,
            action: prev?.action,
          }
        })
      const backendIds = new Set(fromBackend.map((i) => i.id))
      const localOnly = items.value.filter((i) => !backendIds.has(i.id))
      items.value = [...fromBackend, ...localOnly].sort((a, b) => a.ts - b.ts)
      _save(items.value)
    } catch {}
  }

  function _startBellPulse(): void {
    if (_bellTimer) return
    _bellTimer = setInterval(() => {
      if (panelOpen.value) {
        _stopBellPulse()
        return
      }
    }, 15000)
  }

  function _stopBellPulse(): void {
    if (_bellTimer) {
      clearInterval(_bellTimer)
      _bellTimer = null
    }
  }

  return {
    items,
    panelOpen,
    unreadCount,
    visible,
    total,
    getLabelForType,
    add,
    update,
    dismiss,
    clearAll,
    openPanel,
    closePanel,
    togglePanel,
    syncFromBackend,
  }
})
