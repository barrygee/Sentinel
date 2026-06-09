import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import ConfigCurrentControl from './ConfigCurrentControl.vue'
import { useSettingsStore } from '@/stores/settings'

const LOCATION_LS_KEY = 'sentinel_user_location'
const SS_KEY = 'sentinel_config_preview_visible'

function stubFetch(payload: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: 500,
    statusText: 'Server Error',
    json: async () => payload,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ConfigCurrentControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubFetch({ app: { location: { latitude: 51, longitude: 0 } } })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and pretty-prints the live config on mount', async () => {
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain('"latitude"')
  })

  it('shows a load failure message', async () => {
    stubFetch({}, false)
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain(
      'Failed to load config',
    )
  })

  it('restores the visible state from sessionStorage and persists toggles', async () => {
    sessionStorage.setItem(SS_KEY, '1')
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    expect(wrapper.find('textarea').classes()).not.toContain('settings-config-preview--hidden')
    await wrapper.findAll('.settings-config-btn')[0]!.trigger('click')
    expect(sessionStorage.getItem(SS_KEY)).toBe('0')
  })

  it('persists the visible state when toggled on', async () => {
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    expect(wrapper.find('textarea').classes()).toContain('settings-config-preview--hidden')
    await wrapper.findAll('.settings-config-btn')[0]!.trigger('click')
    expect(sessionStorage.getItem(SS_KEY)).toBe('1')
  })

  it('reloads on panel open and skips reload while dirty', async () => {
    const fetchMock = stubFetch({ app: {} })
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    const store = useSettingsStore()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    store.openPanel()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await wrapper.find('textarea').setValue('{}')
    store.closePanel()
    await flushPromises()
    store.openPanel()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uploads a valid config and keeps a valid location', async () => {
    const uploaded = vi.fn()
    document.addEventListener('sentinel:config-uploaded', uploaded)
    localStorage.setItem(LOCATION_LS_KEY, JSON.stringify({ latitude: 51, longitude: 0 }))
    const fetchMock = stubFetch({})
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    await wrapper.find('textarea').setValue('{"app":{"location":{"latitude":51,"longitude":0}}}')
    const staged = wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>
    await staged()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/config/upload',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(localStorage.getItem(LOCATION_LS_KEY)).not.toBeNull()
    expect(uploaded).toHaveBeenCalled()
    document.removeEventListener('sentinel:config-uploaded', uploaded)
  })

  it('clears the cached location when the config has no location', async () => {
    localStorage.setItem(LOCATION_LS_KEY, JSON.stringify({ latitude: 51, longitude: 0 }))
    stubFetch({})
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    await wrapper.find('textarea').setValue('{"app":{}}')
    await (wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>)()
    expect(localStorage.getItem(LOCATION_LS_KEY)).toBeNull()
  })

  it('clears the cached location when the config location is invalid', async () => {
    localStorage.setItem(LOCATION_LS_KEY, JSON.stringify({ latitude: 51, longitude: 0 }))
    stubFetch({})
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    await wrapper.find('textarea').setValue('{"app":{"location":{"latitude":"","longitude":""}}}')
    await (wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>)()
    expect(localStorage.getItem(LOCATION_LS_KEY)).toBeNull()
  })

  it('does not broadcast a config upload when the POST fails', async () => {
    const uploaded = vi.fn()
    document.addEventListener('sentinel:config-uploaded', uploaded)
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    await wrapper.find('textarea').setValue('{"app":{}}')
    stubFetch({}, false)
    await (wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>)()
    expect(uploaded).not.toHaveBeenCalled()
    document.removeEventListener('sentinel:config-uploaded', uploaded)
  })

  it('throws from the staged callback for invalid JSON', async () => {
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    await wrapper.find('textarea').setValue('{ not json')
    const staged = wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>
    expect(() => staged()).toThrow()
  })

  it('indents at the caret on Tab', async () => {
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    const textarea = wrapper.find('textarea')
    const element = textarea.element as HTMLTextAreaElement
    element.value = 'abc'
    element.selectionStart = element.selectionEnd = 0
    await textarea.trigger('keydown.tab')
    expect(element.value).toBe('  abc')
  })

  it('indents a multi-line selection on Tab', async () => {
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    const textarea = wrapper.find('textarea')
    const element = textarea.element as HTMLTextAreaElement
    element.value = 'a\nb'
    element.selectionStart = 0
    element.selectionEnd = 3
    await textarea.trigger('keydown.tab')
    expect(element.value).toBe('  a\n  b')
  })

  it('outdents a single line on Shift+Tab', async () => {
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    const textarea = wrapper.find('textarea')
    const element = textarea.element as HTMLTextAreaElement
    element.value = '  a'
    element.selectionStart = 0
    element.selectionEnd = 3
    await textarea.trigger('keydown.tab', { shiftKey: true })
    expect(element.value).toBe('a')
  })

  it('outdents a multi-line selection on Shift+Tab', async () => {
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    const textarea = wrapper.find('textarea')
    const element = textarea.element as HTMLTextAreaElement
    element.value = '  a\n  b'
    element.selectionStart = 0
    element.selectionEnd = 7
    await textarea.trigger('keydown.tab', { shiftKey: true })
    expect(element.value).toBe('a\nb')
  })

  it('exports via the File System Access API when available', async () => {
    const write = vi.fn()
    const close = vi.fn()
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    })
    ;(window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = showSaveFilePicker
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    await wrapper.findAll('.settings-config-btn')[1]!.trigger('click')
    await flushPromises()
    expect(write).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })

  it('aborts the export silently when the picker is cancelled', async () => {
    const showSaveFilePicker = vi
      .fn()
      .mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    ;(window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = showSaveFilePicker
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    await wrapper.findAll('.settings-config-btn')[1]!.trigger('click')
    await flushPromises()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })

  it('falls back to a download when the picker throws a non-abort error', async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(new Error('boom'))
    ;(window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = showSaveFilePicker
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    await wrapper.findAll('.settings-config-btn')[1]!.trigger('click')
    await flushPromises()
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })

  it('downloads via a blob when the File System Access API is unavailable', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    await wrapper.findAll('.settings-config-btn')[1]!.trigger('click')
    await flushPromises()
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(ConfigCurrentControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false }, label: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
