import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrRecordingsFolderControl from './SdrRecordingsFolderControl.vue'
import { useSdrStore } from '../stores/sdr'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

/** Stub the global fetch the sdr store's hydrateRecordingsFolderFromDb uses. */
function stubFetch(payload: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
}

describe('SdrRecordingsFolderControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    stubFetch({}) // hydrate no-op: the store keeps the root ('')
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts empty, saying an empty folder means the recordings root', async () => {
    const wrapper = mount(SdrRecordingsFolderControl)
    await flushPromises()

    const input = wrapper.get('input')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(input.attributes('placeholder')).toBe('Recordings root')
    expect(input.attributes('maxlength')).toBe('200')
    expect(input.attributes('aria-label')).toBe('Recordings folder, inside the recordings root')
  })

  it('hydrates the saved folder from the DB on mount', async () => {
    stubFetch({ recordingsFolder: 'satellites/noaa' })
    const wrapper = mount(SdrRecordingsFolderControl)
    await flushPromises()

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('satellites/noaa')
    expect(useSdrStore().recordingsFolder).toBe('satellites/noaa')
  })

  it('stages a valid folder as sdr.recordingsFolder', async () => {
    const wrapper = mount(SdrRecordingsFolderControl)
    await flushPromises()

    await wrapper.get('input').setValue('satellites/noaa')

    expect(useSdrStore().recordingsFolder).toBe('satellites/noaa')
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'recordingsFolder', 'satellites/noaa')
  })

  it('refuses a folder outside the recordings root, says why, and stages nothing', async () => {
    const wrapper = mount(SdrRecordingsFolderControl)
    await flushPromises()

    await wrapper.get('input').setValue('../escape')

    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('[role="alert"]').text()).toBe('Folder names cannot be . or ..')
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(useSdrStore().recordingsFolder).toBe('')
  })

  it('emits commit on Enter', async () => {
    const wrapper = mount(SdrRecordingsFolderControl)
    await flushPromises()

    await wrapper.get('input').trigger('keydown.enter')

    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('has no accessibility violations, valid or refused', async () => {
    const wrapper = mount(SdrRecordingsFolderControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()

    await wrapper.get('input').setValue('/etc')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
