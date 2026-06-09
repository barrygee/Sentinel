import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrShowKnownFreqsControl from './SdrShowKnownFreqsControl.vue'
import { useSdrStore } from '@/stores/sdr'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

/** Stub the global fetch the sdr store's hydrate* methods call. */
function stubFetch(payload: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => payload }))
}

describe('SdrShowKnownFreqsControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubFetch({}) // hydrate is a no-op: store keeps its default (on)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the switch reflecting the store default (on)', async () => {
    const wrapper = mount(SdrShowKnownFreqsControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.find('[role="switch"]').classes()).toContain('is-on')
  })

  it('toggles off, mirrors into the store, and stages the DB write', async () => {
    const wrapper = mount(SdrShowKnownFreqsControl)
    await flushPromises()
    const sdr = useSdrStore()
    await wrapper.find('[role="switch"]').trigger('click')
    expect(sdr.showKnownFreqs).toBe(false)
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'showKnownFreqs', false)
  })

  it('hydrates the toggle from the DB on mount', async () => {
    stubFetch({ showKnownFreqs: false })
    const wrapper = mount(SdrShowKnownFreqsControl)
    await flushPromises()
    expect(useSdrStore().showKnownFreqs).toBe(false)
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(SdrShowKnownFreqsControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
    stubFetch({ showKnownFreqs: false })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('removes the config-uploaded listener on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const wrapper = mount(SdrShowKnownFreqsControl)
    await flushPromises()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('sentinel:config-uploaded', expect.any(Function))
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SdrShowKnownFreqsControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
