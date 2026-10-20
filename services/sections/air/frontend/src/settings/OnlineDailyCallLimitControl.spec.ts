import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import OnlineDailyCallLimitControl from './OnlineDailyCallLimitControl.vue'
import { useAirStore } from '../stores/air'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

/**
 * Tests for Settings › AIR › Daily Call Limit: the limit of a feed that has one
 * but doesn't state it. 0 leaves the feed's own figure in force.
 */

function mountControl() {
  return mount(OnlineDailyCallLimitControl)
}

function inputValue(wrapper: ReturnType<typeof mountControl>): string {
  return (wrapper.find('input').element as HTMLInputElement).value
}

describe('OnlineDailyCallLimitControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it("shows 0, the feed's own figure, in calls", async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(inputValue(wrapper)).toBe('0')
    expect(wrapper.find('.number-setting-unit').text()).toBe('CALLS')
    expect(wrapper.find('input').attributes('maxlength')).toBe('6')
  })

  it('names the input, and what 0 means, for assistive tech', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('input').attributes('aria-label')).toBe(
      "Online data source daily call limit, 0 to use the feed's own figure",
    )
  })

  it('shows a stored limit', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ onlineDailyCallLimit: 750 })
    const wrapper = mountControl()
    await flushPromises()
    expect(inputValue(wrapper)).toBe('750')
    expect(useAirStore().onlineDailyCallLimit).toBe(750)
  })

  it.each([
    ['a negative number', -5],
    ['a fraction', 12.5],
    ['a string', '750'],
    ['null', null],
    ['a boolean', true],
  ])('ignores %s in the stored setting, as the backend does', async (_label, stored) => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ onlineDailyCallLimit: stored })
    const wrapper = mountControl()
    await flushPromises()
    expect(inputValue(wrapper)).toBe('0')
    expect(useAirStore().onlineDailyCallLimit).toBe(0)
  })

  it('does not re-set when the stored value already matches the store', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ onlineDailyCallLimit: 0 })
    const store = useAirStore()
    const setSpy = vi.fn()
    store.setOnlineDailyCallLimit = setSpy
    mountControl()
    await flushPromises()
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('stages the new limit under the key the backend reads and saves it on APPLY', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('250')
    expect(useAirStore().onlineDailyCallLimit).toBe(250)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => Promise<unknown>)()
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'onlineDailyCallLimit', 250)
  })

  it('accepts 0 to go back to the feed figure', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ onlineDailyCallLimit: 750 })
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('0')
    expect(wrapper.find('input').classes()).not.toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toHaveLength(1)
  })

  it('emits commit on Enter', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('300')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
