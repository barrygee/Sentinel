import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ExportAllControl from './ExportAllControl.vue'
import {
  registerConfigExport,
  resetConfigExportsForTests,
} from '@sentinel/shell-api/shell/configExports'

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

  describe("with another service's file registered", () => {
    const EXTRA_FILENAME = 'sdr-manager-local-config.json'
    const EXTRA_CONFIG = { sdr_manager_version: '1', devices: [] }

    /** A directory picker whose writes are recorded by file name. */
    function stubDirectory(): Map<string, string> {
      const written = new Map<string, string>()
      const getFileHandle = vi.fn(async (filename: string) => ({
        createWritable: vi.fn().mockResolvedValue({
          write: vi.fn((content: string) => written.set(filename, content)),
          close: vi.fn(),
        }),
      }))
      ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi
        .fn()
        .mockResolvedValue({ getFileHandle })
      return written
    }

    beforeEach(() => {
      resetConfigExportsForTests()
    })
    afterEach(() => {
      resetConfigExportsForTests()
      vi.useRealTimers()
    })

    it('writes it after Sentinel’s own files, as pretty-printed JSON', async () => {
      vi.useFakeTimers()
      registerConfigExport({ filename: EXTRA_FILENAME, read: async () => EXTRA_CONFIG })
      const written = stubDirectory()
      const wrapper = mount(ExportAllControl)
      await wrapper.find(BUTTON).trigger('click')
      await flushPromises()
      expect([...written.keys()]).toEqual([...EXPECTED_FILENAMES, EXTRA_FILENAME])
      expect(written.get(EXTRA_FILENAME)).toBe(JSON.stringify(EXTRA_CONFIG, null, 2))
      expect(wrapper.find(STATUS).text()).toBe('Exported 4 files')
      // A clean export clears at the success timeout.
      vi.advanceTimersByTime(3000)
      await flushPromises()
      expect(wrapper.find(STATUS).exists()).toBe(false)
    })

    it('skips a file it cannot read, saves the rest, and says why, held as long as an error', async () => {
      vi.useFakeTimers()
      registerConfigExport({
        filename: EXTRA_FILENAME,
        read: () => Promise.reject(new Error('sign in to this machine’s SDR Manager first')),
      })
      const written = stubDirectory()
      const wrapper = mount(ExportAllControl)
      await wrapper.find(BUTTON).trigger('click')
      await flushPromises()
      expect([...written.keys()]).toEqual(EXPECTED_FILENAMES)
      const message = `Exported 3 files — skipped ${EXTRA_FILENAME}: sign in to this machine’s SDR Manager first`
      expect(wrapper.find(STATUS).text()).toBe(message)
      vi.advanceTimersByTime(3000)
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe(message)
      vi.advanceTimersByTime(3000)
      await flushPromises()
      expect(wrapper.find(STATUS).exists()).toBe(false)
    })

    it('names every file it skipped', async () => {
      registerConfigExport({
        filename: 'first.json',
        read: () => Promise.reject(new Error('down')),
      })
      registerConfigExport({
        filename: 'second.json',
        read: () => Promise.reject(new Error('signed out')),
      })
      stubDirectory()
      const wrapper = mount(ExportAllControl)
      await wrapper.find(BUTTON).trigger('click')
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe(
        'Exported 3 files — skipped first.json: down; skipped second.json: signed out',
      )
    })

    it('downloads it too when there is no directory picker, and reports a skip the same way', async () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      registerConfigExport({ filename: EXTRA_FILENAME, read: async () => EXTRA_CONFIG })
      registerConfigExport({
        filename: 'unreadable.json',
        read: () => Promise.reject(new Error('down')),
      })
      const wrapper = mount(ExportAllControl)
      await wrapper.find(BUTTON).trigger('click')
      await flushPromises()
      expect(clickSpy).toHaveBeenCalledTimes(4)
      expect(wrapper.find(STATUS).text()).toBe('Downloaded 4 files — skipped unreadable.json: down')
      clickSpy.mockRestore()
    })

    it('does not read it when Sentinel’s own files fail', async () => {
      stubFetch(false)
      const read = vi.fn().mockResolvedValue(EXTRA_CONFIG)
      registerConfigExport({ filename: EXTRA_FILENAME, read })
      const wrapper = mount(ExportAllControl)
      await wrapper.find(BUTTON).trigger('click')
      await flushPromises()
      expect(read).not.toHaveBeenCalled()
      expect(wrapper.find(STATUS).text()).toContain('Export failed')
    })
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
