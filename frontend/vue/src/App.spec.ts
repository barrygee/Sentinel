/* eslint-disable vue/one-component-per-file -- this spec defines several tiny
   stub components to stand in for App.vue's child components. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, reactive, ref, nextTick } from 'vue'
import { axe } from 'jest-axe'

// ---- Shared mock state ----------------------------------------------------
const shared = vi.hoisted(() => ({
  locationUnavailable: null as null | { value: boolean },
  startGps: null as null | ReturnType<typeof vi.fn>,
  hydrateFromConfig: null as null | ReturnType<typeof vi.fn>,
  airStart: null as null | ReturnType<typeof vi.fn>,
  spaceStart: null as null | ReturnType<typeof vi.fn>,
  route: null as null | { path: string },
}))

// Controllable route so isSdrRoute (and its watch) can be driven.
vi.mock('vue-router', () => ({
  useRoute: () => {
    if (!shared.route) shared.route = reactive({ path: '/air/' })
    return shared.route
  },
}))

vi.mock('@/composables/useUserLocation', async () => {
  const { ref: vueRef } = await import('vue')
  const locationUnavailable = vueRef(false)
  shared.locationUnavailable = locationUnavailable as unknown as { value: boolean }
  return {
    useUserLocation: () => {
      shared.startGps = vi.fn()
      shared.hydrateFromConfig = vi.fn().mockResolvedValue(undefined)
      return {
        locationUnavailable,
        start: shared.startGps,
        hydrateFromConfig: shared.hydrateFromConfig,
      }
    },
  }
})

vi.mock('@/composables/useAirAlertsService', () => ({
  useAirAlertsService: () => {
    shared.airStart = vi.fn()
    return { start: shared.airStart }
  },
}))

vi.mock('@/composables/useSpaceAlertsService', () => ({
  useSpaceAlertsService: () => {
    shared.spaceStart = vi.fn()
    return { start: shared.spaceStart }
  },
}))

// ---- Child stubs ----------------------------------------------------------
let sidebarSpies: {
  toggle: ReturnType<typeof vi.fn>
  switchTab: ReturnType<typeof vi.fn>
  openRadioTab: ReturnType<typeof vi.fn>
  closeRadioTab: ReturnType<typeof vi.fn>
}
let sidebarOpenRef: ReturnType<typeof ref<boolean>>

const MapSidebarStub = defineComponent({
  name: 'MapSidebar',
  props: { hideTabs: { type: Boolean, default: false } },
  setup(props, { slots, expose }) {
    sidebarSpies = {
      toggle: vi.fn(),
      switchTab: vi.fn(),
      openRadioTab: vi.fn(),
      closeRadioTab: vi.fn(),
    }
    sidebarOpenRef = ref(false)
    expose({
      ...sidebarSpies,
      get open() {
        return sidebarOpenRef.value
      },
    })
    return () =>
      h('div', { class: 'map-sidebar-stub', 'data-hide-tabs': String(props.hideTabs) }, [
        slots.radio?.(),
      ])
  },
})

let footerProps: { sidebarOpen: boolean } | null = null
const AppFooterStub = defineComponent({
  name: 'AppFooter',
  props: { sidebarOpen: { type: Boolean, default: false } },
  emits: ['toggle-sidebar'],
  setup(props, { emit }) {
    footerProps = props
    // A button so a click maps to the toggle-sidebar emit App listens for.
    return () =>
      h('button', {
        class: 'footer-stub',
        'aria-label': 'Toggle sidebar',
        onClick: () => emit('toggle-sidebar'),
      })
  },
})

const InertStub = defineComponent({ name: 'InertStub', setup: () => () => h('div') })

// RouterLink stub: renders an anchor carrying the resolved attrs App sets so the
// v-for over navDomains is assertable.
const RouterLinkStub = defineComponent({
  name: 'RouterLink',
  props: { to: { type: String, default: '' }, dataDomain: { type: String, default: '' } },
  setup(props, { slots }) {
    // Vue normalises the `data-domain` attribute onto the camelCased prop.
    return () =>
      h(
        'a',
        { href: props.to, class: 'nav-link', 'data-domain': props.dataDomain },
        slots.default?.(),
      )
  },
})

import App from './App.vue'
import { useAppStore } from '@/stores/app'
import { useNotificationsStore } from '@/stores/notifications'

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        MapSidebar: MapSidebarStub,
        AppFooter: AppFooterStub,
        SettingsPanel: InertStub,
        SdrTabPanel: InertStub,
        RouterLink: RouterLinkStub,
        RouterView: InertStub,
      },
    },
  })
}

enableAutoUnmount(afterEach)

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    shared.route = reactive({ path: '/air/' })
    if (shared.locationUnavailable) shared.locationUnavailable.value = false
    footerProps = null
    localStorage.clear()
    document.body.innerHTML = ''
  })

  describe('mount lifecycle', () => {
    it('hydrates location from config, then starts GPS and the alert services', async () => {
      mountApp()
      await flushPromises()
      expect(shared.hydrateFromConfig).toHaveBeenCalled()
      expect(shared.startGps).toHaveBeenCalled()
      expect(shared.airStart).toHaveBeenCalled()
      expect(shared.spaceStart).toHaveBeenCalled()
    })
  })

  describe('navigation domains', () => {
    it('renders a nav link per enabled domain with its label and data-domain', () => {
      const app = useAppStore()
      app.enabledDomains = ['air', 'sdr']
      const wrapper = mountApp()
      const links = wrapper.findAll('a.nav-link, a[data-domain]')
      const domains = links.map((link) => link.attributes('data-domain'))
      expect(domains).toEqual(['air', 'sdr'])
      expect(links.map((link) => link.text())).toEqual(['AIR', 'SDR'])
      expect(links[0]!.attributes('href')).toBe('/air/')
    })

    it('omits domains that are not enabled', () => {
      const app = useAppStore()
      app.enabledDomains = ['space']
      const wrapper = mountApp()
      const links = wrapper.findAll('a[data-domain]')
      expect(links).toHaveLength(1)
      expect(links[0]!.attributes('data-domain')).toBe('space')
    })
  })

  describe('SDR route reaction', () => {
    it('opens the radio tab when navigating to an SDR route and closes it when leaving', async () => {
      const wrapper = mountApp()
      await flushPromises()
      expect(wrapper.find('.map-sidebar-stub').attributes('data-hide-tabs')).toBe('false')

      shared.route!.path = '/sdr/'
      await nextTick()
      expect(sidebarSpies.openRadioTab).toHaveBeenCalled()
      expect(wrapper.find('.map-sidebar-stub').attributes('data-hide-tabs')).toBe('true')

      shared.route!.path = '/air/'
      await nextTick()
      expect(sidebarSpies.closeRadioTab).toHaveBeenCalled()
    })
  })

  describe('document-event tab switching', () => {
    it('switches to the search tab on air-open-search and open-space-search', async () => {
      mountApp()
      document.dispatchEvent(new CustomEvent('air-open-search'))
      document.dispatchEvent(new CustomEvent('open-space-search'))
      expect(sidebarSpies.switchTab).toHaveBeenCalledTimes(2)
      expect(sidebarSpies.switchTab).toHaveBeenCalledWith('search')
    })
  })

  describe('footer ↔ sidebar wiring', () => {
    it('passes the sidebar open state down and toggles the sidebar on footer request', async () => {
      const wrapper = mountApp()
      expect(footerProps!.sidebarOpen).toBe(false)
      sidebarOpenRef.value = true
      await nextTick()
      expect(footerProps!.sidebarOpen).toBe(true)

      await wrapper.find('.footer-stub').trigger('click')
      expect(sidebarSpies.toggle).toHaveBeenCalled()
    })
  })

  describe('location-unavailable notification', () => {
    it('adds an alert when location becomes unavailable and dismisses it on recovery', async () => {
      const notifications = useNotificationsStore()
      const addSpy = vi.spyOn(notifications, 'add')
      const dismissSpy = vi.spyOn(notifications, 'dismiss')
      mountApp()
      // Immediate watch ran with `false` → no notification yet.
      expect(addSpy).not.toHaveBeenCalled()

      shared.locationUnavailable!.value = true
      await nextTick()
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'system', title: 'LOCATION UNAVAILABLE' }),
      )
      const notifId = addSpy.mock.results[0]!.value as string

      shared.locationUnavailable!.value = false
      await nextTick()
      expect(dismissSpy).toHaveBeenCalledWith(notifId)
    })

    it('shows the alert immediately when location is already unavailable at mount', async () => {
      shared.locationUnavailable!.value = true
      const notifications = useNotificationsStore()
      const addSpy = vi.spyOn(notifications, 'add')
      mountApp()
      await nextTick()
      expect(addSpy).toHaveBeenCalledTimes(1)
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountApp()
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
