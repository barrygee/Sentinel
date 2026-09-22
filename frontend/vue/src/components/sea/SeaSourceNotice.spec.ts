import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SeaSourceNotice from './SeaSourceNotice.vue'
import { useSettingsStore } from '@/stores/settings'
import type { SeaFeedInfo, SeaFeedStatus } from '@/stores/sea'

function offgridFeed(status: SeaFeedStatus, overrides: Partial<SeaFeedInfo> = {}): SeaFeedInfo {
  return feed(status, { mode: 'offgrid', source: 'SDR off-grid AIS decode', ...overrides })
}

function feed(status: SeaFeedStatus, overrides: Partial<SeaFeedInfo> = {}): SeaFeedInfo {
  return {
    status,
    mode: 'online',
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
    // The shared banner prefixes the wording with its warning glyph and a
    // screen-reader-only "Warning:", so the message is carried rather than
    // being the whole text.
    expect(banner.find('.map-notice-message').text()).toBe(`Warning: ${message}`)
    expect(banner.text()).toContain(message)
  })

  it('announces the warning for screen readers and hides the glyph from them', () => {
    // GOV.UK's warning pattern: the mark is decorative, so the meaning has to
    // reach assistive tech as words rather than as a yellow box and a glyph.
    const wrapper = mount(SeaSourceNotice, { props: { feed: feed('stale') } })
    const banner = wrapper.find('.sea-source-notice')
    expect(banner.find('.map-notice-icon').attributes('aria-hidden')).toBe('true')
    expect(banner.find('.map-notice-message .sr-only').text()).toBe('Warning:')
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

describe('SeaSourceNotice off grid', () => {
  /**
   * Off grid the vessels come from an SDR, so the online explanations are not
   * merely unhelpful — they are impossible. There is no API key to be missing
   * and no upstream to reconnect to, and telling an operator to check a key
   * they never set sends them hunting through the wrong settings.
   */
  beforeEach(() => setActivePinia(createPinia()))

  it('asks for a receiver rather than an API key when none is designated', () => {
    const wrapper = mount(SeaSourceNotice, { props: { feed: offgridFeed('no-source') } })
    const text = wrapper.text()
    expect(text).toContain('No off-grid AIS receiver selected')
    expect(text).toContain('Settings › SEA › AIS › Off Grid AIS SDR')
    // It may mention AISStream to contrast the two sources, but it must never
    // send the operator looking for an API key that cannot apply off grid.
    expect(text).not.toContain('API key')
  })

  it('says the decoder container is not running when the feed is down', () => {
    const wrapper = mount(SeaSourceNotice, { props: { feed: offgridFeed('down') } })
    const text = wrapper.text()
    expect(text).toContain('AIS decoder is not running')
    expect(text).toContain('--profile ais')
  })

  it('explains an off-channel radio when the feed is stale', () => {
    const wrapper = mount(SeaSourceNotice, { props: { feed: offgridFeed('stale') } })
    expect(wrapper.text()).toContain('tuned away from the AIS channels')
  })

  it('appends the reported error to the decoder-down banner', () => {
    const wrapper = mount(SeaSourceNotice, {
      props: { feed: offgridFeed('down', { error: 'container not connected' }) },
    })
    expect(wrapper.text()).toContain('container not connected')
  })

  it('appends the reported error to the off-channel banner', () => {
    const wrapper = mount(SeaSourceNotice, {
      props: { feed: offgridFeed('stale', { error: 'tuned to 145.800 MHz' }) },
    })
    expect(wrapper.text()).toContain('tuned to 145.800 MHz')
  })

  it('still reports an unreachable backend', () => {
    const wrapper = mount(SeaSourceNotice, { props: { feed: offgridFeed('unreachable') } })
    expect(wrapper.text()).toContain('Cannot reach the Sentinel backend')
  })

  it('says nothing when the off-grid decode is live', () => {
    const wrapper = mount(SeaSourceNotice, { props: { feed: offgridFeed('live') } })
    expect(wrapper.text()).toBe('')
  })

  it('never shows the key states, which cannot occur off grid', () => {
    for (const status of ['missing-key', 'auth-failed'] as SeaFeedStatus[]) {
      const wrapper = mount(SeaSourceNotice, { props: { feed: offgridFeed(status) } })
      expect(wrapper.text()).toBe('')
    }
  })

  it('does not offer the online reconnect wording off grid', () => {
    // 'reconnecting' belongs to the AISStream watchdog; there is no upstream
    // to reconnect to when the source is a local radio.
    const wrapper = mount(SeaSourceNotice, {
      props: { feed: offgridFeed('reconnecting', { reconnectAttempt: 3 }) },
    })
    expect(wrapper.text()).toBe('')
  })

  it('has no accessibility violations in both off-grid forms', async () => {
    const card = mount(SeaSourceNotice, {
      props: { feed: offgridFeed('no-source') },
      attachTo: document.body,
    })
    expect(await axe(card.element)).toHaveNoViolations()
    card.unmount()
    const banner = mount(SeaSourceNotice, {
      props: { feed: offgridFeed('down') },
      attachTo: document.body,
    })
    expect(await axe(banner.element)).toHaveNoViolations()
    banner.unmount()
  })
})
