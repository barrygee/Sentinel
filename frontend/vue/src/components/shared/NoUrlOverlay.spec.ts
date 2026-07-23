import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import NoUrlOverlay from './NoUrlOverlay.vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'

type FetchHandler = (url: string) => { ok: boolean; json?: () => Promise<unknown> }

function stubFetch(handler: FetchHandler): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => Promise.resolve(handler(url)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function jsonResponse(body: unknown): { ok: boolean; json: () => Promise<unknown> } {
  return { ok: true, json: () => Promise.resolve(body) }
}

async function mountOverlay(domain: string) {
  const wrapper = mount(NoUrlOverlay, { props: { domain } })
  await flushPromises()
  return wrapper
}

// The overlay registers a window listener on mount; auto-unmount each wrapper so
// those listeners don't leak across tests and fire on later dispatched events.
enableAutoUnmount(afterEach)

describe('NoUrlOverlay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    // The overlay flags the shared document.body; clear it so the attribute can't
    // leak into a later test that asserts on its absence.
    delete document.body.dataset.noData
  })

  describe('checkWithBackend — non-space domains', () => {
    it('hides the overlay and caches the URL when the backend has an online source', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      stubFetch(() => jsonResponse({ onlineDataSourceURL: 'https://feed.example' }))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
      expect(localStorage.getItem('sentinel_air_onlineDataSourceURL')).toBe('https://feed.example')
    })

    it('hides the overlay and caches the offgrid source object in offgrid mode', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('offgrid')
      const offgrid = { url: 'http://local.box:8080' }
      stubFetch(() => jsonResponse({ offgridDataSourceURL: offgrid }))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
      expect(localStorage.getItem('sentinel_air_offgridDataSourceURL')).toBe(
        JSON.stringify(offgrid),
      )
    })

    it('shows the online message when no online URL is configured', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      // A bare scheme is treated as a placeholder, not a real URL.
      stubFetch(() => jsonResponse({ onlineDataSourceURL: 'http://' }))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(true)
      expect(wrapper.find('.no-url-overlay-title-main').text()).toBe('No data source configured.')
      const message = wrapper.find('.no-url-overlay-msg').text()
      expect(message).toContain('Online mode is active')
      expect(message).toContain('Online Data Source')
      expect(message).toContain('AIR')
    })

    it('shows the overlay when the online response omits the URL field', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      // No onlineDataSourceURL key at all → backendUrl coalesces to ''.
      stubFetch(() => jsonResponse({}))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(true)
    })

    it('shows the off grid message when no offgrid URL is configured', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('offgrid')
      stubFetch(() => jsonResponse({}))

      const wrapper = await mountOverlay('air')
      const message = wrapper.find('.no-url-overlay-msg').text()
      expect(message).toContain('Off Grid mode is active')
      expect(message).toContain('Off Grid Data Source')
    })

    it('swallows a failed localStorage write on the success path', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      stubFetch(() => jsonResponse({ onlineDataSourceURL: 'https://feed.example' }))
      // localStorage is a MemoryStorage instance (test setup), so spy the instance
      // method, not Storage.prototype, to actually trigger the catch.
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })

      const wrapper = await mountOverlay('air')
      // The throw is caught — the overlay still hides because hasUrl was set first.
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    })
  })

  describe('checkWithBackend — falls back to the localStorage check', () => {
    it('uses a valid online URL from localStorage when the backend responds non-ok', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      localStorage.setItem('sentinel_air_onlineDataSourceURL', 'https://cached.example')
      stubFetch(() => ({ ok: false }))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    })

    it('uses a valid offgrid source from localStorage when the backend request throws', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('offgrid')
      localStorage.setItem(
        'sentinel_air_offgridDataSourceURL',
        JSON.stringify({ url: 'http://local.box:8080' }),
      )
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    })

    it('shows the overlay when offgrid mode has no stored source', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('offgrid')
      stubFetch(() => ({ ok: false }))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(true)
    })

    it('shows the overlay when the stored offgrid source is malformed JSON', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('offgrid')
      localStorage.setItem('sentinel_air_offgridDataSourceURL', 'not-json{')
      stubFetch(() => ({ ok: false }))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(true)
    })

    it('shows the overlay when the stored offgrid source URL is a placeholder', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('offgrid')
      localStorage.setItem('sentinel_air_offgridDataSourceURL', JSON.stringify({ url: 'http://' }))
      stubFetch(() => ({ ok: false }))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(true)
    })

    it('treats a localhost-only URL as a placeholder in online mode', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      localStorage.setItem('sentinel_air_onlineDataSourceURL', 'http://localhost/')
      stubFetch(() => ({ ok: false }))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(true)
    })
  })

  describe('space domain', () => {
    it('hides the overlay when the TLE database holds satellites', async () => {
      stubFetch((url) => {
        expect(url).toBe('/api/space/tle/status')
        return jsonResponse({ total: 42 })
      })
      const wrapper = await mountOverlay('space')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    })

    it('shows the satellite-specific message when the database is empty', async () => {
      stubFetch(() => jsonResponse({ total: 0 }))
      const wrapper = await mountOverlay('space')
      expect(wrapper.find('.no-url-overlay-title-main').text()).toBe('No satellite data available.')
      expect(wrapper.find('.no-url-overlay-msg').text()).toContain('No satellite TLE data')
    })

    it('treats a status payload with no total field as an empty database', async () => {
      stubFetch(() => jsonResponse({}))
      const wrapper = await mountOverlay('space')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(true)
    })

    it('does not block the section when the status endpoint responds non-ok', async () => {
      stubFetch(() => ({ ok: false }))
      const wrapper = await mountOverlay('space')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    })

    it('does not block the section when the status request throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const wrapper = await mountOverlay('space')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    })
  })

  describe('land domain', () => {
    it('never shows the overlay — data comes from the local APRS decoder', async () => {
      // No feed URL exists for land; the base map must always show.
      const fetchMock = stubFetch(() => ({ ok: false }))
      const wrapper = await mountOverlay('land')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
      // The URL gate is skipped entirely — no settings/status fetch is made.
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('stays visible regardless of connectivity mode', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('offgrid')
      stubFetch(() => ({ ok: false }))
      const wrapper = await mountOverlay('land')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    })
  })

  describe('source override', () => {
    it('lets a per-domain offgrid override win over an online app mode', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      localStorage.setItem('sentinel_air_sourceOverride', 'offgrid')
      stubFetch(() => jsonResponse({}))

      const wrapper = await mountOverlay('air')
      // Effective mode is offgrid (override), so the offgrid message renders.
      expect(wrapper.find('.no-url-overlay-msg').text()).toContain('Off Grid mode is active')
    })

    it('falls back to auto and an empty check when localStorage reads throw', async () => {
      // Spy the MemoryStorage instance so reads throw in both _readSourceOverride
      // (→ 'auto') and the _lsGet helper used by the localStorage fallback check.
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      // Non-ok response forces the localStorage check() path, where _lsGet throws.
      stubFetch(() => ({ ok: false }))

      // Should not throw despite the storage failures; with no readable URL the
      // overlay is shown.
      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(true)
    })
  })

  describe('events and reactivity', () => {
    it('opens the settings panel for its domain when OPEN SETTINGS is clicked', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      const settingsStore = useSettingsStore()
      const openSpy = vi.spyOn(settingsStore, 'openPanel')
      stubFetch(() => jsonResponse({ onlineDataSourceURL: 'http://' }))

      const wrapper = await mountOverlay('air')
      await wrapper.find('.no-url-overlay-btn').trigger('click')
      expect(openSpy).toHaveBeenCalledWith('air')
    })

    it('re-checks when the connectivity mode changes', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      // Online has no URL (overlay visible); offgrid does (overlay hidden).
      stubFetch(() =>
        jsonResponse({
          onlineDataSourceURL: 'http://',
          offgridDataSourceURL: { url: 'http://local.box:8080' },
        }),
      )

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(true)

      appStore.setConnectivityMode('offgrid')
      await flushPromises()
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    })

    it('re-checks when a source-override change event fires', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      stubFetch(() => jsonResponse({ onlineDataSourceURL: 'http://' }))

      const wrapper = await mountOverlay('air')
      const fetchMock = stubFetch(() =>
        jsonResponse({ onlineDataSourceURL: 'https://feed.example' }),
      )
      // The override changes in localStorage, then the app announces it.
      localStorage.setItem('sentinel_air_sourceOverride', 'online')
      window.dispatchEvent(new CustomEvent('sentinel:sourceOverrideChanged'))
      await flushPromises()
      expect(fetchMock).toHaveBeenCalled()
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    })

    it('re-checks when the settings panel closes', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      stubFetch(() => jsonResponse({ onlineDataSourceURL: 'http://' }))

      const wrapper = await mountOverlay('air')
      const fetchMock = stubFetch(() =>
        jsonResponse({ onlineDataSourceURL: 'https://feed.example' }),
      )
      document.dispatchEvent(new CustomEvent('settings-panel-closed'))
      await flushPromises()
      expect(fetchMock).toHaveBeenCalled()
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
    })

    it('stops responding to override events after unmount', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      stubFetch(() => jsonResponse({ onlineDataSourceURL: 'https://feed.example' }))

      const wrapper = await mountOverlay('air')
      wrapper.unmount()
      const fetchMock = stubFetch(() => jsonResponse({}))
      window.dispatchEvent(new CustomEvent('sentinel:sourceOverrideChanged'))
      await flushPromises()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('no-data chrome flag on document.body', () => {
    it('sets data-no-data on the body while the overlay is visible', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      stubFetch(() => jsonResponse({ onlineDataSourceURL: 'http://' }))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(true)
      expect(document.body.dataset.noData).toBe('true')
    })

    it('leaves the body unflagged when the section has a valid source', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      stubFetch(() => jsonResponse({ onlineDataSourceURL: 'https://feed.example' }))

      const wrapper = await mountOverlay('air')
      expect(wrapper.find('.no-url-overlay').exists()).toBe(false)
      expect(document.body.dataset.noData).toBeUndefined()
    })

    it('clears the flag when a source is supplied and the overlay hides', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      // Online has no URL (overlay visible, flag set); offgrid does (overlay hides).
      stubFetch(() =>
        jsonResponse({
          onlineDataSourceURL: 'http://',
          offgridDataSourceURL: { url: 'http://local.box:8080' },
        }),
      )

      await mountOverlay('air')
      expect(document.body.dataset.noData).toBe('true')

      appStore.setConnectivityMode('offgrid')
      await flushPromises()
      expect(document.body.dataset.noData).toBeUndefined()
    })

    it('clears the flag on unmount even while the overlay is still visible', async () => {
      const appStore = useAppStore()
      appStore.setConnectivityMode('online')
      stubFetch(() => jsonResponse({ onlineDataSourceURL: 'http://' }))

      const wrapper = await mountOverlay('air')
      expect(document.body.dataset.noData).toBe('true')

      wrapper.unmount()
      expect(document.body.dataset.noData).toBeUndefined()
    })
  })

  it('has no accessibility violations when visible', async () => {
    const appStore = useAppStore()
    appStore.setConnectivityMode('online')
    stubFetch(() => jsonResponse({ onlineDataSourceURL: 'http://' }))
    const wrapper = await mountOverlay('air')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
