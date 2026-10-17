import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enableAutoUnmount, mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import ConfigCurrentControl from './ConfigCurrentControl.vue'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import {
  FakeJsonCodeEditor,
  fakeJsonCodeEditorFormat,
} from '@sentinel/shell-api/testing/fakeJsonCodeEditor'

// Every mount registers a document listener; unmount so earlier tests' instances
// cannot answer a later test's event.
enableAutoUnmount(afterEach)

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

/** Mounts the control with the editor swapped for a plain textarea (Monaco can't run in jsdom). */
function mountControl() {
  return mount(ConfigCurrentControl, {
    global: { stubs: { JsonCodeEditor: FakeJsonCodeEditor } },
  })
}

/** Clicks EDIT so the editor (the fake textarea) is on screen, and returns it. */
async function openEditor(wrapper: ReturnType<typeof mountControl>) {
  await wrapper.findAll('.settings-config-btn')[0]!.trigger('click')
  await flushPromises()
  return wrapper.find('textarea')
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
    const wrapper = mountControl()
    await flushPromises()
    const editor = await openEditor(wrapper)
    expect((editor.element as HTMLTextAreaElement).value).toContain('"latitude"')
    expect(editor.attributes('aria-label')).toBe('Editable app configuration JSON')
  })

  it('shows a load failure message', async () => {
    stubFetch({}, false)
    const wrapper = mountControl()
    await flushPromises()
    expect(((await openEditor(wrapper)).element as HTMLTextAreaElement).value).toContain(
      'Failed to load config',
    )
  })

  it('restores the visible state from sessionStorage and persists toggles', async () => {
    sessionStorage.setItem(SS_KEY, '1')
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('textarea').exists()).toBe(true)
    await wrapper.findAll('.settings-config-btn')[0]!.trigger('click')
    expect(sessionStorage.getItem(SS_KEY)).toBe('0')
  })

  it('persists the visible state when toggled on', async () => {
    sessionStorage.removeItem(SS_KEY)
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('textarea').exists()).toBe(false)
    await wrapper.findAll('.settings-config-btn')[0]!.trigger('click')
    expect(sessionStorage.getItem(SS_KEY)).toBe('1')
  })

  it('reloads on panel open and skips reload while dirty', async () => {
    sessionStorage.removeItem(SS_KEY)
    const fetchMock = stubFetch({ app: {} })
    const wrapper = mountControl()
    await flushPromises()
    const store = useSettingsStore()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    store.openPanel()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Opening the editor reads the config once more; editing then makes it dirty.
    const editor = await openEditor(wrapper)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await editor.setValue('{}')
    store.closePanel()
    await flushPromises()
    store.openPanel()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('refetches the config when another control announces a settings change', async () => {
    const fetchMock = stubFetch({ app: {} })
    mountControl()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new CustomEvent('sentinel:settings-changed'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps unsaved JSON edits when a settings change is announced', async () => {
    const fetchMock = stubFetch({ app: {} })
    const wrapper = mountControl()
    await flushPromises()
    const editor = await openEditor(wrapper)
    const callsBeforeEdit = fetchMock.mock.calls.length
    await editor.setValue('{"app": {"edited": true}}')
    document.dispatchEvent(new CustomEvent('sentinel:settings-changed'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeEdit)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain('"edited"')
  })

  it('stops refetching on settings changes once unmounted', async () => {
    const fetchMock = stubFetch({ app: {} })
    const wrapper = mountControl()
    await flushPromises()
    wrapper.unmount()
    document.dispatchEvent(new CustomEvent('sentinel:settings-changed'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refetches the config when the editor is revealed, but not when hidden', async () => {
    const fetchMock = stubFetch({ app: {} })
    const wrapper = mountControl()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await wrapper.findAll('.settings-config-btn')[0]!.trigger('click') // EDIT → shown
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await wrapper.findAll('.settings-config-btn')[0]!.trigger('click') // HIDE
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uploads a valid config and keeps a valid location', async () => {
    const uploaded = vi.fn()
    document.addEventListener('sentinel:config-uploaded', uploaded)
    localStorage.setItem(LOCATION_LS_KEY, JSON.stringify({ latitude: 51, longitude: 0 }))
    const fetchMock = stubFetch({})
    const wrapper = mountControl()
    await flushPromises()
    await (await openEditor(wrapper)).setValue('{"app":{"location":{"latitude":51,"longitude":0}}}')
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
    const wrapper = mountControl()
    await flushPromises()
    await (await openEditor(wrapper)).setValue('{"app":{}}')
    await (wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>)()
    expect(localStorage.getItem(LOCATION_LS_KEY)).toBeNull()
  })

  it('clears the cached location when the config location is invalid', async () => {
    localStorage.setItem(LOCATION_LS_KEY, JSON.stringify({ latitude: 51, longitude: 0 }))
    stubFetch({})
    const wrapper = mountControl()
    await flushPromises()
    await (
      await openEditor(wrapper)
    ).setValue('{"app":{"location":{"latitude":"","longitude":""}}}')
    await (wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>)()
    expect(localStorage.getItem(LOCATION_LS_KEY)).toBeNull()
  })

  it('does not broadcast a config upload when the POST fails', async () => {
    const uploaded = vi.fn()
    document.addEventListener('sentinel:config-uploaded', uploaded)
    const wrapper = mountControl()
    await flushPromises()
    await (await openEditor(wrapper)).setValue('{"app":{}}')
    stubFetch({}, false)
    await (wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>)()
    expect(uploaded).not.toHaveBeenCalled()
    document.removeEventListener('sentinel:config-uploaded', uploaded)
  })

  it('throws from the staged callback for invalid JSON', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await (await openEditor(wrapper)).setValue('{ not json')
    const staged = wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>
    expect(() => staged()).toThrow()
  })

  it('offers FORMAT only while editing, and it formats the editor', async () => {
    sessionStorage.removeItem(SS_KEY)
    fakeJsonCodeEditorFormat.mockClear()
    const wrapper = mountControl()
    await flushPromises()
    const labels = () => wrapper.findAll('.settings-config-btn').map((button) => button.text())
    expect(labels()).toEqual(['EDIT', 'EXPORT'])
    await openEditor(wrapper)
    expect(labels()).toEqual(['HIDE', 'FORMAT', 'EXPORT'])
    await wrapper.findAll('.settings-config-btn')[1]!.trigger('click')
    expect(fakeJsonCodeEditorFormat).toHaveBeenCalledTimes(1)
  })

  it('exports via the File System Access API when available', async () => {
    const write = vi.fn()
    const close = vi.fn()
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    })
    ;(window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = showSaveFilePicker
    const wrapper = mountControl()
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
    const wrapper = mountControl()
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
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.findAll('.settings-config-btn')[1]!.trigger('click')
    await flushPromises()
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })

  it('downloads via a blob when the File System Access API is unavailable', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.findAll('.settings-config-btn')[1]!.trigger('click')
    await flushPromises()
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
  })

  it('has no accessibility violations, closed or editing', async () => {
    sessionStorage.removeItem(SS_KEY)
    const wrapper = mountControl()
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
    await openEditor(wrapper)
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
