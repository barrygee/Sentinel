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
  /** Until calls are allowed again (reached), else until the count starts again at 00:00 UTC; null from an older backend. */
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

/** What the map's paused overlay says once the limit is reached. */
export interface OnlineQuotaPause {
  headline: string
  /** When aircraft resume; null when the feed gave no reset time. */
  detail: string | null
}

/**
 * Why the map has paused, or null while it hasn't: only once the daily limit
 * is reached (or the feed refuses calls for the day).
 */
export function onlineQuotaPause(quota: OnlineQuota | null): OnlineQuotaPause | null {
  if (!quota || quota.state !== 'reached') return null
  return {
    headline:
      quota.limit === null
        ? 'Online Data Source is refusing calls today.'
        : 'Online Data Source daily limit reached.',
    detail:
      quota.resetsInSeconds !== null
        ? `Aircraft resume in about ${formatQuotaDuration(quota.resetsInSeconds)}.`
        : null,
  }
}

/**
 * The warning to show as one line, or null when there is none: the map's
 * banner while the limit approaches, and the Settings usage row. Once reached
 * it is the paused overlay's two lines run together, so both say the same.
 */
export function onlineQuotaWarning(quota: OnlineQuota | null): string | null {
  if (quota?.state === 'approaching') {
    return `Online Data Source: ${quota.used} of ${quota.limit} daily calls used. Raise the Online Refresh Interval to make them last.`
  }
  const pause = onlineQuotaPause(quota)
  if (!pause) return null
  return pause.detail ? `${pause.headline} ${pause.detail}` : pause.headline
}
