import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandAprsRetentionControl from './LandAprsRetentionControl.vue'
import { useLandStore } from '@/stores/land'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

describe('LandAprsRetentionControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('renders the store default (5 minutes) as a valid value', async () => {
    const wrapper = mount(LandAprsRetentionControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('5')
    expect(wrapper.find('input').classes()).not.toContain('number-setting-input--invalid')
  })

  it('accepts a value, mirrors it into the store, and stages the write', async () => {
    const wrapper = mount(LandAprsRetentionControl)
    await flushPromises()
    const land = useLandStore()
    await wrapper.find('input').setValue('30')
    expect(land.aprsRetentionMinutes).toBe(30)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('land', 'aprsRetentionMinutes', 30)
  })

  it('marks a non-positive value invalid and does not stage', async () => {
    const wrapper = mount(LandAprsRetentionControl)
    await flushPromises()
    await wrapper.find('input').setValue('0')
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('emits commit on Enter', async () => {
    const wrapper = mount(LandAprsRetentionControl)
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('hydrates a numeric value from the land config on mount', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aprsRetentionMinutes: 10 })
    const wrapper = mount(LandAprsRetentionControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('10')
    expect(useLandStore().aprsRetentionMinutes).toBe(10)
  })

  it('coerces a string value from the config', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aprsRetentionMinutes: '15' })
    mount(LandAprsRetentionControl)
    await flushPromises()
    expect(useLandStore().aprsRetentionMinutes).toBe(15)
  })

  it('ignores a non-numeric config value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aprsRetentionMinutes: 'soon' })
    mount(LandAprsRetentionControl)
    await flushPromises()
    expect(useLandStore().aprsRetentionMinutes).toBe(5) // unchanged
  })

  it('ignores a non-positive config value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aprsRetentionMinutes: 0 })
    mount(LandAprsRetentionControl)
    await flushPromises()
    expect(useLandStore().aprsRetentionMinutes).toBe(5)
  })

  it('does not re-set when the config value equals the current store value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aprsRetentionMinutes: 5 })
    const setSpy = vi.fn()
    const land = useLandStore()
    land.setAprsRetentionMinutes = setSpy
    mount(LandAprsRetentionControl)
    await flushPromises()
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(LandAprsRetentionControl)
    await flushPromises()
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
