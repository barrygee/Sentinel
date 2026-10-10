import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SquawkWatchIntervalControl from './SquawkWatchIntervalControl.vue'
import { useAirStore, type SquawkWatchMode } from '../stores/air'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

function mountFor(mode: SquawkWatchMode) {
  return mount(SquawkWatchIntervalControl, { props: { mode } })
}

function inputValue(wrapper: ReturnType<typeof mountFor>): string {
  return (wrapper.find('input').element as HTMLInputElement).value
}

describe('SquawkWatchIntervalControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('shows the 20-second default in seconds', async () => {
    const wrapper = mountFor('online')
    await flushPromises()
    expect(inputValue(wrapper)).toBe('20')
    expect(wrapper.find('.number-setting-unit').text()).toBe('SEC')
    expect(wrapper.find('input').attributes('maxlength')).toBe('4')
  })

  it.each([
    ['online', 'Online squawk alert check interval in seconds'],
    ['offgrid', 'Off grid squawk alert check interval in seconds'],
  ] as const)('names the %s input for assistive tech', async (mode, name) => {
    const wrapper = mountFor(mode)
    await flushPromises()
    expect(wrapper.find('input').attributes('aria-label')).toBe(name)
  })

  it.each([
    ['online', 'squawkWatchOnlineIntervalSec', { online: 45, offgrid: 20 }],
    ['offgrid', 'squawkWatchOffgridIntervalSec', { online: 20, offgrid: 45 }],
  ] as const)(
    'stages the %s value under its own key and mirrors only that mode',
    async (mode, key, expected) => {
      const wrapper = mountFor(mode)
      await flushPromises()
      await wrapper.find('input').setValue('45')
      expect(useAirStore().squawkWatchIntervalSec).toEqual(expected)
      const staged = wrapper.emitted('stage')
      expect(staged).toHaveLength(1)
      expect(settingsApi.put).not.toHaveBeenCalled() // only on APPLY
      await (staged![0]![0] as () => unknown)()
      expect(settingsApi.put).toHaveBeenCalledWith('air', key, 45)
    },
  )

  it('accepts the 5-second minimum', async () => {
    const wrapper = mountFor('offgrid')
    await flushPromises()
    await wrapper.find('input').setValue('5')
    expect(wrapper.find('input').classes()).not.toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toHaveLength(1)
  })

  it('marks anything under 5 seconds invalid and does not stage it', async () => {
    const wrapper = mountFor('online')
    await flushPromises()
    await wrapper.find('input').setValue('4')
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(useAirStore().squawkWatchIntervalSec.online).toBe(20)
  })

  it('emits commit on Enter', async () => {
    const wrapper = mountFor('online')
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it.each([
    ['online', { squawkWatchOnlineIntervalSec: 60, squawkWatchOffgridIntervalSec: 7 }, '60'],
    ['offgrid', { squawkWatchOnlineIntervalSec: 60, squawkWatchOffgridIntervalSec: 7 }, '7'],
  ] as const)('hydrates the %s value from the air settings', async (mode, stored, shown) => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(stored)
    const wrapper = mountFor(mode)
    await flushPromises()
    expect(settingsApi.getNamespace).toHaveBeenCalledWith('air')
    expect(inputValue(wrapper)).toBe(shown)
    expect(useAirStore().squawkWatchIntervalSec[mode]).toBe(Number(shown))
  })

  it.each([
    ['a string', '60'],
    ['a value under the minimum', 4],
    ['a value over the maximum', 10000],
    ['infinity', Number.POSITIVE_INFINITY],
    ['null', null],
  ])('ignores %s in the stored setting', async (_label, stored) => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      squawkWatchOnlineIntervalSec: stored,
    })
    const wrapper = mountFor('online')
    await flushPromises()
    expect(inputValue(wrapper)).toBe('20')
    expect(useAirStore().squawkWatchIntervalSec.online).toBe(20)
  })

  it('does not re-set when the stored value already matches the store', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ squawkWatchOnlineIntervalSec: 20 })
    const store = useAirStore()
    const setSpy = vi.fn()
    store.setSquawkWatchIntervalSec = setSpy
    mountFor('online')
    await flushPromises()
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountFor('online')
    await flushPromises()
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
