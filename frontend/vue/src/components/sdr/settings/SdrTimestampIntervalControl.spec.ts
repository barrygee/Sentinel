import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrTimestampIntervalControl from './SdrTimestampIntervalControl.vue'
import { useSdrStore } from '@/stores/sdr'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

/** Stub the fetch the store's hydrateWaterfallTimestampIntervalFromDb uses. */
function stubFetch(payload: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => payload }))
}

const input = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('input').element as HTMLInputElement

describe('SdrTimestampIntervalControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    // The settingsApi factory mocks keep their call history between tests.
    vi.clearAllMocks()
    stubFetch({}) // hydrate no-op: the store keeps its default
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the store default (5 s) as a valid value', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()
    expect(input(wrapper).value).toBe('5')
    expect(wrapper.find('input').classes()).not.toContain('number-setting-input--invalid')
  })

  it('names the field for screen readers, since it has no visible label', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()
    expect(wrapper.find('input').attributes('aria-label')).toBe(
      'Waterfall timestamp interval in seconds',
    )
  })

  it('accepts a valid interval, mirrors it into the store, and stages the write', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()

    await wrapper.find('input').setValue('30')

    // Mirrored immediately so the waterfall re-spaces its labels live.
    expect(useSdrStore().waterfallTimestampIntervalSec).toBe(30)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    // Nothing is persisted until the Settings panel applies the staged write.
    expect(settingsApi.put).not.toHaveBeenCalled()

    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'waterfallTimestampIntervalSec', 30)
  })

  it('strips non-numeric characters before staging', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()
    await wrapper.find('input').setValue('1a2')
    expect(input(wrapper).value).toBe('12')
    expect(useSdrStore().waterfallTimestampIntervalSec).toBe(12)
  })

  it('caps the typed value at four digits', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()
    expect(wrapper.find('input').attributes('maxlength')).toBe('4')
  })

  it('rejects 0, which would mark every raster row', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()

    await wrapper.find('input').setValue('0')

    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
    // The store keeps the last good interval rather than taking the 0.
    expect(useSdrStore().waterfallTimestampIntervalSec).toBe(5)
  })

  it('accepts the 1 s minimum', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()

    await wrapper.find('input').setValue('1')

    expect(wrapper.find('input').classes()).not.toContain('number-setting-input--invalid')
    expect(useSdrStore().waterfallTimestampIntervalSec).toBe(1)
  })

  it('marks an empty value invalid and does not stage', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()
    await wrapper.find('input').setValue('')
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('emits commit on Enter', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('hydrates the interval from the DB on mount', async () => {
    stubFetch({ waterfallTimestampIntervalSec: 60 })
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()
    expect(input(wrapper).value).toBe('60')
    expect(useSdrStore().waterfallTimestampIntervalSec).toBe(60)
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()

    stubFetch({ waterfallTimestampIntervalSec: 15 })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()

    expect(input(wrapper).value).toBe('15')
  })

  it('removes the config-uploaded listener on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('sentinel:config-uploaded', expect.any(Function))
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SdrTimestampIntervalControl)
    await flushPromises()
    // `region` is a page-level landmark rule (this control always lives inside
    // the Settings panel's landmark) — disabled here. The input's accessible
    // name comes from `aria-label`, so `label` and every other rule still run.
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
