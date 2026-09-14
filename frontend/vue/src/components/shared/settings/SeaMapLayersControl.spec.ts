import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import { useSeaStore } from '@/stores/sea'
import * as settingsApi from '@/services/settingsApi'
import SeaMapLayersControl from './SeaMapLayersControl.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
}))

enableAutoUnmount(afterEach)

function mountControl() {
  return mount(SeaMapLayersControl, { attachTo: document.body })
}

const rows = (wrapper: ReturnType<typeof mountControl>) => wrapper.findAll('.lft-row')
const rowNamed = (wrapper: ReturnType<typeof mountControl>, name: string) =>
  rows(wrapper).find((row) => row.find('.lft-row-name').text() === name)!
const switchOf = (wrapper: ReturnType<typeof mountControl>, name: string) =>
  rowNamed(wrapper, name).find('[role="switch"]')
const isOn = (wrapper: ReturnType<typeof mountControl>, name: string) =>
  switchOf(wrapper, name).attributes('aria-checked') === 'true'

describe('SeaMapLayersControl', () => {
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

  it('lists every Sea overlay once, and never the always-on vessels', () => {
    const wrapper = mountControl()
    expect(rows(wrapper).map((row) => row.find('.lft-row-name').text())).toEqual([
      'Vessel labels',
      'Range rings',
      'Ferry routes',
      'Ports',
    ])
  })

  it('reflects the Sea overlay flags, including a change made on the map rail', async () => {
    const seaStore = useSeaStore()
    seaStore.setOverlay('ports', false)
    const wrapper = mountControl()
    expect(isOn(wrapper, 'Ports')).toBe(false)
    expect(isOn(wrapper, 'Vessel labels')).toBe(true)
    expect(isOn(wrapper, 'Range rings')).toBe(false)
    // What the rail's range-ring button does: one value, not two kept in step.
    seaStore.setOverlay('rangeRings', true)
    await wrapper.vm.$nextTick()
    expect(isOn(wrapper, 'Range rings')).toBe(true)
  })

  it.each([
    ['Vessel labels', 'vesselLabels'],
    ['Range rings', 'rangeRings'],
    ['Ferry routes', 'ferryRoutes'],
    ['Ports', 'ports'],
  ] as const)('writes %s to the sea store and back again', async (label, key) => {
    const seaStore = useSeaStore()
    const before = seaStore.overlayStates[key]
    const wrapper = mountControl()
    await switchOf(wrapper, label).trigger('click')
    expect(seaStore.overlayStates[key]).toBe(!before)
    await switchOf(wrapper, label).trigger('click')
    expect(seaStore.overlayStates[key]).toBe(before)
  })

  it('stages the default-layers config for APPLY, written only when applied', async () => {
    const wrapper = mountControl()
    await switchOf(wrapper, 'Ports').trigger('click')
    await switchOf(wrapper, 'Ferry routes').trigger('click')
    expect(wrapper.emitted('stage')).toHaveLength(2)
    // Nothing reaches the backend until the panel runs the staged writer.
    expect(settingsApi.put).not.toHaveBeenCalled()
    lastStaged(wrapper)!()
    expect(settingsApi.put).toHaveBeenCalledExactlyOnceWith('sea', 'defaultLayers', [
      'vessels',
      'vesselLabels',
    ])
    // Vessels are always in; the list follows the flags as they stand at apply time.
    await switchOf(wrapper, 'Ports').trigger('click')
    await switchOf(wrapper, 'Vessel labels').trigger('click')
    lastStaged(wrapper)!()
    expect(settingsApi.put).toHaveBeenLastCalledWith('sea', 'defaultLayers', ['vessels', 'ports'])
  })

  it('keeps range rings local: no config write is staged for them', async () => {
    const wrapper = mountControl()
    await switchOf(wrapper, 'Range rings').trigger('click')
    expect(useSeaStore().overlayStates.rangeRings).toBe(true)
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('leaves the other layers alone', async () => {
    const seaStore = useSeaStore()
    const wrapper = mountControl()
    await switchOf(wrapper, 'Ports').trigger('click')
    expect(seaStore.overlayStates).toMatchObject({
      vessels: true,
      vesselLabels: true,
      ferryRoutes: true,
      ports: false,
    })
  })

  it('names every switch for assistive tech and has no axe violations', async () => {
    const wrapper = mountControl()
    for (const control of wrapper.findAll('[role="switch"]')) {
      expect(control.attributes('aria-label')).toBeTruthy()
    }
    expect(await axe(wrapper.element as HTMLElement)).toHaveNoViolations()
  })
})
