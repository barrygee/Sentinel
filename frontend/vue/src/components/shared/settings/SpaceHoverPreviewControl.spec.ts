import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SpaceHoverPreviewControl from './SpaceHoverPreviewControl.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

const LS_KEY = 'sentinel_space_filterHoverPreview'

function activeLabel(wrapper: ReturnType<typeof mount>): string {
  return wrapper.find('.settings-source-override-btn.is-active').text()
}

describe('SpaceHoverPreviewControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('defaults to "stay in place"', async () => {
    const wrapper = mount(SpaceHoverPreviewControl)
    await flushPromises()
    expect(activeLabel(wrapper)).toBe('STAY IN PLACE')
  })

  it('seeds the selection from localStorage', async () => {
    localStorage.setItem(LS_KEY, 'fly')
    const wrapper = mount(SpaceHoverPreviewControl)
    await flushPromises()
    expect(activeLabel(wrapper)).toBe('FLY TO SATELLITE')
  })

  it('adopts the backend value on mount', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ filterHoverPreview: 'fly' })
    const wrapper = mount(SpaceHoverPreviewControl)
    await flushPromises()
    expect(activeLabel(wrapper)).toBe('FLY TO SATELLITE')
    expect(localStorage.getItem(LS_KEY)).toBe('fly')
  })

  it('selecting an option stages the persisted change', async () => {
    const wrapper = mount(SpaceHoverPreviewControl)
    await flushPromises()
    await wrapper.findAll('.settings-source-override-btn')[1]!.trigger('click')
    expect(activeLabel(wrapper)).toBe('FLY TO SATELLITE')
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(localStorage.getItem(LS_KEY)).toBe('fly')
    expect(settingsApi.put).toHaveBeenCalledWith('space', 'filterHoverPreview', 'fly')
  })

  it('does nothing when the already-active option is clicked', async () => {
    const wrapper = mount(SpaceHoverPreviewControl)
    await flushPromises()
    await wrapper.findAll('.settings-source-override-btn')[0]!.trigger('click')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SpaceHoverPreviewControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
