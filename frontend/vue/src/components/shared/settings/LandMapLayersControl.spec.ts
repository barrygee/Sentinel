import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import { useLandStore } from '@/stores/land'
import * as settingsApi from '@/services/settingsApi'
import LandMapLayersControl from './LandMapLayersControl.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
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
  })

  /** The staged writer the control handed the panel with its last `stage`. */
  function lastStaged(wrapper: ReturnType<typeof mountControl>): (() => void) | undefined {
    const staged = wrapper.emitted('stage')
    return staged?.[staged.length - 1]?.[0] as (() => void) | undefined
  }

  it('lists the traffic cameras layer, and never APRS (which lives on the FILTER rail)', () => {
    const wrapper = mountControl()
    expect(rows(wrapper).map((row) => row.find('.lft-row-name').text())).toEqual([
      'Traffic cameras',
    ])
  })

  it('reflects the store flag, including a change made on the map rail', async () => {
    const landStore = useLandStore()
    landStore.setTrafficCamerasLayerVisible(false)
    const wrapper = mountControl()
    expect(isOn(wrapper, 'Traffic cameras')).toBe(false)
    landStore.setTrafficCamerasLayerVisible(true)
    await wrapper.vm.$nextTick()
    expect(isOn(wrapper, 'Traffic cameras')).toBe(true)
  })

  it('toggles the store flag on click, back and forth', async () => {
    const landStore = useLandStore()
    const before = landStore.trafficCamerasLayerVisible
    const wrapper = mountControl()
    await switchOf(wrapper, 'Traffic cameras').trigger('click')
    expect(landStore.trafficCamerasLayerVisible).toBe(!before)
    await switchOf(wrapper, 'Traffic cameras').trigger('click')
    expect(landStore.trafficCamerasLayerVisible).toBe(before)
  })

  it('stages the default-layers config for APPLY, written only when applied', async () => {
    const wrapper = mountControl()
    await switchOf(wrapper, 'Traffic cameras').trigger('click') // off
    expect(wrapper.emitted('stage')).toHaveLength(1)
    // Nothing reaches the backend until the panel runs the staged writer.
    expect(settingsApi.put).not.toHaveBeenCalled()
    lastStaged(wrapper)!()
    expect(settingsApi.put).toHaveBeenCalledExactlyOnceWith('land', 'defaultLayers', ['aprs'])

    await switchOf(wrapper, 'Traffic cameras').trigger('click') // back on
    lastStaged(wrapper)!()
    expect(settingsApi.put).toHaveBeenLastCalledWith('land', 'defaultLayers', [
      'aprs',
      'trafficCameras',
    ])
  })

  it('names the switch for assistive tech and has no axe violations', async () => {
    const wrapper = mountControl()
    for (const control of wrapper.findAll('[role="switch"]')) {
      expect(control.attributes('aria-label')).toBeTruthy()
    }
    expect(await axe(wrapper.element as HTMLElement)).toHaveNoViolations()
  })
})
