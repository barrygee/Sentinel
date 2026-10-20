/**
 * Typed client for `GET /api/air/adsb/online-quota` — how much of the online
 * ADS-B feed's daily call limit Sentinel has used, for the feed in use.
 *
 * The backend counts per feed host and answers from its own count, never
 * calling the feed, so this is free to poll. Errors resolve to null rather
 * than throwing: every caller is a background poll with nobody to catch an
 * exception, and a missing figure just means nothing to show.
 */

/**
 * `approaching` past 80% used; `reached` with nothing left (or the feed
 * refusing calls for the day); `no_limit` when the feed has no known daily
 * limit, so calls are counted but nothing warns.
 */
export type OnlineQuotaState = 'ok' | 'approaching' | 'reached' | 'no_limit'

/** Where the limit came from: Settings › AIR › Daily Call Limit, the feed's own header, or the default feed's built-in figure. */
export type OnlineQuotaLimitSource = 'setting' | 'feed' | 'default'

/** One feed's daily call limit as the backend reports it. */
export interface OnlineQuota {
  /** The feed's host, e.g. `api.adsb.lol`. */
  host: string
  used: number
  state: OnlineQuotaState
  /** Null when the feed has no known daily limit. */
  limit: number | null
  limitSource: OnlineQuotaLimitSource | null
  remaining: number | null
  /** Until calls are allowed again (reached), else until the oldest counted call drops out; null with none counted. */
  resetsInSeconds: number | null
}

export const ONLINE_QUOTA_URL = '/api/air/adsb/online-quota'

/** The current figure, or null when the backend can't be reached. */
export async function fetchOnlineQuota(): Promise<OnlineQuota | null> {
  try {
    const response = await fetch(ONLINE_QUOTA_URL)
    if (!response.ok) return null
    return (await response.json()) as OnlineQuota
  } catch {
    return null
  }
}

/** `3h 20m`, `45m`, `under a minute`. */
export function formatQuotaDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  return minutes ? `${minutes}m` : 'under a minute'
}

/**
 * The warning to show, or null when there is none. Shared by the map banner
 * and the Settings usage row so both say the same thing.
 */
export function onlineQuotaWarning(quota: OnlineQuota | null): string | null {
  if (!quota || quota.state === 'ok' || quota.state === 'no_limit') return null
  if (quota.state === 'approaching') {
    return `${quota.host} daily call limit running low: ${quota.used} of ${quota.limit} calls used. Raise the Online Refresh Interval in Settings › AIR to make the rest last.`
  }
  const resume =
    quota.resetsInSeconds !== null
      ? ` Calls resume in about ${formatQuotaDuration(quota.resetsInSeconds)}.`
      : ''
  const spent =
    quota.limit !== null ? `all ${quota.limit} daily calls used` : 'it is refusing calls for today'
  return `${quota.host} daily call limit reached: ${spent}, so aircraft won't update.${resume}`
}
