import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import { useBasemapStore } from '@/stores/basemap'
import * as settingsApi from '@/services/settingsApi'
import MapBasemapLayersControl from './MapBasemapLayersControl.vue'

vi.mock('@/services/settingsApi', () => ({ getNamespace: vi.fn(), put: vi.fn() }))

enableAutoUnmount(afterEach)

function mountControl() {
  return mount(MapBasemapLayersControl, { attachTo: document.body })
}

type Wrapper = ReturnType<typeof mountControl>

const rowNames = (wrapper: Wrapper) =>
  wrapper.findAll('.lft-row').map((row) => row.find('.lft-row-name').text())
const switchOf = (wrapper: Wrapper, name: string) =>
  wrapper
    .findAll('.lft-row')
    .find((row) => row.find('.lft-row-name').text() === name)!
    .find('[role="switch"]')
const isOn = (wrapper: Wrapper, name: string) =>
  switchOf(wrapper, name).attributes('aria-checked') === 'true'

describe('MapBasemapLayersControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('offers Roads, Location names and Borders, in that order', () => {
    expect(rowNames(mountControl())).toEqual(['Roads', 'Location names', 'Borders'])
  })

  it('reflects the shared base-map settings', () => {
    const basemapStore = useBasemapStore()
    basemapStore.layers.roads = true
    basemapStore.layers.names = false
    basemapStore.layers.borders = false
    const wrapper = mountControl()
    expect(isOn(wrapper, 'Roads')).toBe(true)
    expect(isOn(wrapper, 'Location names')).toBe(false)
    expect(isOn(wrapper, 'Borders')).toBe(false)
  })

  it('shows borders on by default', () => {
    expect(isOn(mountControl(), 'Borders')).toBe(true)
  })

  it.each([
    ['Roads', 'roads'],
    ['Location names', 'names'],
    ['Borders', 'borders'],
  ] as const)('flips %s on every map and saves the choice', async (label, key) => {
    const basemapStore = useBasemapStore()
    const before = basemapStore.layers[key]
    const wrapper = mountControl()

    await switchOf(wrapper, label).trigger('click')

    expect(basemapStore.layers[key]).toBe(!before)
    expect(isOn(wrapper, label)).toBe(!before)
    expect(settingsApi.put).toHaveBeenCalledWith(
      'app',
      'mapLayers',
      expect.objectContaining({ [key]: !before }),
    )

    await switchOf(wrapper, label).trigger('click')
    expect(basemapStore.layers[key]).toBe(before)
  })

  it('leaves the other layers alone', async () => {
    const basemapStore = useBasemapStore()
    const wrapper = mountControl()

    await switchOf(wrapper, 'Borders').trigger('click')

    expect(basemapStore.layers.roads).toBe(false)
    expect(basemapStore.layers.names).toBe(false)
  })

  it('stages a re-save for APPLY CHANGES that writes the current layers', async () => {
    const wrapper = mountControl()

    await switchOf(wrapper, 'Location names').trigger('click')
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)

    vi.mocked(settingsApi.put).mockClear()
    await (staged![0]![0] as () => Promise<void>)()
    expect(settingsApi.put).toHaveBeenCalledWith(
      'app',
      'mapLayers',
      expect.objectContaining({ names: true }),
    )
  })

  describe('re-syncing after a config upload', () => {
    it('adopts the uploaded layers on sentinel:config-uploaded', async () => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue({
        mapLayers: { roads: true, names: true, borders: false },
      })
      const wrapper = mountControl()

      document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
      await flushPromises()

      expect(settingsApi.getNamespace).toHaveBeenCalledWith('app')
      expect(isOn(wrapper, 'Roads')).toBe(true)
      expect(isOn(wrapper, 'Location names')).toBe(true)
      expect(isOn(wrapper, 'Borders')).toBe(false)
    })

    it('leaves the switches alone when the config database is unreachable', async () => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
      const wrapper = mountControl()

      document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
      await flushPromises()

      expect(isOn(wrapper, 'Roads')).toBe(false)
      expect(isOn(wrapper, 'Borders')).toBe(true)
    })

    it('stops listening once unmounted', async () => {
      const wrapper = mountControl()
      wrapper.unmount()

      document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
      await flushPromises()

      expect(settingsApi.getNamespace).not.toHaveBeenCalled()
    })
  })

  it('names every switch for assistive tech', () => {
    for (const control of mountControl().findAll('[role="switch"]')) {
      expect(control.attributes('aria-label')).toBeTruthy()
    }
  })

  it('has no accessibility violations', async () => {
    expect(await axe(mountControl().element as HTMLElement)).toHaveNoViolations()
  })
})
