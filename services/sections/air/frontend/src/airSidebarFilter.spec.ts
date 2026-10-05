import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { airSidebarFilter } from './airSidebarFilter'
import { useAirStore } from './stores/air'
import AirFilterSubTabIcon from './AirFilterSubTabIcon.vue'

describe('airSidebarFilter', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('offers the three aircraft views, then airports and military bases', () => {
    expect(airSidebarFilter.tabs().map((tab) => tab.id)).toEqual([
      'aircraft',
      'civil',
      'milAircraft',
      'airports',
      'mil',
    ])
    expect(airSidebarFilter.icon).toBe(AirFilterSubTabIcon)
  })

  it.each([
    ['aircraft', 'all'],
    ['civil', 'civil'],
    ['milAircraft', 'mil'],
  ] as const)('picking %s shows aircraft with the %s type filter', (tabId, typeFilter) => {
    const airStore = useAirStore()
    airStore.setAirFilterCategory('airports')

    airSidebarFilter.select(tabId)

    expect(airStore.airFilterCategory).toBe('aircraft')
    expect(airStore.adsbTypeFilter).toBe(typeFilter)
    expect(airSidebarFilter.isActive(tabId)).toBe(true)
  })

  it('lights only the aircraft tab whose type filter is in force', () => {
    airSidebarFilter.select('civil')
    expect(airSidebarFilter.isActive('civil')).toBe(true)
    expect(airSidebarFilter.isActive('aircraft')).toBe(false)
    expect(airSidebarFilter.isActive('milAircraft')).toBe(false)
  })

  it('does not light an aircraft tab while another category is shown', () => {
    const airStore = useAirStore()
    airStore.setAdsbTypeFilter('civil')
    airStore.setAirFilterCategory('mil')
    expect(airSidebarFilter.isActive('civil')).toBe(false)
  })

  it('picks a non-aircraft category directly', () => {
    airSidebarFilter.select('airports')
    expect(useAirStore().airFilterCategory).toBe('airports')
    expect(airSidebarFilter.isActive('airports')).toBe(true)
    expect(airSidebarFilter.isActive('mil')).toBe(false)
  })
})
