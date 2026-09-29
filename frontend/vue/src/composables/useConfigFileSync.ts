import { onBeforeUnmount } from 'vue'
import { getConfigFileStatus } from '@/services/settingsApi'

/** How often the backend is asked whether the config file was edited. */
export const CONFIG_FILE_POLL_INTERVAL_MS = 2000

/**
 * Reloads the app when the live `sentinel_config.json` is edited on disk.
 *
 * The backend applies a saved edit to its settings store and bumps
 * `external_edit_at`; this polls that stamp and, when it moves forward,
 * reloads the page. Settings are hydrated into many stores and controls at
 * startup, so a reload is the one way to guarantee every edited value is what
 * the UI shows — the same thing the Settings panel already does after APPLY
 * CHANGES. The app's own writes never move the stamp, so they never reload.
 *
 * The first successful read only sets the baseline. A stamp that goes
 * backwards (the backend restarted) is adopted as the new baseline too.
 */
export function useConfigFileSync(reload: () => void = () => location.reload()): void {
  let baselineEditAt: number | null = null

  async function checkForExternalEdit(): Promise<void> {
    const status = await getConfigFileStatus()
    if (!status) return
    const editedAt = status.external_edit_at
    if (baselineEditAt !== null && editedAt > baselineEditAt) {
      reload()
      return
    }
    baselineEditAt = editedAt
  }

  void checkForExternalEdit()
  const pollTimer = setInterval(() => void checkForExternalEdit(), CONFIG_FILE_POLL_INTERVAL_MS)
  onBeforeUnmount(() => clearInterval(pollTimer))
}
