import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import MapSidebar from './MapSidebar.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useAirStore } from '@/stores/air'
import { useSpaceStore } from '@/stores/space'

const TAB_MAP_KEY = 'sentinel_sidebar_tab_by_domain'
const OPEN_KEY = 'sentinel_sidebar_open'

function mountSidebar(props: Record<string, unknown> = {}) {
  return mount(MapSidebar, {
    props,
    global: { stubs: { NotificationsPanel: true, TrackingPanel: true } },
  })
}

function setPath(path: string): void {
  window.history.pushState({}, '', path)
}

// Exposed surface of the component (defineExpose).
interface SidebarVm {
  switchTab: (tab: string) => void
  openPlaybackTab: () => void
  openRadioTab: () => void
  closeRadioTab: () => void
  show: () => void
  hide: () => void
  toggle: () => void
  open: boolean
  activeTab: string
}

enableAutoUnmount(afterEach)

describe('MapSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setPath('/air/')
  })
  afterEach(() => {
    setPath('/')
  })

  describe('rail and panes', () => {
    it('renders the base tabs in the rail', () => {
      const wrapper = mountSidebar()
      const tabIds = wrapper.findAll('.msb-rail-btn').map((node) => node.attributes('data-tab'))
      expect(tabIds).toEqual(['search', 'alerts', 'tracking', 'passes'])
    })

    it('adds the REPLAY tab when air replay recording is enabled', () => {
      useAirStore().replayEnabled = true
      const wrapper = mountSidebar()
      const tabIds = wrapper.findAll('.msb-rail-btn').map((node) => node.attributes('data-tab'))
      expect(tabIds).toContain('playback')
    })

    it('hides the rail and shows only the radio pane when hideTabs is set', () => {
      const wrapper = mountSidebar({ hideTabs: true })
      expect(wrapper.find('#map-sidebar-rail').exists()).toBe(false)
      expect(wrapper.find('#msb-pane-radio').classes()).toContain('msb-pane-active')
      expect(wrapper.find('#msb-pane-search').exists()).toBe(false)
    })

    it('renders the mobile close button by default', () => {
      const wrapper = mountSidebar()
      expect(wrapper.find('.msb-mobile-close').exists()).toBe(true)
    })

    it('omits the mobile close button when hideTabs is set (SDR section)', () => {
      const wrapper = mountSidebar({ hideTabs: true })
      expect(wrapper.find('.msb-mobile-close').exists()).toBe(false)
    })

    it('renders rail tabs with the right rail’s plain button look (no bordered accent bar)', async () => {
      const wrapper = mountSidebar()
      const searchTab = wrapper.find('.msb-rail-btn[data-tab="search"]')
      expect(searchTab.classes()).not.toContain('ba-btn--bordered')
      // Colour-only state transition, matching the right rail's buttons.
      expect(
        (searchTab.element as HTMLElement).style.getPropertyValue('--ba-rail-transition'),
      ).toBe('color 0.15s ease')
      // Active means "accent icon only": the active class appears, the bordered
      // accent-bar treatment does not.
      await searchTab.trigger('click')
      expect(searchTab.classes()).toContain('ba-btn--active')
      expect(searchTab.classes()).not.toContain('ba-btn--bordered')
    })

    it('pulses the alerts tab when there are unread notifications', () => {
      useNotificationsStore().unreadCount = 3
      const wrapper = mountSidebar()
      const alertsBtn = wrapper.find('.msb-rail-btn[data-tab="alerts"]')
      expect(alertsBtn.classes()).toContain('msb-rail-btn-pulse')
    })
  })

  describe('tab switching', () => {
    it('opens the panel and activates the clicked tab', async () => {
      const wrapper = mountSidebar()
      const vm = wrapper.vm as unknown as SidebarVm
      const events: string[] = []
      document.addEventListener('msb-tab-switch', (event) =>
        events.push((event as CustomEvent<string>).detail),
      )

      await wrapper.find('.msb-rail-btn[data-tab="tracking"]').trigger('click')
      expect(vm.open).toBe(true)
      expect(vm.activeTab).toBe('tracking')
      expect(events).toContain('tracking')
      expect(sessionStorage.getItem(OPEN_KEY)).toBe('1')
    })

    it('exposes the disclosure state of each rail tab via aria-expanded/aria-controls', async () => {
      const wrapper = mountSidebar()
      const trackingBtn = wrapper.find('.msb-rail-btn[data-tab="tracking"]')
      // Collapsed: the panel is closed, so the tab is not expanded.
      expect(trackingBtn.attributes('aria-expanded')).toBe('false')
      expect(trackingBtn.attributes('aria-controls')).toBe('msb-pane-tracking')

      await trackingBtn.trigger('click')
      expect(trackingBtn.attributes('aria-expanded')).toBe('true')
      // Sibling tabs stay collapsed.
      expect(wrapper.find('.msb-rail-btn[data-tab="search"]').attributes('aria-expanded')).toBe(
        'false',
      )
    })

    it('opens the notifications panel only for the alerts tab', async () => {
      const wrapper = mountSidebar()
      const notifStore = useNotificationsStore()
      const openSpy = vi.spyOn(notifStore, 'openPanel')
      const closeSpy = vi.spyOn(notifStore, 'closePanel')

      await wrapper.find('.msb-rail-btn[data-tab="alerts"]').trigger('click')
      expect(openSpy).toHaveBeenCalledOnce()

      await wrapper.find('.msb-rail-btn[data-tab="search"]').trigger('click')
      expect(closeSpy).toHaveBeenCalled()
    })

    it('persists a non-default tab and removes the entry for the default search tab', async () => {
      const wrapper = mountSidebar()
      await wrapper.find('.msb-rail-btn[data-tab="tracking"]').trigger('click')
      expect(JSON.parse(localStorage.getItem(TAB_MAP_KEY)!)).toEqual({ air: 'tracking' })

      await wrapper.find('.msb-rail-btn[data-tab="search"]').trigger('click')
      expect(JSON.parse(localStorage.getItem(TAB_MAP_KEY)!)).toEqual({})
    })
  })

  describe('exposed open/close API', () => {
    it('toggle flips the open state and persists it', () => {
      const wrapper = mountSidebar()
      const vm = wrapper.vm as unknown as SidebarVm
      expect(vm.open).toBe(false)
      vm.toggle()
      expect(vm.open).toBe(true)
      expect(sessionStorage.getItem(OPEN_KEY)).toBe('1')
      vm.toggle()
      expect(vm.open).toBe(false)
      expect(sessionStorage.getItem(OPEN_KEY)).toBeNull()
    })

    it('show dispatches the sidebar-state event', () => {
      const wrapper = mountSidebar()
      const states: boolean[] = []
      document.addEventListener('sentinel:sidebar-state', (event) =>
        states.push((event as CustomEvent<{ open: boolean }>).detail.open),
      )
      ;(wrapper.vm as unknown as SidebarVm).show()
      expect(states).toContain(true)
    })

    it('openPlaybackTab opens the panel on the playback tab', () => {
      useAirStore().replayEnabled = true
      const wrapper = mountSidebar()
      const vm = wrapper.vm as unknown as SidebarVm
      vm.openPlaybackTab()
      expect(vm.open).toBe(true)
      expect(vm.activeTab).toBe('playback')
    })

    it('does not persist the transient radio tab', () => {
      const wrapper = mountSidebar()
      ;(wrapper.vm as unknown as SidebarVm).openRadioTab()
      expect(wrapper.vm.activeTab).toBe('radio')
      // 'radio' must never be written to the per-domain tab memory.
      expect(localStorage.getItem(TAB_MAP_KEY)).toBeNull()
    })

    it('closeRadioTab restores the panel open when it was open before radio', () => {
      const wrapper = mountSidebar()
      const vm = wrapper.vm as unknown as SidebarVm
      vm.show() // panel open before entering radio
      vm.openRadioTab()
      vm.closeRadioTab()
      expect(vm.open).toBe(true)
    })

    it('closeRadioTab hides the panel when it was closed before radio', () => {
      const wrapper = mountSidebar()
      const vm = wrapper.vm as unknown as SidebarVm
      // panel starts closed
      vm.openRadioTab()
      vm.closeRadioTab()
      expect(vm.open).toBe(false)
    })
  })

  describe('tab restoration on mount', () => {
    it('restores a domain-specific tab from localStorage', () => {
      localStorage.setItem(TAB_MAP_KEY, JSON.stringify({ space: 'passes' }))
      setPath('/space/')
      const wrapper = mountSidebar()
      expect(wrapper.vm.activeTab).toBe('passes')
    })

    it('falls back to search for an unknown saved tab', () => {
      localStorage.setItem(TAB_MAP_KEY, JSON.stringify({ air: 'bogus' }))
      const wrapper = mountSidebar()
      expect(wrapper.vm.activeTab).toBe('search')
    })

    it('falls back to search when a domain-specific tab is restored under the wrong domain', () => {
      // 'passes' belongs to space; restoring it under air is rejected.
      localStorage.setItem(TAB_MAP_KEY, JSON.stringify({ air: 'passes' }))
      const wrapper = mountSidebar()
      expect(wrapper.vm.activeTab).toBe('search')
    })

    it('does not restore the playback tab when replay is disabled', () => {
      localStorage.setItem(TAB_MAP_KEY, JSON.stringify({ air: 'playback' }))
      const wrapper = mountSidebar()
      expect(wrapper.vm.activeTab).toBe('search')
    })

    it('restores the playback tab when replay is enabled', () => {
      useAirStore().replayEnabled = true
      localStorage.setItem(TAB_MAP_KEY, JSON.stringify({ air: 'playback' }))
      const wrapper = mountSidebar()
      expect(wrapper.vm.activeTab).toBe('playback')
    })

    it('treats the root path as having no active domain', () => {
      setPath('/')
      localStorage.setItem(TAB_MAP_KEY, JSON.stringify({ '': 'tracking' }))
      const wrapper = mountSidebar()
      // Domain '' has no real section; a stored tab under it is still honoured.
      expect(wrapper.vm.activeTab).toBe('tracking')
    })

    it('restores the open state from sessionStorage', () => {
      sessionStorage.setItem(OPEN_KEY, '1')
      const wrapper = mountSidebar()
      expect(wrapper.vm.open).toBe(true)
    })

    it('ignores a malformed tab map', () => {
      localStorage.setItem(TAB_MAP_KEY, '[1,2,3]') // not an object
      const wrapper = mountSidebar()
      expect(wrapper.vm.activeTab).toBe('search')
    })
  })

  describe('reactivity and events', () => {
    it('falls back to search if replay is disabled while the playback tab is active', async () => {
      const airStore = useAirStore()
      airStore.replayEnabled = true
      const wrapper = mountSidebar()
      ;(wrapper.vm as unknown as SidebarVm).openPlaybackTab()
      expect(wrapper.vm.activeTab).toBe('playback')

      airStore.replayEnabled = false
      await flushPromises()
      expect(wrapper.vm.activeTab).toBe('search')
    })

    it('leaves the active tab alone when replay is enabled', async () => {
      const airStore = useAirStore()
      const wrapper = mountSidebar()
      expect(wrapper.vm.activeTab).toBe('search')
      // Enabling replay must not change the current (non-playback) tab.
      airStore.replayEnabled = true
      await flushPromises()
      expect(wrapper.vm.activeTab).toBe('search')
    })

    it('leaves a non-playback tab alone when replay is disabled', async () => {
      const airStore = useAirStore()
      airStore.replayEnabled = true
      const wrapper = mountSidebar()
      ;(wrapper.vm as unknown as SidebarVm).switchTab('tracking')
      airStore.replayEnabled = false
      await flushPromises()
      // Disabling replay only resets the playback tab; tracking is untouched.
      expect(wrapper.vm.activeTab).toBe('tracking')
    })

    it('responds to the SDR open and toggle panel events', async () => {
      const wrapper = mountSidebar()
      document.dispatchEvent(new CustomEvent('sentinel:sdr-open-panel'))
      await flushPromises()
      expect(wrapper.vm.open).toBe(true)

      document.dispatchEvent(new CustomEvent('sentinel:sdr-toggle-panel'))
      await flushPromises()
      expect(wrapper.vm.open).toBe(false)
    })

    it('opens the search tab on an airport-open event', async () => {
      const wrapper = mountSidebar()
      document.dispatchEvent(new CustomEvent('air-open-airport'))
      await flushPromises()
      expect(wrapper.vm.open).toBe(true)
      expect(wrapper.vm.activeTab).toBe('search')
    })

    it('opens the search tab on an aircraft-open event', async () => {
      const wrapper = mountSidebar()
      document.dispatchEvent(new CustomEvent('air-open-aircraft'))
      await flushPromises()
      expect(wrapper.vm.open).toBe(true)
      expect(wrapper.vm.activeTab).toBe('search')
    })

    it('restores the entering domain tab on a domain-changed event', async () => {
      localStorage.setItem(TAB_MAP_KEY, JSON.stringify({ space: 'passes' }))
      const wrapper = mountSidebar()
      document.dispatchEvent(
        new CustomEvent('sentinel:domain-changed', { detail: { domain: 'space', prev: 'air' } }),
      )
      await flushPromises()
      expect(wrapper.vm.activeTab).toBe('passes')
    })

    it('leaves the active tab untouched when switching into the SDR domain', async () => {
      const wrapper = mountSidebar()
      ;(wrapper.vm as unknown as SidebarVm).switchTab('tracking')
      document.dispatchEvent(
        new CustomEvent('sentinel:domain-changed', { detail: { domain: 'sdr', prev: 'air' } }),
      )
      await flushPromises()
      expect(wrapper.vm.activeTab).toBe('tracking')
    })
  })

  it('tolerates storage failures on read and write', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    const wrapper = mountSidebar()
    const vm = wrapper.vm as unknown as SidebarVm
    expect(vm.activeTab).toBe('search')
    expect(vm.open).toBe(false)
    expect(() => vm.switchTab('tracking')).not.toThrow()
  })

  describe('FILTER category sub-tabs', () => {
    async function openFilter(wrapper: ReturnType<typeof mountSidebar>) {
      await wrapper.find('.msb-rail-btn[data-tab="search"]').trigger('click')
    }

    it('renders the FILTER tab (funnel) label', () => {
      const wrapper = mountSidebar()
      const btn = wrapper.find('.msb-rail-btn[data-tab="search"]')
      expect(btn.attributes('data-tooltip')).toBe('FILTER')
      expect(btn.attributes('aria-label')).toBe('FILTER')
    })

    it('shows the air category sub-tabs only while the FILTER tab is open', async () => {
      const wrapper = mountSidebar()
      // Hidden until FILTER is the active/open tab.
      expect(wrapper.findAll('.msb-rail-subbtn')).toHaveLength(0)
      await openFilter(wrapper)
      const cats = wrapper.findAll('.msb-rail-subbtn').map((s) => s.attributes('data-filter-cat'))
      expect(cats).toEqual(['aircraft', 'airports', 'mil'])
    })

    it('selecting a sub-tab sets the air category, highlights it, and keeps the panel open', async () => {
      const wrapper = mountSidebar()
      await openFilter(wrapper)
      await wrapper.find('.msb-rail-subbtn[data-filter-cat="mil"]').trigger('click')
      expect(useAirStore().airFilterCategory).toBe('mil')
      expect((wrapper.vm as unknown as SidebarVm).open).toBe(true)
      const active = wrapper.find('.msb-rail-subbtn[data-filter-cat="mil"]')
      expect(active.classes()).toContain('msb-rail-btn-active')
      expect(active.attributes('aria-pressed')).toBe('true')
    })

    it('styles the sub-tabs like the right rail’s accordion sub-buttons', async () => {
      const wrapper = mountSidebar()
      await openFilter(wrapper)
      const subTab = wrapper.find('.msb-rail-subbtn[data-filter-cat="aircraft"]')
      expect(subTab.classes()).not.toContain('ba-btn--bordered')
      const subTabStyle = (subTab.element as HTMLElement).style
      // Grey accordion-panel background with the right rail's stronger hover fill…
      expect(subTabStyle.getPropertyValue('--ba-rail-bg')).toBe('var(--color-button-bg)')
      expect(subTabStyle.getPropertyValue('--ba-rail-hover-bg')).toBe('rgba(255, 255, 255, 0.2)')
      expect(subTabStyle.getPropertyValue('--ba-rail-transition')).toBe('color 0.15s ease')
      // …at the rail's default 40px button height (no per-site height override).
      expect(subTabStyle.getPropertyValue('--ba-rail-height')).toBe('')
    })

    it('clicking the open FILTER tab again closes the drawer and hides the sub-tabs', async () => {
      const wrapper = mountSidebar()
      await openFilter(wrapper)
      expect(wrapper.findAll('.msb-rail-subbtn').length).toBeGreaterThan(0)
      await wrapper.find('.msb-rail-btn[data-tab="search"]').trigger('click') // toggle closed
      expect((wrapper.vm as unknown as SidebarVm).open).toBe(false)
      expect(wrapper.findAll('.msb-rail-subbtn')).toHaveLength(0)
    })

    it('drives the space sub-tabs from the store’s available categories', async () => {
      setPath('/space/')
      const wrapper = mountSidebar()
      // The domain-changed handler tracks the active domain reactively.
      document.dispatchEvent(
        new CustomEvent('sentinel:domain-changed', { detail: { domain: 'space', prev: 'air' } }),
      )
      // 'exotic' has no entry in SATELLITE_CATEGORY_SECTION_LABELS, so its sub-tab
      // must fall back to a titlecased version of the raw category key.
      useSpaceStore().setSpaceAvailableCategories(['weather', 'navigation', 'exotic'])
      await openFilter(wrapper)
      const cats = wrapper.findAll('.msb-rail-subbtn').map((s) => s.attributes('data-filter-cat'))
      expect(cats).toEqual(['weather', 'navigation', 'exotic'])
      const exoticTab = wrapper.find('.msb-rail-subbtn[data-filter-cat="exotic"]')
      expect(exoticTab.attributes('data-tooltip')).toBe('EXOTIC')
      await wrapper.find('.msb-rail-subbtn[data-filter-cat="navigation"]').trigger('click')
      expect(useSpaceStore().spaceFilterCategory).toBe('navigation')
    })

    it('shows no sub-tabs on a domain that has none', async () => {
      setPath('/sdr/')
      const wrapper = mountSidebar()
      document.dispatchEvent(
        new CustomEvent('sentinel:domain-changed', { detail: { domain: 'sdr', prev: 'air' } }),
      )
      await openFilter(wrapper)
      expect(wrapper.findAll('.msb-rail-subbtn')).toHaveLength(0)
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountSidebar()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
