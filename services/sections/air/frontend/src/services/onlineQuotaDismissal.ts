/**
 * Remembers that the operator closed the online-quota warning on the AIR map,
 * so it stays closed until there is something new to say.
 *
 * A dismissal is keyed on the feed host, the warning level and the UTC day the
 * feed's count belongs to. The banner comes back by itself when any of them
 * changes: the warning gets worse (`approaching` → `reached`), the count starts
 * again at 00:00 UTC, or a different feed is in use. Rising call counts within
 * one level don't bring it back — that is the nagging the × is there to stop.
 *
 * Kept in this browser's localStorage: a per-viewer convenience, not a setting.
 */
import type { OnlineQuota } from './onlineQuotaApi'

export const QUOTA_NOTICE_DISMISSAL_STORAGE_KEY = 'sentinel_air_onlineQuotaNoticeDismissed'

/** The dismissal key for this quota figure, e.g. `api.adsb.lol|approaching|2026-11-11`. */
export function quotaNoticeKey(quota: OnlineQuota, nowMs: number): string {
  const utcDay = new Date(nowMs).toISOString().slice(0, 10)
  return `${quota.host}|${quota.state}|${utcDay}`
}

/** The last dismissed key, or null when none is stored or storage is unavailable. */
export function readDismissedQuotaNotice(): string | null {
  try {
    return localStorage.getItem(QUOTA_NOTICE_DISMISSAL_STORAGE_KEY)
  } catch {
    // Private windows and blocked site data throw; the banner just shows again.
    return null
  }
}

/** Store the dismissed key; a storage failure only means it shows after a reload. */
export function saveDismissedQuotaNotice(key: string): void {
  try {
    localStorage.setItem(QUOTA_NOTICE_DISMISSAL_STORAGE_KEY, key)
  } catch {
    // See readDismissedQuotaNotice: nothing to do without storage.
  }
}
