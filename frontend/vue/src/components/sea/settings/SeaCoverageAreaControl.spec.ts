import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SeaCoverageAreaControl from './SeaCoverageAreaControl.vue'
import { useSeaStore } from '@/stores/sea'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

const EDGE = { south: 0, west: 1, north: 2, east: 3 } as const

async function mountControl() {
  const wrapper = mount(SeaCoverageAreaControl, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

function inputs(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('input')
}

async function lastStagedWrite(wrapper: ReturnType<typeof mount>): Promise<void> {
  const staged = wrapper.emitted('stage')!
  await (staged.at(-1)![0] as () => Promise<unknown> | void)()
}

describe('SeaCoverageAreaControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('starts worldwide with four labelled edge fields', async () => {
    const wrapper = await mountControl()
    const fields = inputs(wrapper)
    expect(fields).toHaveLength(4)
    expect(fields.map((field) => (field.element as HTMLInputElement).value)).toEqual([
      '-90',
      '-180',
      '90',
      '180',
    ])
    expect(wrapper.text()).toContain('Worldwide — every vessel AISStream hears.')
    expect(wrapper.find('label[for]').text()).toBe('SOUTH')
    wrapper.unmount()
  })

  it('loads the stored box and describes it', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      aisBoundingBoxes: [
        [
          [48.5, -6],
          [61, -1.5],
        ],
      ],
    })
    const wrapper = await mountControl()
    expect(inputs(wrapper).map((field) => (field.element as HTMLInputElement).value)).toEqual([
      '48.5',
      '-6',
      '61',
      '-1.5',
    ])
    expect(wrapper.text()).toContain('48.5°N – 61.0°N, 6.0°W – 1.5°W')
    wrapper.unmount()
  })

  it('names southern and eastern hemispheres correctly', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      aisBoundingBoxes: [
        [
          [-40, 10],
          [-10, 20],
        ],
      ],
    })
    const wrapper = await mountControl()
    expect(wrapper.text()).toContain('40.0°S – 10.0°S, 10.0°E – 20.0°E')
    wrapper.unmount()
  })

  it('ignores a malformed stored value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aisBoundingBoxes: [[1, 2]] })
    const wrapper = await mountControl()
    expect((inputs(wrapper)[EDGE.south]!.element as HTMLInputElement).value).toBe('-90')
    wrapper.unmount()
  })

  it('stages a valid edit as one bounding box', async () => {
    const wrapper = await mountControl()
    await inputs(wrapper)[EDGE.south]!.setValue('-10.5')
    await inputs(wrapper)[EDGE.north]!.setValue('20')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('10.5°S – 20.0°N')
    await lastStagedWrite(wrapper)
    expect(settingsApi.put).toHaveBeenLastCalledWith('sea', 'aisBoundingBoxes', [
      [
        [-10.5, -180],
        [20, 180],
      ],
    ])
    wrapper.unmount()
  })

  it.each([
    ['', 'All four edges are needed, in decimal degrees.'],
    ['abc', 'All four edges are needed, in decimal degrees.'],
    ['95', 'Latitudes must be between -90 and 90.'],
  ])('rejects a latitude of %j', async (value, message) => {
    const wrapper = await mountControl()
    const before = wrapper.emitted('stage')?.length ?? 0
    await inputs(wrapper)[EDGE.north]!.setValue(value)
    expect(wrapper.find('[role="alert"]').text()).toBe(message)
    expect(wrapper.emitted('stage')?.length ?? 0).toBe(before)
    expect(inputs(wrapper)[EDGE.north]!.attributes('aria-invalid')).toBe('true')
    wrapper.unmount()
  })

  it('rejects longitudes out of range and a south above north', async () => {
    const wrapper = await mountControl()
    await inputs(wrapper)[EDGE.east]!.setValue('181')
    expect(wrapper.find('[role="alert"]').text()).toBe('Longitudes must be between -180 and 180.')
    await inputs(wrapper)[EDGE.east]!.setValue('180')
    await inputs(wrapper)[EDGE.south]!.setValue('95')
    expect(wrapper.find('[role="alert"]').text()).toBe('Latitudes must be between -90 and 90.')
    await inputs(wrapper)[EDGE.south]!.setValue('50')
    await inputs(wrapper)[EDGE.north]!.setValue('40')
    expect(wrapper.find('[role="alert"]').text()).toBe('South must not be north of north.')
    wrapper.unmount()
  })

  it('USE CURRENT MAP VIEW takes the map viewport, and is disabled without one', async () => {
    const wrapper = await mountControl()
    const [useView, worldwide] = wrapper.findAll('button')
    expect(useView!.attributes('disabled')).toBeDefined()
    useSeaStore().setViewportBbox([50.123456, -1.98765, 52.5, 2.25])
    await flushPromises()
    expect(useView!.attributes('disabled')).toBeUndefined()
    await useView!.trigger('click')
    expect(inputs(wrapper).map((field) => (field.element as HTMLInputElement).value)).toEqual([
      '50.12',
      '-1.99',
      '52.50',
      '2.25',
    ])
    await lastStagedWrite(wrapper)
    expect(settingsApi.put).toHaveBeenLastCalledWith('sea', 'aisBoundingBoxes', [
      [
        [50.12, -1.99],
        [52.5, 2.25],
      ],
    ])
    await worldwide!.trigger('click')
    expect((inputs(wrapper)[EDGE.west]!.element as HTMLInputElement).value).toBe('-180')
    await lastStagedWrite(wrapper)
    expect(settingsApi.put).toHaveBeenLastCalledWith('sea', 'aisBoundingBoxes', [
      [
        [-90, -180],
        [90, 180],
      ],
    ])
    wrapper.unmount()
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountControl()
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
