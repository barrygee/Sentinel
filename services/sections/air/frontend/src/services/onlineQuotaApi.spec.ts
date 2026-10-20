import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchOnlineQuota,
  formatQuotaDuration,
  onlineQuotaWarning,
  ONLINE_QUOTA_URL,
  type OnlineQuota,
} from './onlineQuotaApi'

/**
 * Tests for the online feed's daily call limit as the map and Settings read it.
 *
 * The warning text is what an operator sees before the map silently stops
 * updating, so it must name the feed in use and say what to do.
 */

function quota(overrides: Partial<OnlineQuota> = {}): OnlineQuota {
  return {
    host: 'api.adsb.lol',
    used: 5,
    state: 'ok',
    limit: 500,
    limitSource: 'feed',
    remaining: 495,
    resetsInSeconds: 86_100,
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchOnlineQuota', () => {
  it('reads the figure from the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(quota()) })
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchOnlineQuota()).toEqual(quota())
    expect(fetchMock).toHaveBeenCalledWith(ONLINE_QUOTA_URL)
  })

  it('is null when the backend answers with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }),
    )

    expect(await fetchOnlineQuota()).toBeNull()
  })

  it('is null rather than throwing when the backend is unreachable', async () => {
    // Every caller is a background poll: a rejection would go unhandled.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    expect(await fetchOnlineQuota()).toBeNull()
  })
})

describe('formatQuotaDuration', () => {
  it.each([
    [3 * 3600 + 20 * 60 + 59, '3h 20m'],
    [3600, '1h 0m'],
    [45 * 60, '45m'],
    [59, 'under a minute'],
    [0, 'under a minute'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatQuotaDuration(seconds)).toBe(expected)
  })
})

describe('onlineQuotaWarning', () => {
  it('says nothing without a figure', () => {
    expect(onlineQuotaWarning(null)).toBeNull()
  })

  it('says nothing with calls to spare', () => {
    expect(onlineQuotaWarning(quota())).toBeNull()
  })

  it('says nothing for a feed with no known limit', () => {
    // Counted but not warned about: there is no limit to approach.
    expect(
      onlineQuotaWarning(quota({ state: 'no_limit', limit: null, remaining: null })),
    ).toBeNull()
  })

  it('names the feed and what to do as the limit approaches', () => {
    expect(onlineQuotaWarning(quota({ state: 'approaching', used: 400, remaining: 100 }))).toBe(
      'Online Data Source: 400 of 500 daily calls used. Raise the Online Refresh Interval to make them last.',
    )
  })

  it('says the map stops updating, and until when, once reached', () => {
    expect(
      onlineQuotaWarning(
        quota({ state: 'reached', used: 500, remaining: 0, resetsInSeconds: 8100 }),
      ),
    ).toBe('Online Data Source daily limit reached. Aircraft resume in about 2h 15m.')
  })

  it('names no figure when the feed refuses before the count reaches the limit', () => {
    // The feed also counts calls Sentinel didn't see: "all 500 daily calls
    // used" beside 161 / 500 would read as a bug.
    expect(
      onlineQuotaWarning(
        quota({ state: 'reached', used: 161, remaining: 0, resetsInSeconds: 5 * 3600 + 57 * 60 }),
      ),
    ).toBe('Online Data Source daily limit reached. Aircraft resume in about 5h 57m.')
  })

  it('says the feed refused when its limit is unknown, and leaves out an unknown resume time', () => {
    expect(
      onlineQuotaWarning(
        quota({
          host: 'feed.example',
          state: 'reached',
          limit: null,
          limitSource: null,
          remaining: 0,
          resetsInSeconds: null,
        }),
      ),
    ).toBe('Online Data Source is refusing calls today.')
  })
})
