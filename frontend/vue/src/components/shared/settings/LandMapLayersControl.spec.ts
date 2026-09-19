import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import { useLandStore } from '@/stores/land'
import { useBasemapStore } from '@/stores/basemap'
import { useRepeatersStore } from '@/stores/repeaters'
import * as settingsApi from '@/services/settingsApi'
import LandMapLayersControl from './LandMapLayersControl.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
}))

enableAutoUnmount(afterEach)

function mountControl() {
  return mount(LandMapLayersControl, { attachTo: document.body })
}

const rows = (wrapper: ReturnType<typeof mountControl>) => wrapper.findAll('.lft-row')
const rowNamed = (wrapper: ReturnType<typeof mountControl>, name: string) =>
  rows(wrapper).find((row) => row.find('.lft-row-name').text() === name)!
const switchOf = (wrapper: ReturnType<typeof mountControl>, name: string) =>
  rowNamed(wrapper, name).find('[role="switch"]')
const isOn = (wrapper: ReturnType<typeof mountControl>, name: string) =>
  switchOf(wrapper, name).attributes('aria-checked') === 'true'

describe('LandMapLayersControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.mocked(settingsApi.put).mockReset().mockResolvedValue(undefined)
    vi.mocked(settingsApi.getNamespace).mockReset().mockResolvedValue(null)
  })

  // The three data layers (APRS, cameras, repeaters) are the sidebar's FILTER
  // sub-tabs now, so this card carries only the shared base-map switch.
  it('lists the base-map switch alone, with no data-layer rows', () => {
    const wrapper = mountControl()
    expect(rows(wrapper).map((row) => row.find('.lft-row-name').text())).toEqual(['Location names'])
  })

  it('reflects the shared basemap flag, including a change made elsewhere', async () => {
    const basemapStore = useBasemapStore()
    const wrapper = mountControl()
    expect(isOn(wrapper, 'Location names')).toBe(false)
    basemapStore.setLayer('names', true)
    await wrapper.vm.$nextTick()
    expect(isOn(wrapper, 'Location names')).toBe(true)
  })

  it('flips the shared basemap flag on click, back and forth', async () => {
    const basemapStore = useBasemapStore()
    const wrapper = mountControl()
    await switchOf(wrapper, 'Location names').trigger('click')
    expect(basemapStore.layers.names).toBe(true)
    await switchOf(wrapper, 'Location names').trigger('click')
    expect(basemapStore.layers.names).toBe(false)
  })

  // Replaces the old "stages the default-layers config for APPLY" test: the
  // data layers are no longer this card's to stage, and the basemap store
  // persists `app.mapLayers` itself the moment the switch moves.
  it('persists the base-map choice at once rather than staging it for APPLY', async () => {
    const wrapper = mountControl()
    await switchOf(wrapper, 'Location names').trigger('click')
    expect(settingsApi.put).toHaveBeenCalledWith(
      'app',
      'mapLayers',
      expect.objectContaining({ names: true }),
    )
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  describe('after an app-config JSON upload', () => {
    it('re-reads the base-map switch and the chosen data layer from the config', async () => {
      vi.mocked(settingsApi.getNamespace).mockImplementation(async (namespace: string) =>
        namespace === 'app' ? { mapLayers: { names: true } } : {},
      )
      // `hydrateDefaultLayers` reads the land namespace over plain fetch.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ defaultLayers: ['trafficCameras'] }),
        }),
      )
      const basemapStore = useBasemapStore()
      const landStore = useLandStore()
      const wrapper = mountControl()

      document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
      await flushPromises()

      expect(basemapStore.layers.names).toBe(true)
      expect(isOn(wrapper, 'Location names')).toBe(true)
      expect(landStore.activeLayer).toBe('trafficCameras')
      vi.unstubAllGlobals()
    })

    it('also re-reads the repeater band/mode filters', async () => {
      vi.mocked(settingsApi.getNamespace).mockImplementation(async (namespace: string) =>
        namespace === 'land' ? { repeaterFilters: { bands: ['2M'], status: 'operational' } } : {},
      )
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
      const repeatersStore = useRepeatersStore()
      mountControl()

      document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
      await flushPromises()

      expect(repeatersStore.filters).toEqual({ bands: ['2M'], modes: [], status: 'operational' })
      vi.unstubAllGlobals()
    })

    it('leaves the chosen layer alone when the uploaded config names none it knows', async () => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue({})
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ defaultLayers: ['weather'] }) }),
      )
      const landStore = useLandStore()
      landStore.selectLayer('repeaters')
      mountControl()

      document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
      await flushPromises()

      expect(landStore.activeLayer).toBe('repeaters')
      vi.unstubAllGlobals()
    })
  })

  it('names the switch for assistive tech and has no axe violations', async () => {
    const wrapper = mountControl()
    for (const control of wrapper.findAll('[role="switch"]')) {
      expect(control.attributes('aria-label')).toBeTruthy()
    }
    expect(await axe(wrapper.element as HTMLElement)).toHaveNoViolations()
  })
})
