import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'
import { useAppStore } from '@sentinel/shell-api/stores/app'

import OnlineQuotaNotice from './OnlineQuotaNotice.vue'
import * as onlineQuotaApi from './services/onlineQuotaApi'

/**
 * Tests for the banner over the AIR map as the online feed's daily call limit
 * runs out — the point where the map stops updating and would otherwise look
 * like a quiet sky.
 */

function figure(overrides: Partial<onlineQuotaApi.OnlineQuota> = {}): onlineQuotaApi.OnlineQuota {
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

beforeEach(() => {
  setActivePinia(createPinia())
  useAppStore().setConnectivityMode('online')
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function mountWith(quota: onlineQuotaApi.OnlineQuota | null) {
  vi.spyOn(onlineQuotaApi, 'fetchOnlineQuota').mockResolvedValue(quota)
  const wrapper = mount(OnlineQuotaNotice)
  await flushPromises()
  return wrapper
}

describe('OnlineQuotaNotice', () => {
  it('says nothing with calls to spare', async () => {
    expect((await mountWith(figure())).text()).toBe('')
  })

  it('says nothing when the figure is unavailable', async () => {
    expect((await mountWith(null)).text()).toBe('')
  })

  it('warns as the limit approaches', async () => {
    const wrapper = await mountWith(figure({ state: 'approaching', used: 400, remaining: 100 }))

    expect(wrapper.text()).toContain('Online data source: 400 of 500 daily calls used.')
  })

  it('dims the map once it is reached, and keeps the warning banner over it', async () => {
    const wrapper = await mountWith(
      figure({ state: 'reached', used: 500, remaining: 0, resetsInSeconds: 5 * 3600 + 2 * 60 }),
    )

    expect(wrapper.find('.map-dim-overlay').exists()).toBe(true)
    expect(wrapper.find('[role="status"]').text()).toContain(
      'Online data source daily limit reached. Aircraft resume in about 5h 2m.',
    )
  })

  it('does not dim the map while the limit only approaches', async () => {
    const wrapper = await mountWith(figure({ state: 'approaching', used: 400, remaining: 100 }))

    expect(wrapper.find('.map-notice').exists()).toBe(true)
    expect(wrapper.find('.map-dim-overlay').exists()).toBe(false)
  })

  it('has no accessibility violations once reached', async () => {
    const wrapper = await mountWith(figure({ state: 'reached', used: 500, remaining: 0 }))

    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountWith(figure({ state: 'approaching', used: 400, remaining: 100 }))

    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
