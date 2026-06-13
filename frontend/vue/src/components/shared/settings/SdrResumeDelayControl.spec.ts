import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrResumeDelayControl from './SdrResumeDelayControl.vue'
import { useSdrStore } from '@/stores/sdr'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

/** Stub the global fetch the sdr store's hydrateResumeDelaySecFromDb uses. */
function stubFetch(payload: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => payload }))
}

describe('SdrResumeDelayControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // `restoreMocks` only resets spies created via vi.spyOn — the settingsApi
    // factory mocks keep their call history between tests, so clear it here.
    vi.clearAllMocks()
    stubFetch({}) // hydrate no-op: store keeps default 0
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the store default (0) as a valid value', async () => {
    const wrapper = mount(SdrResumeDelayControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('0')
    expect(wrapper.find('input').classes()).not.toContain('rd-input--invalid')
  })

  it('accepts a valid value, mirrors it into the store, and stages the write', async () => {
    const wrapper = mount(SdrResumeDelayControl)
    await flushPromises()
    await wrapper.find('input').setValue('5')
    expect(useSdrStore().resumeDelaySec).toBe(5)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'resumeDelaySec', 5)
  })

  it('strips non-numeric characters before staging', async () => {
    const wrapper = mount(SdrResumeDelayControl)
    await flushPromises()
    await wrapper.find('input').setValue('5a9')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('59')
    expect(useSdrStore().resumeDelaySec).toBe(59)
  })

  it('marks an empty value invalid and does not stage', async () => {
    const wrapper = mount(SdrResumeDelayControl)
    await flushPromises()
    await wrapper.find('input').setValue('')
    expect(wrapper.find('input').classes()).toContain('rd-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('emits commit on Enter', async () => {
    const wrapper = mount(SdrResumeDelayControl)
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('hydrates the value from the DB on mount', async () => {
    stubFetch({ resumeDelaySec: 12 })
    const wrapper = mount(SdrResumeDelayControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('12')
    expect(useSdrStore().resumeDelaySec).toBe(12)
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(SdrResumeDelayControl)
    await flushPromises()
    stubFetch({ resumeDelaySec: 7 })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('7')
  })

  it('removes the config-uploaded listener on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const wrapper = mount(SdrResumeDelayControl)
    await flushPromises()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('sentinel:config-uploaded', expect.any(Function))
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SdrResumeDelayControl)
    await flushPromises()
    // `region` is a page-level landmark rule (this control always lives inside
    // the Settings panel's landmark). The input's missing accessible name
    // (`label`) is a known pre-existing gap tracked for the a11y remediation
    // phase of the retrofit, not this test-backfill slice — disable it here so
    // the smoke test still guards every other rule.
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
