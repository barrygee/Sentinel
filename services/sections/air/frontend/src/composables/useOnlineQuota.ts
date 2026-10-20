import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveSectionMode } from '@sentinel/shell-api/utils/sourceMode'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { fetchOnlineQuota, type OnlineQuota } from '../services/onlineQuotaApi'

/** How often the figure is refreshed while a component shows it. */
export const ONLINE_QUOTA_POLL_INTERVAL_MS = 30_000

/**
 * The online ADS-B feed's daily quota, kept current while the calling
 * component is mounted and AIR is in online mode.
 *
 * Off grid the aircraft come from the local decoder, which has no quota, so
 * nothing is polled and `quota` is null. The endpoint never calls the feed
 * itself, so polling it costs no quota.
 */
export function useOnlineQuota() {
  const appStore = useAppStore()
  const settingsStore = useSettingsStore()
  const quota = ref<OnlineQuota | null>(null)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  // AIR's own source override wins over the app-wide mode, as in the backend.
  const isOnline = computed(
    () =>
      resolveSectionMode(
        settingsStore.getSetting<unknown>('air', 'sourceOverride', null),
        appStore.connectivityMode,
      ) === 'online',
  )

  async function refresh(): Promise<void> {
    quota.value = await fetchOnlineQuota()
  }

  function stopPolling(): void {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }

  // Runs on mount and whenever the mode flips, so polling never starts twice:
  // it starts only when no timer exists (mounting, or turning online).
  function syncPolling(): void {
    if (!isOnline.value) {
      stopPolling()
      quota.value = null
      return
    }
    void refresh()
    pollTimer = setInterval(() => void refresh(), ONLINE_QUOTA_POLL_INTERVAL_MS)
  }

  watch(isOnline, syncPolling)
  onMounted(syncPolling)
  onBeforeUnmount(stopPolling)

  return { quota, refresh }
}
