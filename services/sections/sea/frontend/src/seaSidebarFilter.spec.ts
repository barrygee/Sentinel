import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { seaSidebarFilter } from './seaSidebarFilter'
import { useSeaStore } from './stores/sea'
import { SEA_FILTER_CATEGORIES } from './utils/aisShipType'
import SeaFilterSubTabIcon from './SeaFilterSubTabIcon.vue'

describe('seaSidebarFilter', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('offers one tab per vessel family, "all" first as ALL VESSELS', () => {
    const tabs = seaSidebarFilter.tabs()
    expect(tabs.map((tab) => tab.id)).toEqual([...SEA_FILTER_CATEGORIES])
    expect(tabs[0]).toEqual({ id: 'all', label: 'ALL VESSELS' })
    for (const tab of tabs.slice(1)) expect(tab.label).toBe(tab.id.toUpperCase())
    expect(seaSidebarFilter.icon).toBe(SeaFilterSubTabIcon)
  })

  it('selects a family on the store and lights only that tab', () => {
    const family = SEA_FILTER_CATEGORIES[1]!
    seaSidebarFilter.select(family)
    expect(useSeaStore().seaFilterCategory).toBe(family)
    expect(seaSidebarFilter.isActive(family)).toBe(true)
    expect(seaSidebarFilter.isActive('all')).toBe(false)
  })
})
