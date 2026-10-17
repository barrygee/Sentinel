import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import JsonDataControl from './JsonDataControl.vue'
import { useSettingsStore } from '../stores/settings'
import { FakeJsonCodeEditor, fakeJsonCodeEditorFormat } from '../testing/fakeJsonCodeEditor'

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

const PROPS = { getUrl: '/api/data/get', postUrl: '/api/data/post', filename: 'data.json' }

function mountControl() {
  return mount(JsonDataControl, {
    props: PROPS,
    global: { stubs: { JsonCodeEditor: FakeJsonCodeEditor } },
  })
}

/** Clicks EDIT so the editor (the fake textarea) is on screen, and returns it. */
async function openEditor(wrapper: ReturnType<typeof mountControl>) {
  await wrapper.findAll('.settings-config-btn')[0]!.trigger('click')
  return wrapper.find('textarea')
}

describe('JsonDataControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubFetch({ alpha: 1 })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and pretty-prints the JSON on mount', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(((await openEditor(wrapper)).element as HTMLTextAreaElement).value).toBe(
      '{\n  "alpha": 1\n}',
    )
  })

  it('shows a load failure message', async () => {
    stubFetch({}, false)
    const wrapper = mountControl()
    await flushPromises()
    expect(((await openEditor(wrapper)).element as HTMLTextAreaElement).value).toContain(
      'Failed to load',
    )
  })

  it('shows the editor only after EDIT, and removes it again on HIDE', async () => {
    const wrapper = mountControl()
    await flushPromises()
    const toggleBtn = wrapper.findAll('.settings-config-btn')[0]!
    expect(toggleBtn.text()).toBe('EDIT')
    expect(wrapper.find('textarea').exists()).toBe(false)
    await toggleBtn.trigger('click')
    expect(toggleBtn.text()).toBe('HIDE')
    expect(wrapper.find('textarea').attributes('aria-label')).toBe('Editable JSON data (data.json)')
    await toggleBtn.trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(false)
  })

  it('offers FORMAT only while editing, and it formats the editor', async () => {
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

  it('reloads when the settings panel opens but skips reload while dirty', async () => {
    const fetchMock = stubFetch({ alpha: 1 })
    const wrapper = mountControl()
    await flushPromises()
    const store = useSettingsStore()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Opening the panel triggers a reload.
    store.openPanel()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // After an edit the control is dirty, so a re-open does not reload.
    await (await openEditor(wrapper)).setValue('{"alpha":2}')
    store.closePanel()
    await flushPromises() // let the watcher observe the close (isOpen === false)
    store.openPanel()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stages a valid edit: POSTs and broadcasts a config upload', async () => {
    const uploaded = vi.fn()
    document.addEventListener('sentinel:config-uploaded', uploaded)
    const fetchMock = stubFetch({ alpha: 1 })
    const wrapper = mountControl()
    await flushPromises()
    await (await openEditor(wrapper)).setValue('{"alpha":2}')
    const staged = wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>
    await staged()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/data/post',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(uploaded).toHaveBeenCalled()
    document.removeEventListener('sentinel:config-uploaded', uploaded)
  })

  it('rejects an invalid-JSON edit and shows an error', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await (await openEditor(wrapper)).setValue('{ not json')
    const staged = wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>
    await expect(staged()).rejects.toThrow()
    expect(wrapper.find('.satradio-error').text()).toContain('Invalid JSON')
  })

  it('surfaces a save failure from the backend', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await (await openEditor(wrapper)).setValue('{"alpha":2}')
    stubFetch({ detail: 'rejected' }, false)
    const staged = wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>
    await expect(staged()).rejects.toThrow('rejected')
    expect(wrapper.find('.satradio-error').text()).toContain('Save failed: rejected')
  })

  it('falls back to the status text when the error body is unreadable', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await (await openEditor(wrapper)).setValue('{"alpha":2}')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Server Error',
        json: async () => {
          throw new Error('no body')
        },
      }),
    )
    const staged = wrapper.emitted('stage')!.at(-1)![0] as () => Promise<unknown>
    await expect(staged()).rejects.toThrow('Server Error')
    expect(wrapper.find('.satradio-error').text()).toBe('Save failed: Server Error')
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
    expect(showSaveFilePicker).toHaveBeenCalled()
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
