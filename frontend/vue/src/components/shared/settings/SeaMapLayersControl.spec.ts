import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import { useSeaStore } from '@/stores/sea'
import SeaMapLayersControl from './SeaMapLayersControl.vue'

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
  })

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
