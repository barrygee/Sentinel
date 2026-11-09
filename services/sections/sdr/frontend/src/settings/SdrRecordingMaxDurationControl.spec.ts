import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrRecordingMaxDurationControl from './SdrRecordingMaxDurationControl.vue'
import { useSdrStore } from '../stores/sdr'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

/** Set what the sdr store's hydrateRecordingMaxDurationFromDb reads. */
function stubStoredSettings(storedSettings: Record<string, unknown>): void {
  vi.mocked(settingsApi.getNamespace).mockResolvedValue(storedSettings)
}

describe('SdrRecordingMaxDurationControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // `restoreMocks` only resets spies created via vi.spyOn — the settingsApi
    // factory mocks keep their call history between tests, so clear it here.
    vi.clearAllMocks()
    stubStoredSettings({}) // hydrate no-op: store keeps the default 360
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('renders the store default (360 minutes) as a valid value', async () => {
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('360')
    expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined()
  })

  it('accepts a valid value, mirrors it into the store, and stages the write', async () => {
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    await wrapper.find('input').setValue('5')
    expect(useSdrStore().recordingMaxDurationMinutes).toBe(5)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'recordingMaxDurationMinutes', 5)
  })

  it('strips non-numeric characters before staging', async () => {
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    await wrapper.find('input').setValue('5a9')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('59')
    expect(useSdrStore().recordingMaxDurationMinutes).toBe(59)
  })

  it('marks 0 invalid and does not stage: a recording needs at least a minute', async () => {
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    await wrapper.find('input').setValue('0')
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(useSdrStore().recordingMaxDurationMinutes).toBe(360)
  })

  it('names the field for assistive tech', async () => {
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    expect(wrapper.find('input').attributes('aria-label')).toBe(
      'Maximum recording length in minutes',
    )
  })

  it('marks an empty value invalid and does not stage', async () => {
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    await wrapper.find('input').setValue('')
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('emits commit on Enter', async () => {
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('hydrates the value from the DB on mount', async () => {
    stubStoredSettings({ recordingMaxDurationMinutes: 12 })
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('12')
    expect(useSdrStore().recordingMaxDurationMinutes).toBe(12)
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    stubStoredSettings({ recordingMaxDurationMinutes: 7 })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('7')
  })

  it('removes the config-uploaded listener on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('sentinel:config-uploaded', expect.any(Function))
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SdrRecordingMaxDurationControl)
    await flushPromises()
    // `region` is a page-level landmark rule (this control always lives inside
    // the Settings panel's landmark) — disabled here. The input's accessible
    // name is provided via `aria-label` (see the template), so every other
    // rule, including `label`, is still asserted.
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
