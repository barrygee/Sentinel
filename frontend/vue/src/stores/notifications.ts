import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type NotificationType =
  | 'flight' | 'departure' | 'track' | 'untrack' | 'tracking'
  | 'notif-off' | 'system' | 'message' | 'emergency' | 'squawk-clr'

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
}

export interface AddOptions {
  type?: NotificationType
  title: string
  detail?: string
  action?: NotificationAction
  clickAction?: () => void
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
  } catch { return [] }
}

function _save(items: NotificationItem[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items.map(i => ({ ...i, action: undefined, clickAction: undefined })))) } catch {}
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
      flight: 'LANDED', departure: 'DEPARTED', track: 'TRACKING',
      untrack: 'UNTRACKED', tracking: 'NOTIFICATIONS ON', 'notif-off': 'NOTIFICATIONS OFF',
      system: 'SYSTEM', message: 'MESSAGE', emergency: '⚠ EMERGENCY', 'squawk-clr': 'SQUAWK CLEARED',
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
    }
    items.value.unshift(item)
    _save(items.value)

    fetch('/api/air/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_id: item.id, type: item.type, title: item.title, detail: item.detail, ts: item.ts }),
    }).catch(() => {})

    if (!panelOpen.value) {
      unreadCount.value++
      _startBellPulse()
    }
    return item.id
  }

  function update(opts: UpdateOptions): void {
    const item = items.value.find(i => i.id === opts.id)
    if (!item) return
    if (opts.type !== undefined) item.type = opts.type
    if (opts.title !== undefined) item.title = opts.title
    if (opts.detail !== undefined) item.detail = opts.detail
    if (opts.action !== undefined) item.action = opts.action ?? undefined
    _save(items.value)
  }

  function dismiss(id: string): void {
    items.value = items.value.filter(i => i.id !== id)
    _save(items.value)
    fetch(`/api/air/messages/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
  }

  function clearAll(): void {
    // Keep items that have an action (active tracking notifications)
    const toKeep = items.value.filter(i => !!i.action || i.type === 'tracking')
    const toRemove = items.value.filter(i => !i.action && i.type !== 'tracking')
    toRemove.forEach(i => {
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
    panelOpen.value ? closePanel() : openPanel()
  }

  // Sync from backend on init
  async function syncFromBackend(): Promise<void> {
    try {
      const res = await fetch('/api/air/messages')
      if (!res.ok) return
      const rows = await res.json() as Array<{ msg_id: string; type: string; title: string; detail: string; ts: number }>
      if (!Array.isArray(rows) || !rows.length) return
      const fromBackend: NotificationItem[] = rows.map(r => ({
        id: r.msg_id, type: r.type as NotificationType,
        title: r.title, detail: r.detail ?? '', ts: r.ts,
      }))
      const backendIds = new Set(fromBackend.map(i => i.id))
      const localOnly = items.value.filter(i => !backendIds.has(i.id))
      items.value = [...fromBackend, ...localOnly].sort((a, b) => a.ts - b.ts)
      _save(items.value)
    } catch {}
  }

  function _startBellPulse(): void {
    if (_bellTimer) return
    _bellTimer = setInterval(() => {
      if (panelOpen.value) { _stopBellPulse(); return }
    }, 15000)
  }

  function _stopBellPulse(): void {
    if (_bellTimer) { clearInterval(_bellTimer); _bellTimer = null }
  }

  return {
    items, panelOpen, unreadCount, visible, total,
    getLabelForType, add, update, dismiss, clearAll,
    openPanel, closePanel, togglePanel, syncFromBackend,
  }
})
