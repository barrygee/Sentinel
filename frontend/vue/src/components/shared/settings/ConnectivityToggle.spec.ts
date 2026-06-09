import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import ConnectivityToggle from './ConnectivityToggle.vue'
import { useAppStore } from '@/stores/app'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

const MODE_KEY = 'sentinel_app_connectivityMode'
const overrideKey = (ns: string) => `sentinel_${ns}_sourceOverride`

describe('ConnectivityToggle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('defaults to online with no override summary or warning', async () => {
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.find('.settings-connectivity-override-summary').exists()).toBe(false)
    expect(wrapper.find('.settings-connectivity-warning').exists()).toBe(false)
  })

  it('seeds off-grid from localStorage', async () => {
    localStorage.setItem(MODE_KEY, 'offgrid')
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('shows a conflict summary for a non-auto domain override', async () => {
    localStorage.setItem(overrideKey('air'), 'offgrid')
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    expect(wrapper.find('.settings-connectivity-override-summary').exists()).toBe(true)
    expect(wrapper.text()).toContain('AIR')
    expect(wrapper.text()).toContain('OFFGRID')
  })

  it('toggles off-grid and stages the mode change when there are no overrides', async () => {
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    const app = useAppStore()
    await wrapper.find('[role="switch"]').trigger('click')
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.find('.settings-connectivity-warning').exists()).toBe(false)
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(localStorage.getItem(MODE_KEY)).toBe('offgrid')
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'connectivityMode', 'offgrid')
    expect(app.connectivityMode).toBe('offgrid')
  })

  it('warns and resets all overrides to auto when toggling with overrides set', async () => {
    localStorage.setItem(overrideKey('air'), 'online')
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    await wrapper.find('[role="switch"]').trigger('click')
    expect(wrapper.find('.settings-connectivity-warning').exists()).toBe(true)
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(localStorage.getItem(overrideKey('air'))).toBe('auto')
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'sourceOverride', 'auto')
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'connectivityMode', 'offgrid')
  })

  it('toggles back to online from off-grid', async () => {
    localStorage.setItem(MODE_KEY, 'offgrid')
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    await wrapper.find('[role="switch"]').trigger('click')
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'connectivityMode', 'online')
  })

  it('adopts a differing backend mode on mount', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ connectivityMode: 'offgrid' })
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(localStorage.getItem(MODE_KEY)).toBe('offgrid')
  })

  it('leaves the toggle unchanged when the backend mode matches', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ connectivityMode: 'online' })
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('tolerates localStorage failures when toggling', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    await wrapper.find('[role="switch"]').trigger('click')
    // No override summary or warning surfaces because reads threw (treated as
    // no overrides), and the staged write still reaches the backend.
    expect(wrapper.find('.settings-connectivity-warning').exists()).toBe(false)
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'connectivityMode', 'offgrid')
  })

  it('survives a sourceOverrideChanged broadcast', async () => {
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    window.dispatchEvent(new CustomEvent('sentinel:sourceOverrideChanged'))
    await flushPromises()
    expect(wrapper.find('[role="switch"]').exists()).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(ConnectivityToggle)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
