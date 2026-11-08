import { onBeforeUnmount } from 'vue'
import { getConfigFileStatus } from '@sentinel/shell-api/services/settingsApi'
import { refreshSettingsFromBackend } from '@/shell/applySettings'

/**
 * How often a visible tab asks the backend whether the config file was edited.
 * A hand-edit is applied within this long; seconds of delay don't matter for it.
 */
export const CONFIG_FILE_POLL_INTERVAL_MS = 5000

/**
 * Brings the running app in line when the live `sentinel_config.json` is edited on disk.
 *
 * The backend applies a saved edit to its settings store and bumps
 * `external_edit_at`; this polls that stamp and, when it moves forward,
 * refreshes the app's settings in place (`refreshSettingsFromBackend`: the boot
 * apply again, then every control and store re-reads its own setting) — the
 * same thing APPLY CHANGES does, and no page reload. The app's own writes
 * never move the stamp, so they never trigger it.
 *
 * The first successful read only sets the baseline. A stamp that goes
 * backwards (the backend restarted) is adopted as the new baseline too.
 *
 * Only a visible tab polls: a hidden tab stops, and checks once the moment it
 * is shown again, so an edit made meanwhile still lands before it's seen.
 */
export function useConfigFileSync(
  onExternalEdit: () => unknown = () => refreshSettingsFromBackend(),
): void {
  let baselineEditAt: number | null = null

  async function checkForExternalEdit(): Promise<void> {
    const status = await getConfigFileStatus()
    if (!status) return
    const editedAt = status.external_edit_at
    if (baselineEditAt !== null && editedAt > baselineEditAt) {
      baselineEditAt = editedAt
      onExternalEdit()
      return
    }
    baselineEditAt = editedAt
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null

  function startPolling(): void {
    if (pollTimer !== null) return
    void checkForExternalEdit()
    pollTimer = setInterval(() => void checkForExternalEdit(), CONFIG_FILE_POLL_INTERVAL_MS)
  }

  function stopPolling(): void {
    clearInterval(pollTimer ?? undefined)
    pollTimer = null
  }

  function followTabVisibility(): void {
    if (document.visibilityState === 'hidden') stopPolling()
    else startPolling()
  }

  followTabVisibility()
  document.addEventListener('visibilitychange', followTabVisibility)
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', followTabVisibility)
    stopPolling()
  })
}
