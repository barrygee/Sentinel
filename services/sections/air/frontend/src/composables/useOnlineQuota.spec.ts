import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'

import { ONLINE_QUOTA_POLL_INTERVAL_MS, useOnlineQuota } from './useOnlineQuota'
import * as onlineQuotaApi from '../services/onlineQuotaApi'

/**
 * Tests for keeping the online feed's daily call figure current while it is
 * on screen — and for leaving it alone off grid, where there is no limit.
 */

const FIGURE: onlineQuotaApi.OnlineQuota = {
  host: 'api.adsb.lol',
  used: 5,
  state: 'ok',
  limit: 500,
  limitSource: 'feed',
  remaining: 495,
  resetsInSeconds: 86_100,
}

/** Mount the composable in a throwaway component so its lifecycle hooks run. */
function mountQuota() {
  const harness = defineComponent({
    setup() {
      return { quotaState: useOnlineQuota() }
    },
    template: '<div />',
  })
  return mount(harness)
}

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  useAppStore().setConnectivityMode('online')
  fetchSpy = vi.spyOn(onlineQuotaApi, 'fetchOnlineQuota').mockResolvedValue(FIGURE)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useOnlineQuota', () => {
  it('fetches the figure as soon as it is shown', async () => {
    const wrapper = mountQuota()
    await flushPromises()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.quotaState.quota.value).toEqual(FIGURE)
  })

  it('keeps it current while it is shown', async () => {
    mountQuota()
    await flushPromises()

    await vi.advanceTimersByTimeAsync(ONLINE_QUOTA_POLL_INTERVAL_MS)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(ONLINE_QUOTA_POLL_INTERVAL_MS)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('stops polling once it is no longer shown', async () => {
    const wrapper = mountQuota()
    await flushPromises()
    wrapper.unmount()

    await vi.advanceTimersByTimeAsync(ONLINE_QUOTA_POLL_INTERVAL_MS * 3)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('polls nothing off grid, where the local decoder has no limit', async () => {
    useAppStore().setConnectivityMode('offgrid')
    const wrapper = mountQuota()
    await vi.advanceTimersByTimeAsync(ONLINE_QUOTA_POLL_INTERVAL_MS * 2)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(wrapper.vm.quotaState.quota.value).toBeNull()
    wrapper.unmount()
  })

  it("follows AIR's own source override over the app-wide mode", async () => {
    useSettingsStore().setSetting('air', 'sourceOverride', 'offgrid')
    mountQuota()
    await flushPromises()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('stops and clears the figure on switching to off grid, and resumes on switching back', async () => {
    const wrapper = mountQuota()
    await flushPromises()

    useAppStore().setConnectivityMode('offgrid')
    await nextTick()
    expect(wrapper.vm.quotaState.quota.value).toBeNull()
    await vi.advanceTimersByTimeAsync(ONLINE_QUOTA_POLL_INTERVAL_MS * 2)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    useAppStore().setConnectivityMode('online')
    await flushPromises()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.vm.quotaState.quota.value).toEqual(FIGURE)
    await vi.advanceTimersByTimeAsync(ONLINE_QUOTA_POLL_INTERVAL_MS)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('refreshes on demand', async () => {
    const wrapper = mountQuota()
    await flushPromises()
    fetchSpy.mockResolvedValueOnce({ ...FIGURE, used: 6, remaining: 494 })

    await wrapper.vm.quotaState.refresh()

    expect(wrapper.vm.quotaState.quota.value?.used).toBe(6)
  })
})
