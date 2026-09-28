import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import { useBasemapStore } from '@/stores/basemap'
import * as settingsApi from '@/services/settingsApi'
import MapRoadsControl from './MapRoadsControl.vue'

vi.mock('@/services/settingsApi', () => ({ getNamespace: vi.fn(), put: vi.fn() }))

enableAutoUnmount(afterEach)

function mountControl() {
  return mount(MapRoadsControl, { attachTo: document.body })
}

const roadsSwitch = (wrapper: ReturnType<typeof mountControl>) => wrapper.find('[role="switch"]')

describe('MapRoadsControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows a single Roads switch reflecting the shared base-map setting', () => {
    const basemapStore = useBasemapStore()
    basemapStore.layers.roads = true
    const wrapper = mountControl()
    expect(wrapper.findAll('.lft-row').map((row) => row.find('.lft-row-name').text())).toEqual([
      'Roads',
    ])
    expect(roadsSwitch(wrapper).attributes('aria-checked')).toBe('true')
  })

  it('flips roads on every map and saves the choice', async () => {
    const basemapStore = useBasemapStore()
    basemapStore.layers.roads = false
    const wrapper = mountControl()

    await roadsSwitch(wrapper).trigger('click')

    expect(basemapStore.layers.roads).toBe(true)
    expect(roadsSwitch(wrapper).attributes('aria-checked')).toBe('true')
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'mapLayers', {
      roads: true,
      names: false,
      terrain: false,
    })

    await roadsSwitch(wrapper).trigger('click')
    expect(basemapStore.layers.roads).toBe(false)
  })

  it('stages a re-save for APPLY CHANGES that writes the current layers', async () => {
    const basemapStore = useBasemapStore()
    basemapStore.layers.roads = false
    const wrapper = mountControl()

    await roadsSwitch(wrapper).trigger('click')
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)

    vi.mocked(settingsApi.put).mockClear()
    await (staged![0]![0] as () => Promise<void>)()
    expect(settingsApi.put).toHaveBeenCalledWith(
      'app',
      'mapLayers',
      expect.objectContaining({ roads: true }),
    )
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountControl()
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
