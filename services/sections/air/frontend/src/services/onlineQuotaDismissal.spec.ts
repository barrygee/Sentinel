import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  QUOTA_NOTICE_DISMISSAL_STORAGE_KEY,
  quotaNoticeKey,
  readDismissedQuotaNotice,
  saveDismissedQuotaNotice,
} from './onlineQuotaDismissal'
import type { OnlineQuota } from './onlineQuotaApi'

function figure(overrides: Partial<OnlineQuota> = {}): OnlineQuota {
  return {
    host: 'api.adsb.lol',
    used: 400,
    state: 'approaching',
    limit: 500,
    limitSource: 'feed',
    remaining: 100,
    resetsInSeconds: 3600,
    ...overrides,
  }
}

const NOON_11_NOV_UTC = Date.UTC(2026, 10, 11, 12, 0, 0)

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('quotaNoticeKey', () => {
  it('joins the feed host, the warning level and the UTC day', () => {
    expect(quotaNoticeKey(figure(), NOON_11_NOV_UTC)).toBe('api.adsb.lol|approaching|2026-11-11')
  })

  it('ignores the call count, so a rising count within one level keeps the same key', () => {
    expect(quotaNoticeKey(figure({ used: 401, remaining: 99 }), NOON_11_NOV_UTC)).toBe(
      quotaNoticeKey(figure({ used: 480, remaining: 20 }), NOON_11_NOV_UTC),
    )
  })

  it('changes when the warning gets worse', () => {
    expect(quotaNoticeKey(figure({ state: 'reached' }), NOON_11_NOV_UTC)).toBe(
      'api.adsb.lol|reached|2026-11-11',
    )
  })

  it('changes when the feed host changes', () => {
    expect(quotaNoticeKey(figure({ host: 'other.feed' }), NOON_11_NOV_UTC)).toBe(
      'other.feed|approaching|2026-11-11',
    )
  })

  it('rolls over at 00:00 UTC, not at local midnight', () => {
    const lastSecondOfDay = Date.UTC(2026, 10, 11, 23, 59, 59)
    const firstSecondOfNextDay = Date.UTC(2026, 10, 12, 0, 0, 0)
    expect(quotaNoticeKey(figure(), lastSecondOfDay)).toBe('api.adsb.lol|approaching|2026-11-11')
    expect(quotaNoticeKey(figure(), firstSecondOfNextDay)).toBe(
      'api.adsb.lol|approaching|2026-11-12',
    )
  })
})

describe('dismissal storage', () => {
  it('reads null when nothing has been dismissed', () => {
    expect(readDismissedQuotaNotice()).toBeNull()
  })

  it('saves the key under its storage key and reads it back', () => {
    saveDismissedQuotaNotice('api.adsb.lol|approaching|2026-11-11')
    expect(localStorage.getItem(QUOTA_NOTICE_DISMISSAL_STORAGE_KEY)).toBe(
      'api.adsb.lol|approaching|2026-11-11',
    )
    expect(readDismissedQuotaNotice()).toBe('api.adsb.lol|approaching|2026-11-11')
  })

  it('reads null when storage throws', () => {
    localStorage.setItem(QUOTA_NOTICE_DISMISSAL_STORAGE_KEY, 'stored')
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readDismissedQuotaNotice()).toBeNull()
  })

  it('swallows a storage failure on save', () => {
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveDismissedQuotaNotice('key')).not.toThrow()
    expect(setItem).toHaveBeenCalledWith(QUOTA_NOTICE_DISMISSAL_STORAGE_KEY, 'key')
  })
})
