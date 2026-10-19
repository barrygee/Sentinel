import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import OnlineRefreshIntervalControl from './OnlineRefreshIntervalControl.vue'
import { useAirStore } from '../stores/air'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

function mountControl() {
  return mount(OnlineRefreshIntervalControl)
}

function inputValue(wrapper: ReturnType<typeof mountControl>): string {
  return (wrapper.find('input').element as HTMLInputElement).value
}

describe('OnlineRefreshIntervalControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('shows the 180-second default in seconds, three digits at most', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(inputValue(wrapper)).toBe('180')
    expect(wrapper.find('.number-setting-unit').text()).toBe('SECONDS')
    expect(wrapper.find('input').attributes('maxlength')).toBe('3')
  })

  it('names the input for assistive tech', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('input').attributes('aria-label')).toBe(
      'Online refresh interval in seconds',
    )
  })

  it('mirrors an edit into the store and writes it only on APPLY', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('240')
    expect(useAirStore().onlineRefreshIntervalSec).toBe(240)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    expect(settingsApi.put).not.toHaveBeenCalled()
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'onlineRefreshIntervalSec', 240)
  })

  it('accepts the 5-second minimum', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('5')
    expect(wrapper.find('input').classes()).not.toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toHaveLength(1)
  })

  it('marks anything under 5 seconds invalid and does not stage it', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('4')
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(useAirStore().onlineRefreshIntervalSec).toBe(180)
  })

  it('emits commit on Enter', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('hydrates the stored value from the air settings', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ onlineRefreshIntervalSec: 240 })
    const wrapper = mountControl()
    await flushPromises()
    expect(settingsApi.getNamespace).toHaveBeenCalledWith('air')
    expect(inputValue(wrapper)).toBe('240')
    expect(useAirStore().onlineRefreshIntervalSec).toBe(240)
  })

  it.each([
    ['under the minimum', 2, 5],
    ['negative', -30, 5],
    ['over the maximum', 900, 280],
    ['exactly the maximum', 280, 280],
  ])(
    'shows a stored value %s as the interval the backend enforces',
    async (_label, stored, shown) => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue({ onlineRefreshIntervalSec: stored })
      const wrapper = mountControl()
      await flushPromises()
      expect(inputValue(wrapper)).toBe(String(shown))
      expect(useAirStore().onlineRefreshIntervalSec).toBe(shown)
    },
  )

  it.each([
    ['a string', '240'],
    ['null', null],
    ['a boolean', true],
  ])('ignores %s in the stored setting', async (_label, stored) => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ onlineRefreshIntervalSec: stored })
    const wrapper = mountControl()
    await flushPromises()
    expect(inputValue(wrapper)).toBe('180')
    expect(useAirStore().onlineRefreshIntervalSec).toBe(180)
  })

  it('does not re-set when the stored value already matches the store', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ onlineRefreshIntervalSec: 180 })
    const store = useAirStore()
    const setSpy = vi.fn()
    store.setOnlineRefreshIntervalSec = setSpy
    mountControl()
    await flushPromises()
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
