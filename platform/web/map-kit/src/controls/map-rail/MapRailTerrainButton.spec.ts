import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import MapRailTerrainButton from './MapRailTerrainButton.vue'

function mountButton(id = 'a-terrain-btn') {
  return mount(MapRailTerrainButton, { attrs: { id } })
}

describe('MapRailTerrainButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('takes the id its section gives it, and names what it switches', () => {
    const button = mountButton('sea-sm-terrain-btn').get('button')

    expect(button.attributes('id')).toBe('sea-sm-terrain-btn')
    expect(button.attributes('aria-label')).toBe('Terrain contour lines')
    expect(button.attributes('data-tooltip')).toBe('TERRAIN')
  })

  it('flips the shared layer on and off, and shows it', async () => {
    const store = useBasemapStore()
    store.layers.terrain = false
    const setLayer = vi.spyOn(store, 'setLayer')
    const wrapper = mountButton()
    const button = wrapper.get('button')
    expect(button.classes()).not.toContain('active')

    await button.trigger('click')
    expect(setLayer).toHaveBeenLastCalledWith('terrain', true)
    expect(store.layers.terrain).toBe(true)
    expect(button.classes()).toContain('active')

    await button.trigger('click')
    expect(setLayer).toHaveBeenLastCalledWith('terrain', false)
    expect(store.layers.terrain).toBe(false)
  })

  it('is disabled, and says why, when the archive is not installed', () => {
    useBasemapStore().terrainAvailable = false
    const button = mountButton().get('button')

    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('data-tooltip')).toBe('TERRAIN — TILES NOT INSTALLED')
  })

  it('cannot be switched while disabled', async () => {
    const store = useBasemapStore()
    store.terrainAvailable = false
    store.layers.terrain = false

    await mountButton().get('button').trigger('click')

    expect(store.layers.terrain).toBe(false)
  })
})
