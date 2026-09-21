import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandAprsChannelControl from './LandAprsChannelControl.vue'
import { useLandStore } from '@/stores/land'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

describe('LandAprsChannelControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('renders the store default (144.8 MHz) as a valid value', async () => {
    const wrapper = mount(LandAprsChannelControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('144.8')
    expect(wrapper.find('input').classes()).not.toContain('number-setting-input--invalid')
    expect(wrapper.text()).toContain('MHZ')
  })

  it('accepts a decimal MHz value, mirrors it into the store, and stages the write in integer Hz', async () => {
    const wrapper = mount(LandAprsChannelControl)
    await flushPromises()
    const land = useLandStore()
    await wrapper.find('input').setValue('144.39')
    expect(land.aprsChannelMhz).toBe(144.39)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    // 144.39 * 1e6 is not exactly representable; the writer must round to whole Hz.
    expect(settingsApi.put).toHaveBeenCalledWith('land', 'aprsChannelHz', 144390000)
  })

  it('marks a value below the tunable range invalid and does not stage', async () => {
    const wrapper = mount(LandAprsChannelControl)
    await flushPromises()
    await wrapper.find('input').setValue('12')
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('emits commit on Enter', async () => {
    const wrapper = mount(LandAprsChannelControl)
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('hydrates the stored Hz value from the land config as MHz on mount', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aprsChannelHz: 144390000 })
    const wrapper = mount(LandAprsChannelControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('144.39')
    expect(useLandStore().aprsChannelMhz).toBe(144.39)
  })

  it('coerces a string Hz value from the config', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aprsChannelHz: '144800000' })
    mount(LandAprsChannelControl)
    await flushPromises()
    expect(useLandStore().aprsChannelMhz).toBe(144.8)
  })

  it('ignores a non-numeric config value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aprsChannelHz: 'two metres' })
    mount(LandAprsChannelControl)
    await flushPromises()
    expect(useLandStore().aprsChannelMhz).toBe(144.8) // unchanged
  })

  it('ignores a non-positive config value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aprsChannelHz: 0 })
    mount(LandAprsChannelControl)
    await flushPromises()
    expect(useLandStore().aprsChannelMhz).toBe(144.8)
  })

  it('ignores a missing config namespace', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    mount(LandAprsChannelControl)
    await flushPromises()
    expect(useLandStore().aprsChannelMhz).toBe(144.8)
  })

  it('does not re-set when the config value equals the current store value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aprsChannelHz: 144800000 })
    const setSpy = vi.fn()
    const land = useLandStore()
    land.setAprsChannelMhz = setSpy
    mount(LandAprsChannelControl)
    await flushPromises()
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(LandAprsChannelControl)
    await flushPromises()
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
