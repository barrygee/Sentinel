import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import AirReplayToggleControl from './AirReplayToggleControl.vue'
import { useAirStore } from '@/stores/air'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

describe('AirReplayToggleControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('renders the switch reflecting the store default (off)', async () => {
    const wrapper = mount(AirReplayToggleControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('leaves the toggle off when the backend has no replayEnabled value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ somethingElse: 1 })
    const wrapper = mount(AirReplayToggleControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(useAirStore().replayEnabled).toBe(false)
  })

  it('hydrates the toggle and store from the DB on mount', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ replayEnabled: true })
    const wrapper = mount(AirReplayToggleControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(useAirStore().replayEnabled).toBe(true)
  })

  it('defers the live store change and DB write until the staged callback runs', async () => {
    const wrapper = mount(AirReplayToggleControl)
    await flushPromises()
    const air = useAirStore()
    await wrapper.find('[role="switch"]').trigger('click')
    // The switch flips immediately, but the store (which shows/hides the tab)
    // and DB write are deferred to APPLY CHANGES.
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(air.replayEnabled).toBe(false)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(air.replayEnabled).toBe(true)
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'replayEnabled', true)
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(AirReplayToggleControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ replayEnabled: true })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('removes the config-uploaded listener on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const wrapper = mount(AirReplayToggleControl)
    await flushPromises()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('sentinel:config-uploaded', expect.any(Function))
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(AirReplayToggleControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
