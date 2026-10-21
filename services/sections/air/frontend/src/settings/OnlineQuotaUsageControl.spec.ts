import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'
import { useAppStore } from '@sentinel/shell-api/stores/app'

import OnlineQuotaUsageControl from './OnlineQuotaUsageControl.vue'
import * as onlineQuotaApi from '../services/onlineQuotaApi'

/**
 * Tests for Settings › AIR › Online API Usage: calls made to the feed in use
 * against its daily limit, readable at a glance before the map stops updating.
 */

function figure(overrides: Partial<onlineQuotaApi.OnlineQuota> = {}): onlineQuotaApi.OnlineQuota {
  return {
    host: 'api.adsb.lol',
    used: 5,
    state: 'ok',
    limit: 500,
    limitSource: 'feed',
    remaining: 495,
    resetsInSeconds: 23 * 3600 + 52 * 60,
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  useAppStore().setConnectivityMode('online')
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function mountWith(quota: onlineQuotaApi.OnlineQuota | null) {
  vi.spyOn(onlineQuotaApi, 'fetchOnlineQuota').mockResolvedValue(quota)
  const wrapper = mount(OnlineQuotaUsageControl)
  await flushPromises()
  return wrapper
}

/** Each cell as `LABEL: value`, in order. */
function cells(wrapper: Awaited<ReturnType<typeof mountWith>>): string[] {
  return wrapper
    .findAll('.ba-data-cell')
    .map(
      (cell) =>
        `${cell.find('.ba-data-cell-label').text()}: ${cell.find('.ba-data-cell-value').text()}`,
    )
}

describe('OnlineQuotaUsageControl', () => {
  it('shows the limit, calls used today, calls left and when the count resets, on one line', async () => {
    const wrapper = await mountWith(figure())

    expect(cells(wrapper)).toEqual([
      'DAILY LIMIT: 500 (stated by the feed)',
      'CALLS USED TODAY: 5 / 500',
      'REMAINING: 495',
      'RESETS IN: 23h 52m',
    ])
    expect(wrapper.find('.ba-data-grid').classes()).toContain('ba-data-grid--four')
  })

  it('does not repeat the feed address, which the setting above already shows', async () => {
    expect((await mountWith(figure())).text()).not.toContain('api.adsb.lol')
  })

  it.each([
    ['setting', '40 (from Daily Call Limit)'],
    ['default', '40 (built-in default)'],
  ] as const)('says where a %s limit came from', async (limitSource, expected) => {
    const wrapper = await mountWith(figure({ limit: 40, limitSource }))

    expect(cells(wrapper)[0]).toBe(`DAILY LIMIT: ${expected}`)
  })

  it('shows calls made to a feed with no known limit, with nothing left to count down', async () => {
    const wrapper = await mountWith(
      figure({ state: 'no_limit', used: 12, limit: null, limitSource: null, remaining: null }),
    )

    expect(cells(wrapper)).toEqual([
      'DAILY LIMIT: None stated',
      'CALLS USED TODAY: 12',
      'REMAINING: —',
    ])
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('once reached, says when calls resume, marks what is left and warns', async () => {
    const wrapper = await mountWith(
      figure({ state: 'reached', used: 500, remaining: 0, resetsInSeconds: 2 * 3600 }),
    )

    expect(cells(wrapper).slice(2)).toEqual(['REMAINING: 0', 'RESUMES IN: 2h 0m'])
    expect(wrapper.findAll('.ba-data-cell-value')[2]!.classes()).toContain(
      'ba-data-cell-value--emphasis',
    )
    expect(wrapper.find('[role="status"]').text()).toContain('daily limit reached')
  })

  it('warns as the limit approaches', async () => {
    const wrapper = await mountWith(figure({ state: 'approaching', used: 400, remaining: 100 }))

    expect(wrapper.find('[role="status"]').text()).toContain('400 of 500 daily calls used')
  })

  it('shows dashes until the figure arrives, or if it cannot', async () => {
    const wrapper = await mountWith(null)

    expect(cells(wrapper)).toEqual(['DAILY LIMIT: —', 'CALLS USED TODAY: —', 'REMAINING: —'])
  })

  it('shows a dash for the reset time from an older backend that sends none', async () => {
    const wrapper = await mountWith(figure({ used: 0, remaining: 500, resetsInSeconds: null }))

    expect(cells(wrapper)[3]).toBe('RESETS IN: —')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountWith(figure({ state: 'approaching', used: 400, remaining: 100 }))

    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
