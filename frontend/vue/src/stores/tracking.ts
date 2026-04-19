import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface TrackingItem {
  id: string
  name: string
  domain: 'air' | 'space' | 'sea' | 'land'
  follow: boolean
  fields: Record<string, string>
}

const LS_KEY = 'trackingItems'

export const useTrackingStore = defineStore('tracking', () => {
  const items = ref<TrackingItem[]>(_loadFromStorage())
  const panelOpen = ref(false)

  const count = computed(() => items.value.length)

  function register(item: TrackingItem) {
    const existing = items.value.findIndex(t => t.id === item.id && t.domain === item.domain)
    if (existing >= 0) {
      items.value[existing] = item
    } else {
      items.value.push(item)
    }
    _persist()
  }

  function unregister(id: string, domain: TrackingItem['domain']) {
    items.value = items.value.filter(t => !(t.id === id && t.domain === domain))
    _persist()
  }

  function updateFields(id: string, domain: TrackingItem['domain'], fields: Record<string, string>) {
    const item = items.value.find(t => t.id === id && t.domain === domain)
    if (item) {
      item.fields = { ...item.fields, ...fields }
      _persist()
    }
  }

  function togglePanel() {
    panelOpen.value = !panelOpen.value
  }

  function _persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items.value)) } catch {}
  }

  return { items, panelOpen, count, register, unregister, updateFields, togglePanel }
})

function _loadFromStorage(): TrackingItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
