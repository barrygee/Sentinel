import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface TrackingField {
  label: string
  value: string
  emrg?: boolean
}

export interface TrackingItem {
  id: string
  name: string
  domain: 'air' | 'space' | 'sea' | 'land'
  fields: TrackingField[]
  onUntrack?: () => void  // not persisted
}

const LS_KEY = 'trackingItems'

type StoredItem = Omit<TrackingItem, 'onUntrack'>

function _loadStored(): StoredItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as StoredItem[]) : []
  } catch { return [] }
}

function _persist(live: Map<string, TrackingItem>): void {
  const existing = _loadStored().filter(i => !live.has(i.id))
  const liveArr: StoredItem[] = []
  live.forEach(item => liveArr.push({ id: item.id, name: item.name, domain: item.domain, fields: item.fields }))
  try { localStorage.setItem(LS_KEY, JSON.stringify([...existing, ...liveArr])) } catch {}
}

export const useTrackingStore = defineStore('tracking', () => {
  // Live items: have active onUntrack callback from the current domain
  const _live = ref<Map<string, TrackingItem>>(new Map())
  // All items including read-only ones from other domains
  const panelOpen = ref(false)

  const allItems = computed<StoredItem[]>(() => {
    const stored = _loadStored()
    const liveIds = new Set(_live.value.keys())
    const readOnly = stored.filter(i => !liveIds.has(i.id))
    const liveArr: StoredItem[] = []
    _live.value.forEach(item => liveArr.push({ id: item.id, name: item.name, domain: item.domain, fields: item.fields }))
    return [...liveArr, ...readOnly]
  })

  const count = computed(() => allItems.value.length)

  function getLiveItem(id: string): TrackingItem | undefined {
    return _live.value.get(id)
  }

  function isLive(id: string): boolean {
    return _live.value.has(id)
  }

  function register(item: TrackingItem): void {
    _live.value.set(item.id, item)
    _persist(_live.value)
    panelOpen.value = true
  }

  function unregister(id: string): void {
    _live.value.delete(id)
    const stored = _loadStored().filter(i => i.id !== id)
    try { localStorage.setItem(LS_KEY, JSON.stringify(stored)) } catch {}
  }

  function updateFields(id: string, fields: TrackingField[]): void {
    const item = _live.value.get(id)
    if (item) {
      item.fields = fields
      _persist(_live.value)
    }
  }

  function untrackItem(id: string): void {
    const live = _live.value.get(id)
    if (live?.onUntrack) live.onUntrack()
    else unregister(id)
  }

  function togglePanel(): void {
    panelOpen.value = !panelOpen.value
  }

  return { panelOpen, allItems, count, isLive, getLiveItem, register, unregister, updateFields, untrackItem, togglePanel }
})
