import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SeaLabelFieldsControl from './SeaLabelFieldsControl.vue'
import { useSeaStore } from '@/stores/sea'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

const ROW = { name: 0, type: 1, mmsi: 2, flag: 3, destination: 4, speed: 5, course: 6 } as const

describe('SeaLabelFieldsControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('renders one checkbox per vessel field, name on by default', async () => {
    const wrapper = mount(SeaLabelFieldsControl)
    await flushPromises()
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(7)
    expect(boxes[ROW.name]!.attributes('aria-label')).toBe('Vessel name')
    expect((boxes[ROW.name]!.element as HTMLInputElement).checked).toBe(true)
    expect((boxes[ROW.mmsi]!.element as HTMLInputElement).checked).toBe(false)
  })

  it('adopts the backend choice on open', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      labelDataPoints: { mmsi: true, speed: true },
    })
    const wrapper = mount(SeaLabelFieldsControl)
    await flushPromises()
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect((boxes[ROW.mmsi]!.element as HTMLInputElement).checked).toBe(true)
    expect((boxes[ROW.speed]!.element as HTMLInputElement).checked).toBe(true)
    expect(useSeaStore().labelFields.mmsi).toBe(true)
  })

  it('ignores a malformed backend value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ labelDataPoints: ['name'] })
    const wrapper = mount(SeaLabelFieldsControl)
    await flushPromises()
    expect(
      (wrapper.findAll('input[type="checkbox"]')[ROW.name]!.element as HTMLInputElement).checked,
    ).toBe(true)
  })

  it('toggling mirrors to the store at once and stages the backend write', async () => {
    const wrapper = mount(SeaLabelFieldsControl)
    await flushPromises()
    await wrapper.findAll('input[type="checkbox"]')[ROW.destination]!.trigger('change')
    expect(useSeaStore().labelFields.destination).toBe(true)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    ;(staged![0]![0] as () => void)()
    expect(settingsApi.put).toHaveBeenCalledWith(
      'sea',
      'labelDataPoints',
      expect.objectContaining({ destination: true, name: true }),
    )
  })

  it('switches the labels layer off with the last field, and back on with the first', async () => {
    const store = useSeaStore()
    // Start from a single shown field so one untick empties the set.
    store.setLabelFields({
      name: true,
      type: false,
      mmsi: false,
      flag: false,
      destination: false,
      speed: false,
      course: false,
    })
    const wrapper = mount(SeaLabelFieldsControl)
    await flushPromises()
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[ROW.name]!.trigger('change')
    expect(store.labelFields.name).toBe(false)
    expect(store.overlayStates.vesselLabels).toBe(false)
    // The layer flip is saved with the fields on APPLY.
    let staged = wrapper.emitted('stage')!
    ;(staged[staged.length - 1]![0] as () => void)()
    expect(settingsApi.put).toHaveBeenCalledWith('sea', 'defaultLayers', [
      'vessels',
      'ferryRoutes',
      'ports',
    ])
    vi.mocked(settingsApi.put).mockClear()

    await checkboxes[ROW.destination]!.trigger('change')
    expect(store.overlayStates.vesselLabels).toBe(true)
    staged = wrapper.emitted('stage')!
    ;(staged[staged.length - 1]![0] as () => void)()
    expect(settingsApi.put).toHaveBeenCalledWith('sea', 'defaultLayers', [
      'vessels',
      'vesselLabels',
      'ferryRoutes',
      'ports',
    ])
    vi.mocked(settingsApi.put).mockClear()

    // A second field while the layer is already on changes nothing about the layer.
    await checkboxes[ROW.name]!.trigger('change')
    expect(store.overlayStates.vesselLabels).toBe(true)
    staged = wrapper.emitted('stage')!
    ;(staged[staged.length - 1]![0] as () => void)()
    expect(settingsApi.put).toHaveBeenCalledExactlyOnceWith(
      'sea',
      'labelDataPoints',
      expect.objectContaining({ name: true, destination: true }),
    )
  })

  it('brings a switched-off labels layer back as soon as any field is shown', async () => {
    const store = useSeaStore()
    store.setOverlay('vesselLabels', false)
    const wrapper = mount(SeaLabelFieldsControl)
    await flushPromises()
    // Ticking a second field while the name is already shown: fields are
    // shown and the layer was off, so the two disagree and the fields win.
    await wrapper.findAll('input[type="checkbox"]')[ROW.type]!.trigger('change')
    expect(store.labelFields.type).toBe(true)
    expect(store.overlayStates.vesselLabels).toBe(true)
  })

  it('does not touch the labels layer just for opening the panel', async () => {
    const store = useSeaStore()
    store.setOverlay('vesselLabels', false)
    mount(SeaLabelFieldsControl)
    await flushPromises()
    expect(store.overlayStates.vesselLabels).toBe(false)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SeaLabelFieldsControl, { attachTo: document.body })
    await flushPromises()
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
