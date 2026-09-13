import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SeaSourceNotice from './SeaSourceNotice.vue'
import { useSettingsStore } from '@/stores/settings'
import type { SeaFeedInfo, SeaFeedStatus } from '@/stores/sea'

function feed(status: SeaFeedStatus, overrides: Partial<SeaFeedInfo> = {}): SeaFeedInfo {
  return {
    status,
    error: null,
    source: 'AISStream',
    lastMessageAt: null,
    silentForMs: null,
    reconnectAttempt: 0,
    nextAttemptAt: null,
    newestPositionAt: null,
    vesselCount: 0,
    ...overrides,
  }
}

describe('SeaSourceNotice', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    delete document.body.dataset.noData
  })

  it('shows nothing while the feed is live or connecting', () => {
    for (const status of ['live', 'connecting'] as const) {
      const wrapper = mount(SeaSourceNotice, { props: { feed: feed(status) } })
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
      expect(wrapper.find('.sea-source-notice').exists()).toBe(false)
    }
  })

  it.each([
    ['missing-key', 'No AISStream API key configured.', 'AISStream API Key'],
    ['auth-failed', 'AISStream rejected the API key.', 'retried once an hour'],
    ['disabled', 'Sea domain is switched off.', 'disabled in settings'],
    ['no-source', 'No data source configured.', 'Off Grid Data Source'],
    ['unsupported-source', 'Unsupported data source.', 'wss:// URL'],
  ] as const)('takes the section over for %s', (status, title, snippet) => {
    const wrapper = mount(SeaSourceNotice, { props: { feed: feed(status) } })
    expect(wrapper.find('.no-url-overlay-title-main').text()).toBe(title)
    expect(wrapper.find('.no-url-overlay-msg').text()).toContain(snippet)
    expect(wrapper.find('.sea-source-notice').exists()).toBe(false)
    wrapper.unmount()
  })

  it('carries the backend reason into the auth and unsupported-source cards', () => {
    const auth = mount(SeaSourceNotice, {
      props: { feed: feed('auth-failed', { error: 'Api Key Is Not Valid' }) },
    })
    expect(auth.find('.no-url-overlay-msg').text()).toContain('Api Key Is Not Valid.')
    auth.unmount()
    const unsupported = mount(SeaSourceNotice, {
      props: { feed: feed('unsupported-source', { error: 'tcp:// is not supported yet' }) },
    })
    expect(unsupported.find('.no-url-overlay-msg').text()).toBe('tcp:// is not supported yet')
    unsupported.unmount()
  })

  it('opens Settings › SEA from the card', async () => {
    const wrapper = mount(SeaSourceNotice, { props: { feed: feed('missing-key') } })
    await wrapper.find('.no-url-overlay-btn').trigger('click')
    const settings = useSettingsStore()
    expect(settings.open).toBe(true)
    expect(settings.activeSection).toBe('sea')
    wrapper.unmount()
  })

  it.each([
    ['down', 'The AIS feed is down. Retrying every 15 minutes; vessels shown may be stale.'],
    ['reconnecting', 'Reconnecting to the AIS feed (attempt 2). Vessels shown may be stale.'],
    ['stale', 'No AIS traffic received recently. Vessels shown may be stale.'],
    ['unreachable', 'Cannot reach the Sentinel backend — vessels shown are the last received.'],
  ] as const)('keeps the map and shows a banner for %s', (status, message) => {
    const wrapper = mount(SeaSourceNotice, {
      props: { feed: feed(status, { reconnectAttempt: 2 }) },
    })
    expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    const banner = wrapper.find('.sea-source-notice')
    expect(banner.attributes('role')).toBe('status')
    expect(banner.text()).toBe(message)
  })

  it('appends the backend error to the degraded banners', () => {
    for (const status of ['down', 'reconnecting', 'stale'] as const) {
      const wrapper = mount(SeaSourceNotice, {
        props: { feed: feed(status, { error: 'no close frame' }) },
      })
      expect(wrapper.find('.sea-source-notice').text()).toContain('— no close frame')
    }
  })

  it('has no accessibility violations in both forms', async () => {
    const card = mount(SeaSourceNotice, {
      props: { feed: feed('missing-key') },
      attachTo: document.body,
    })
    expect(await axe(card.element)).toHaveNoViolations()
    card.unmount()
    const banner = mount(SeaSourceNotice, {
      props: { feed: feed('stale') },
      attachTo: document.body,
    })
    expect(await axe(banner.element)).toHaveNoViolations()
    banner.unmount()
  })
})
