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

  it('has no accessibility violations', async () => {
    const wrapper = mount(SeaLabelFieldsControl, { attachTo: document.body })
    await flushPromises()
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
