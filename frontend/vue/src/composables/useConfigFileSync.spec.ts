import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { CONFIG_FILE_POLL_INTERVAL_MS, useConfigFileSync } from './useConfigFileSync'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({ getConfigFileStatus: vi.fn() }))
import { getConfigFileStatus } from '@sentinel/shell-api/services/settingsApi'
const refreshSettings = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/shell/applySettings', () => ({ refreshSettingsFromBackend: refreshSettings }))

function status(externalEditAt: number) {
  return {
    path: '/app/backend/data/sentinel_config.json',
    syncing: true,
    external_edit_at: externalEditAt,
  }
}

/** Mount a component using the composable; no handler means its default (refresh in place). */
function mountSync(reload?: () => void) {
  const Harness = defineComponent({
    setup() {
      if (reload) useConfigFileSync(reload)
      else useConfigFileSync()
      return () => h('div')
    },
  })
  return mount(Harness)
}

/** Advance one poll and let its request settle. */
async function nextPoll(): Promise<void> {
  await vi.advanceTimersByTimeAsync(CONFIG_FILE_POLL_INTERVAL_MS)
  await flushPromises()
}

describe('useConfigFileSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(getConfigFileStatus).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('takes the first reading as the baseline without acting', async () => {
    vi.mocked(getConfigFileStatus).mockResolvedValue(status(1000))
    const reload = vi.fn()
    const wrapper = mountSync(reload)
    await flushPromises()
    await nextPoll()
    expect(getConfigFileStatus).toHaveBeenCalledTimes(2)
    expect(reload).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('acts once the file is edited after the baseline', async () => {
    vi.mocked(getConfigFileStatus).mockResolvedValueOnce(status(0)).mockResolvedValue(status(5000))
    const reload = vi.fn()
    const wrapper = mountSync(reload)
    await flushPromises()
    await nextPoll()
    expect(reload).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('adopts a stamp that went backwards (backend restart) instead of acting', async () => {
    vi.mocked(getConfigFileStatus)
      .mockResolvedValueOnce(status(5000))
      .mockResolvedValueOnce(status(0))
      .mockResolvedValue(status(0))
    const reload = vi.fn()
    const wrapper = mountSync(reload)
    await flushPromises()
    await nextPoll()
    await nextPoll()
    expect(reload).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignores polls the backend could not answer', async () => {
    vi.mocked(getConfigFileStatus)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(status(7000))
      .mockResolvedValue(status(7000))
    const reload = vi.fn()
    const wrapper = mountSync(reload)
    await flushPromises()
    await nextPoll()
    await nextPoll()
    // The first *answered* poll is the baseline, so an unchanged stamp never reloads.
    expect(reload).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('stops polling on unmount', async () => {
    vi.mocked(getConfigFileStatus).mockResolvedValue(status(0))
    const wrapper = mountSync(vi.fn())
    await flushPromises()
    wrapper.unmount()
    const callsAtUnmount = vi.mocked(getConfigFileStatus).mock.calls.length
    await nextPoll()
    expect(getConfigFileStatus).toHaveBeenCalledTimes(callsAtUnmount)
  })

  it('refreshes the settings in place by default, never reloading the page', async () => {
    vi.mocked(getConfigFileStatus).mockResolvedValueOnce(status(0)).mockResolvedValue(status(9000))
    refreshSettings.mockClear()
    const reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })
    const wrapper = mountSync()
    await flushPromises()
    await nextPoll()
    expect(refreshSettings).toHaveBeenCalledOnce()
    expect(reloadSpy).not.toHaveBeenCalled()
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('acts once per edit: the stamp it acted on becomes the baseline', async () => {
    // A reload used to reset the baseline; refreshing in place must advance it,
    // or every later poll would see the same edit again.
    vi.mocked(getConfigFileStatus)
      .mockResolvedValueOnce(status(0))
      .mockResolvedValueOnce(status(5000))
      .mockResolvedValueOnce(status(5000))
      .mockResolvedValue(status(8000))
    const onEdit = vi.fn()
    const wrapper = mountSync(onEdit)
    await flushPromises()
    await nextPoll()
    expect(onEdit).toHaveBeenCalledTimes(1)
    await nextPoll()
    expect(onEdit).toHaveBeenCalledTimes(1)
    await nextPoll()
    expect(onEdit).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})

/** Make the document report `visibility` and tell listeners, as the browser does on a tab switch. */
function setTabVisibility(visibility: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useConfigFileSync tab visibility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(getConfigFileStatus).mockReset()
    vi.mocked(getConfigFileStatus).mockResolvedValue(status(0))
  })

  afterEach(() => {
    // Drop the own-property override so jsdom's real getter shows through again.
    Reflect.deleteProperty(document, 'visibilityState')
    vi.useRealTimers()
  })

  it('polls a visible tab every 5 seconds, not faster', async () => {
    const wrapper = mountSync(vi.fn())
    await flushPromises()
    expect(getConfigFileStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4999)
    expect(getConfigFileStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(getConfigFileStatus).toHaveBeenCalledTimes(2)
    expect(CONFIG_FILE_POLL_INTERVAL_MS).toBe(5000)
    wrapper.unmount()
  })

  it('never polls a tab that opens hidden', async () => {
    setTabVisibility('hidden')
    const wrapper = mountSync(vi.fn())
    await flushPromises()
    await vi.advanceTimersByTimeAsync(CONFIG_FILE_POLL_INTERVAL_MS * 3)
    expect(getConfigFileStatus).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('stops polling once the tab is hidden', async () => {
    const wrapper = mountSync(vi.fn())
    await flushPromises()
    setTabVisibility('hidden')
    const callsWhenHidden = vi.mocked(getConfigFileStatus).mock.calls.length
    await vi.advanceTimersByTimeAsync(CONFIG_FILE_POLL_INTERVAL_MS * 3)
    expect(getConfigFileStatus).toHaveBeenCalledTimes(callsWhenHidden)
    wrapper.unmount()
  })

  it('checks at once when a hidden tab is shown, then resumes the 5 s poll', async () => {
    const wrapper = mountSync(vi.fn())
    await flushPromises()
    setTabVisibility('hidden')
    await vi.advanceTimersByTimeAsync(CONFIG_FILE_POLL_INTERVAL_MS * 2)
    const callsBeforeShown = vi.mocked(getConfigFileStatus).mock.calls.length
    setTabVisibility('visible')
    // The check is immediate: no timer has advanced since the tab was shown.
    expect(getConfigFileStatus).toHaveBeenCalledTimes(callsBeforeShown + 1)
    await nextPoll()
    expect(getConfigFileStatus).toHaveBeenCalledTimes(callsBeforeShown + 2)
    wrapper.unmount()
  })

  it('applies an edit made while the tab was hidden as soon as it is shown', async () => {
    const onEdit = vi.fn()
    const wrapper = mountSync(onEdit)
    await flushPromises()
    setTabVisibility('hidden')
    vi.mocked(getConfigFileStatus).mockResolvedValue(status(6000))
    await vi.advanceTimersByTimeAsync(CONFIG_FILE_POLL_INTERVAL_MS * 2)
    expect(onEdit).not.toHaveBeenCalled()
    setTabVisibility('visible')
    await flushPromises()
    expect(onEdit).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('does not start a second poll when told the tab is visible again', async () => {
    const wrapper = mountSync(vi.fn())
    await flushPromises()
    setTabVisibility('visible')
    // No extra immediate check, and still one request per interval, not two.
    expect(getConfigFileStatus).toHaveBeenCalledTimes(1)
    await nextPoll()
    expect(getConfigFileStatus).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('treats a repeated hidden event as a no-op and still resumes when shown', async () => {
    const wrapper = mountSync(vi.fn())
    await flushPromises()
    setTabVisibility('hidden')
    setTabVisibility('hidden')
    await vi.advanceTimersByTimeAsync(CONFIG_FILE_POLL_INTERVAL_MS * 2)
    expect(getConfigFileStatus).toHaveBeenCalledTimes(1)
    setTabVisibility('visible')
    expect(getConfigFileStatus).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('stops following tab visibility after unmount', async () => {
    setTabVisibility('hidden')
    const wrapper = mountSync(vi.fn())
    await flushPromises()
    wrapper.unmount()
    // A listener left behind would restart polling here.
    setTabVisibility('visible')
    await vi.advanceTimersByTimeAsync(CONFIG_FILE_POLL_INTERVAL_MS * 2)
    expect(getConfigFileStatus).not.toHaveBeenCalled()
  })
})
