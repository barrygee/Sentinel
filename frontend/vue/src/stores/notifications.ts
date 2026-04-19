import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Notification {
  id: string
  type: 'flight' | 'system' | 'emergency'
  title: string
  body?: string
  timestamp: number
  dismissed: boolean
}

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<Notification[]>([])
  const panelOpen = ref(false)

  const unreadCount = computed(() => items.value.filter(n => !n.dismissed).length)
  const visible = computed(() => items.value.filter(n => !n.dismissed))

  function add(notification: Omit<Notification, 'id' | 'timestamp' | 'dismissed'>) {
    items.value.unshift({
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      dismissed: false,
    })
  }

  function dismiss(id: string) {
    const item = items.value.find(n => n.id === id)
    if (item) item.dismissed = true
  }

  function clearAll() {
    items.value.forEach(n => { n.dismissed = true })
  }

  function togglePanel() {
    panelOpen.value = !panelOpen.value
  }

  return { items, panelOpen, unreadCount, visible, add, dismiss, clearAll, togglePanel }
})
