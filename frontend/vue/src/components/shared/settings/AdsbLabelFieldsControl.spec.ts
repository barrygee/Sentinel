import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import AdsbLabelFieldsControl from './AdsbLabelFieldsControl.vue'
import { useAirStore } from '@/stores/air'
import * as settingsApi from '@/services/settingsApi'

vi.mock('@/services/settingsApi', () => ({ put: vi.fn() }))

describe('AdsbLabelFieldsControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders a civil + military checkbox for each label option', async () => {
    const wrapper = mount(AdsbLabelFieldsControl)
    await flushPromises()
    // 2 options (type, alt) × 2 columns.
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(4)
  })

  it('toggles a civil label field on then off, broadcasting each change', async () => {
    const broadcast = vi.fn()
    window.addEventListener('adsb:labelFieldsChanged', broadcast)
    const wrapper = mount(AdsbLabelFieldsControl)
    await flushPromises()
    const air = useAirStore()
    const typeCheckbox = wrapper.findAll('input[type="checkbox"]')[0]!
    const startsIncluded = air.adsbLabelFields.civil.includes('type')

    await typeCheckbox.trigger('change')
    expect(air.adsbLabelFields.civil.includes('type')).toBe(!startsIncluded)

    await typeCheckbox.trigger('change')
    expect(air.adsbLabelFields.civil.includes('type')).toBe(startsIncluded)

    expect(broadcast).toHaveBeenCalledTimes(2)
    window.removeEventListener('adsb:labelFieldsChanged', broadcast)
  })

  it('toggles a military label field independently', async () => {
    const wrapper = mount(AdsbLabelFieldsControl)
    await flushPromises()
    const air = useAirStore()
    const before = air.adsbLabelFields.mil.includes('type')
    await wrapper.findAll('input[type="checkbox"]')[1]!.trigger('change')
    expect(air.adsbLabelFields.mil.includes('type')).toBe(!before)
  })

  it('stages a callback that persists the label fields to the backend on save', async () => {
    const wrapper = mount(AdsbLabelFieldsControl)
    await flushPromises()
    const air = useAirStore()
    await wrapper.findAll('input[type="checkbox"]')[0]!.trigger('change')
    const staged = wrapper.emitted('stage')![0]![0] as () => void

    // The PUT is deferred until the staged callback runs (i.e. on save), not on toggle.
    expect(settingsApi.put).not.toHaveBeenCalled()

    staged()
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'labelFields', {
      civil: [...air.adsbLabelFields.civil],
      mil: [...air.adsbLabelFields.mil],
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(AdsbLabelFieldsControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
