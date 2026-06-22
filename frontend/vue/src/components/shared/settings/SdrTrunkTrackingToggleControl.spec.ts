import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrTrunkTrackingToggleControl from './SdrTrunkTrackingToggleControl.vue'
import { useSdrStore } from '@/stores/sdr'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

describe('SdrTrunkTrackingToggleControl', () => {
  beforeEach(() => {
    // The store seeds the flag from localStorage, so clear it to guarantee the
    // default-off starting point for each test.
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('renders the switch reflecting the store default (off)', async () => {
    const wrapper = mount(SdrTrunkTrackingToggleControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('leaves the toggle off when the backend has no trunkTrackingEnabled value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ somethingElse: 1 })
    const wrapper = mount(SdrTrunkTrackingToggleControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(useSdrStore().trunkTrackingEnabled).toBe(false)
  })

  it('hydrates the toggle and store from the DB on mount', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ trunkTrackingEnabled: true })
    const wrapper = mount(SdrTrunkTrackingToggleControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(useSdrStore().trunkTrackingEnabled).toBe(true)
  })

  it('defers the live store change and DB write until the staged callback runs', async () => {
    const wrapper = mount(SdrTrunkTrackingToggleControl)
    await flushPromises()
    const sdr = useSdrStore()
    await wrapper.find('[role="switch"]').trigger('click')
    // The switch flips immediately, but the store (which shows/hides the trunk
    // UI) and the DB write are deferred to APPLY CHANGES.
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(sdr.trunkTrackingEnabled).toBe(false)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(sdr.trunkTrackingEnabled).toBe(true)
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'trunkTrackingEnabled', true)
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(SdrTrunkTrackingToggleControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ trunkTrackingEnabled: true })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('removes the config-uploaded listener on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const wrapper = mount(SdrTrunkTrackingToggleControl)
    await flushPromises()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('sentinel:config-uploaded', expect.any(Function))
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SdrTrunkTrackingToggleControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
