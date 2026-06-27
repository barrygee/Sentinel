import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ExportAllControl from './ExportAllControl.vue'

const BUTTON = '.settings-config-btn'
const STATUS = '.settings-export-all-status'

// Each config EXPORT ALL writes; the order matters because the directory-write
// test asserts the filenames are produced in this sequence.
const EXPECTED_FILENAMES = ['sentinel_config.json', 'sdr_frequencies.json', 'sdr_bandplan.json']

function stubFetch(ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: 500,
    json: async () => ({ some: 'config' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ExportAllControl', () => {
  beforeEach(() => {
    stubFetch()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
  })

  it('lists each exported file with its filename and description', () => {
    const wrapper = mount(ExportAllControl)
    const items = wrapper.findAll('.settings-export-all-files li')
    expect(items.map((node) => node.find('code').text())).toEqual(EXPECTED_FILENAMES)
    expect(items[0]!.text()).toContain('all app settings')
  })

  it('exports every config into the chosen directory in order', async () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const close = vi.fn()
    const getFileHandle = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    })
    const showDirectoryPicker = vi.fn().mockResolvedValue({ getFileHandle })
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker =
      showDirectoryPicker
    const wrapper = mount(ExportAllControl)
    await wrapper.find(BUTTON).trigger('click')
    await flushPromises()
    expect(getFileHandle.mock.calls.map((call) => call[0])).toEqual(EXPECTED_FILENAMES)
    expect(getFileHandle).toHaveBeenCalledWith(expect.any(String), { create: true })
    expect(write).toHaveBeenCalledTimes(3)
    expect(close).toHaveBeenCalledTimes(3)
    expect(wrapper.find(STATUS).text()).toBe('Exported 3 files')
    // The success status clears itself after its timeout.
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(wrapper.find(STATUS).exists()).toBe(false)
    vi.useRealTimers()
  })

  it('writes each fetched config as pretty-printed JSON', async () => {
    const write = vi.fn()
    const getFileHandle = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close: vi.fn() }),
    })
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi
      .fn()
      .mockResolvedValue({ getFileHandle })
    const wrapper = mount(ExportAllControl)
    await wrapper.find(BUTTON).trigger('click')
    await flushPromises()
    expect(write).toHaveBeenCalledWith(JSON.stringify({ some: 'config' }, null, 2))
  })

  it('stays silent when the directory picker is cancelled', async () => {
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    const wrapper = mount(ExportAllControl)
    await wrapper.find(BUTTON).trigger('click')
    await flushPromises()
    expect(wrapper.find(STATUS).exists()).toBe(false)
  })

  it('reports an error and holds it longer when writing the directory fails', async () => {
    vi.useFakeTimers()
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi
      .fn()
      .mockResolvedValue({ getFileHandle: vi.fn().mockRejectedValue(new Error('disk full')) })
    const wrapper = mount(ExportAllControl)
    await wrapper.find(BUTTON).trigger('click')
    await flushPromises()
    expect(wrapper.find(STATUS).text()).toBe('Export failed: disk full')
    // Still present at the success-timeout boundary, cleared only after the
    // longer error timeout.
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(wrapper.find(STATUS).text()).toBe('Export failed: disk full')
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(wrapper.find(STATUS).exists()).toBe(false)
    vi.useRealTimers()
  })

  it('falls back to per-file downloads when no directory picker is available', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mount(ExportAllControl)
    await wrapper.find(BUTTON).trigger('click')
    await flushPromises()
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3)
    expect(clickSpy).toHaveBeenCalledTimes(3)
    expect(wrapper.find(STATUS).text()).toBe('Downloaded 3 files')
    clickSpy.mockRestore()
  })

  it('reports an error and writes nothing when a config fetch fails', async () => {
    stubFetch(false)
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mount(ExportAllControl)
    await wrapper.find(BUTTON).trigger('click')
    await flushPromises()
    expect(clickSpy).not.toHaveBeenCalled()
    expect(wrapper.find(STATUS).text()).toContain('Export failed')
    clickSpy.mockRestore()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(ExportAllControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
