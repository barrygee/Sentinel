import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { defineComponent, h } from 'vue'
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_ROUTE_NAME,
  isSettingsRoute,
  settingsBackground,
  settingsPath,
  settingsSectionOf,
  useViewRoute,
} from './settingsRoute'

enableAutoUnmount(afterEach)

const Page = defineComponent({ setup: () => () => h('div') })

function memoryRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/air/', component: Page, meta: { domain: 'air' } },
      { path: '/sdr/', component: Page, meta: { domain: 'sdr' } },
      { path: '/settings/:section?', name: SETTINGS_ROUTE_NAME, component: Page },
    ],
  })
}

/** Mounts a probe that reads `useViewRoute` under `router`. */
function mountViewRouteProbe(router: Router) {
  let viewRoute: ReturnType<typeof useViewRoute> | null = null
  mount(
    defineComponent({
      setup() {
        viewRoute = useViewRoute()
        return () => h('div')
      },
    }),
    { global: { plugins: [router] } },
  )
  return () => viewRoute!.value
}

describe('router/settingsRoute', () => {
  beforeEach(() => {
    settingsBackground.reset()
  })

  describe('helpers', () => {
    it('names the settings route and its default section', () => {
      expect(SETTINGS_ROUTE_NAME).toBe('settings')
      expect(DEFAULT_SETTINGS_SECTION).toBe('app')
    })

    it('recognises a settings route by name', () => {
      expect(isSettingsRoute({ name: 'settings' })).toBe(true)
      expect(isSettingsRoute({ name: undefined })).toBe(false)
      expect(isSettingsRoute({ name: 'air' })).toBe(false)
    })

    it('reads the section a settings route names, empty when none or repeated', () => {
      expect(settingsSectionOf({ params: { section: 'sdr' } })).toBe('sdr')
      expect(settingsSectionOf({ params: {} })).toBe('')
      expect(settingsSectionOf({ params: { section: ['a', 'b'] } })).toBe('')
    })

    it('builds a section URL', () => {
      expect(settingsPath('air')).toBe('/settings/air')
    })

    it('forgets the page underneath on reset', () => {
      settingsBackground.path = '/air/'
      settingsBackground.reset()
      expect(settingsBackground.path).toBeNull()
    })
  })

  describe('useViewRoute', () => {
    it('is the current route on a normal page', async () => {
      const router = memoryRouter()
      await router.push('/air/')
      const viewRoute = mountViewRouteProbe(router)
      expect(viewRoute().path).toBe('/air/')
      expect(viewRoute().meta.domain).toBe('air')
    })

    it('is the page underneath while a settings URL is active', async () => {
      const router = memoryRouter()
      await router.push('/settings/app')
      settingsBackground.path = '/sdr/'
      const viewRoute = mountViewRouteProbe(router)
      expect(viewRoute().path).toBe('/sdr/')
      expect(viewRoute().meta.domain).toBe('sdr')
    })

    it('follows the route and the page underneath as they change', async () => {
      const router = memoryRouter()
      await router.push('/air/')
      const viewRoute = mountViewRouteProbe(router)
      settingsBackground.path = '/air/'

      await router.push('/settings/sdr')
      expect(viewRoute().path).toBe('/air/')

      settingsBackground.path = '/sdr/'
      expect(viewRoute().path).toBe('/sdr/')

      await router.push('/sdr/')
      await flushPromises()
      expect(viewRoute().path).toBe('/sdr/')
      expect(isSettingsRoute(viewRoute())).toBe(false)
    })

    it('falls back to the settings route itself when no page underneath is known', async () => {
      const router = memoryRouter()
      await router.push('/settings/app')
      const viewRoute = mountViewRouteProbe(router)
      expect(viewRoute().path).toBe('/settings/app')
    })
  })
})
