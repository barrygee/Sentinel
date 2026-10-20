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
  it('shows the limit, calls used, calls left and when the next one frees up, on one line', async () => {
    const wrapper = await mountWith(figure())

    expect(cells(wrapper)).toEqual([
      'DAILY LIMIT: 500 (stated by the feed)',
      'CALLS USED (24 H): 5 / 500',
      'REMAINING: 495',
      'NEXT CALL FREED IN: 23h 52m',
    ])
    expect(wrapper.find('.ba-data-grid').classes()).toContain('ba-data-grid--four')
  })

  it('does not repeat the feed address, which the setting above already shows', async () => {
    expect((await mountWith(figure())).text()).not.toContain('api.adsb.lol')
  })

  it.each([
    ['setting', '40 (from Daily Call Limit)'],
    ['default', '40 (adsb.lol default)'],
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
      'CALLS USED (24 H): 12',
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
    expect(wrapper.find('[role="status"]').text()).toContain('daily call limit reached')
  })

  it('warns as the limit approaches', async () => {
    const wrapper = await mountWith(figure({ state: 'approaching', used: 400, remaining: 100 }))

    expect(wrapper.find('[role="status"]').text()).toContain('running low: 400 of 500 calls used')
  })

  it('shows dashes until the figure arrives, or if it cannot', async () => {
    const wrapper = await mountWith(null)

    expect(cells(wrapper)).toEqual(['DAILY LIMIT: —', 'CALLS USED (24 H): —', 'REMAINING: —'])
  })

  it('shows a dash for when the next call frees up before any call is counted', async () => {
    const wrapper = await mountWith(figure({ used: 0, remaining: 500, resetsInSeconds: null }))

    expect(cells(wrapper)[3]).toBe('NEXT CALL FREED IN: —')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountWith(figure({ state: 'approaching', used: 400, remaining: 100 }))

    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
