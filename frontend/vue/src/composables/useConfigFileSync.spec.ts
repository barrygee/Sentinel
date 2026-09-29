import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { CONFIG_FILE_POLL_INTERVAL_MS, useConfigFileSync } from './useConfigFileSync'

vi.mock('@/services/settingsApi', () => ({ getConfigFileStatus: vi.fn() }))
import { getConfigFileStatus } from '@/services/settingsApi'

function status(externalEditAt: number) {
  return {
    path: '/app/backend/data/sentinel_config.json',
    syncing: true,
    external_edit_at: externalEditAt,
  }
}

/** Mount a component using the composable; no `reload` means its default. */
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

  it('takes the first reading as the baseline without reloading', async () => {
    vi.mocked(getConfigFileStatus).mockResolvedValue(status(1000))
    const reload = vi.fn()
    const wrapper = mountSync(reload)
    await flushPromises()
    await nextPoll()
    expect(getConfigFileStatus).toHaveBeenCalledTimes(2)
    expect(reload).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reloads once the file is edited after the baseline', async () => {
    vi.mocked(getConfigFileStatus).mockResolvedValueOnce(status(0)).mockResolvedValue(status(5000))
    const reload = vi.fn()
    const wrapper = mountSync(reload)
    await flushPromises()
    await nextPoll()
    expect(reload).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('adopts a stamp that went backwards (backend restart) instead of reloading', async () => {
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

  it('reloads the page by default', async () => {
    vi.mocked(getConfigFileStatus).mockResolvedValueOnce(status(0)).mockResolvedValue(status(9000))
    const reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })
    const wrapper = mountSync()
    await flushPromises()
    await nextPoll()
    expect(reloadSpy).toHaveBeenCalledOnce()
    wrapper.unmount()
    vi.unstubAllGlobals()
  })
})
