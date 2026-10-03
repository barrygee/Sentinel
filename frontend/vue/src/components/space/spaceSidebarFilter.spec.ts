import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSpaceStore } from '@/stores/space'
import { spaceSidebarFilter } from './spaceSidebarFilter'
import SpaceFilterSubTabIcon from './SpaceFilterSubTabIcon.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('Space sidebar FILTER sub-tabs', () => {
  it('offers one sub-tab per category that currently has satellites, with its section label', () => {
    useSpaceStore().spaceAvailableCategories = ['space_station', 'weather']

    expect(spaceSidebarFilter.tabs()).toEqual([
      { id: 'space_station', label: 'SPACE STATION' },
      { id: 'weather', label: 'WEATHER' },
    ])
  })

  it('spells out a category without a section label from its id', () => {
    useSpaceStore().spaceAvailableCategories = ['deep_space_probe']

    expect(spaceSidebarFilter.tabs()).toEqual([
      { id: 'deep_space_probe', label: 'DEEP SPACE PROBE' },
    ])
  })

  it('offers nothing until satellites have loaded', () => {
    expect(spaceSidebarFilter.tabs()).toEqual([])
  })

  it('lights and selects the store’s filter category', () => {
    const spaceStore = useSpaceStore()
    spaceSidebarFilter.select('weather')

    expect(spaceStore.spaceFilterCategory).toBe('weather')
    expect(spaceSidebarFilter.isActive('weather')).toBe(true)
    expect(spaceSidebarFilter.isActive('amateur')).toBe(false)
  })

  it('draws its glyphs with the Space icon', () => {
    expect(spaceSidebarFilter.icon).toBe(SpaceFilterSubTabIcon)
  })
})
