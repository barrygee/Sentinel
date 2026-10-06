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

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<NotificationItem[]>(_load())
  const panelOpen = ref(false)
  const unreadCount = ref(0)
  let _bellTimer: ReturnType<typeof setInterval> | null = null

  const visible = computed(() => [...items.value].sort((a, b) => b.ts - a.ts))
  const total = computed(() => items.value.length)

  // Drives the app-level screen-reader announcer (App.vue): `add()` sets this so
  // each NEW notification is spoken (WCAG 4.1.3 Status Messages). `seq` makes the
  // object identity change on every add so the watcher fires even for repeated
  // text; `assertive` routes urgent (emergency) alerts to the assertive region.
  // Reloaded-from-storage items never pass through `add()`, so they aren't spoken.
  const liveAnnouncement = ref<{ message: string; assertive: boolean; seq: number } | null>(null)
  let _announceSeq = 0

  function getLabelForType(type: string): string {
    const map: Record<string, string> = {
      flight: 'LANDED',
      departure: 'DEPARTED',
      track: 'TRACKING',
      untrack: 'UNTRACKED',
      tracking: 'ALERTS ON',
      autotune: 'AUTOTUNE',
      'notif-off': 'ALERTS OFF',
      system: 'SYSTEM',
      message: 'MESSAGE',
      emergency: '⚠ EMERGENCY',
      'squawk-clr': 'SQUAWK CLEARED',
      overhead: 'OVERHEAD ALERT',
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

    _announceSeq += 1
    liveAnnouncement.value = {
      message: item.detail ? `${item.title}. ${item.detail}` : item.title,
      assertive: item.type === 'emergency',
      seq: _announceSeq,
    }

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

  /**
   * Empty the received alerts.
   *
   * By default cards holding a live action are kept — that action is the bell
   * that turns an active subscription off, and the panel's CLEAR must not take
   * away the only way to do so. Settings' CANCEL ALL ALERTS switches every
   * subscription off first, so it passes `keepActionCards: false`: the bells
   * would only control subscriptions that no longer exist.
   */
  function clearAll({ keepActionCards = true }: { keepActionCards?: boolean } = {}): void {
    // Don't keep by type: satellite pass heads-ups are also typed 'tracking'
    // but are one-shot alerts, and keeping them meant CLEAR left the list full.
    const shouldKeep = (item: NotificationItem): boolean => keepActionCards && !!item.action
    const toKeep = items.value.filter(shouldKeep)
    const toRemove = items.value.filter((item) => !shouldKeep(item))
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
    liveAnnouncement,
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
