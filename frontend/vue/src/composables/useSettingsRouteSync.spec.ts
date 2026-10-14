import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia, type Pinia } from 'pinia'
import { defineComponent, h } from 'vue'
import type { Router } from 'vue-router'

vi.mock('@sentinel/shell-api/shell/sectionRegistry', async () => {
  const fixtures = await import('@/test/settingsRouteFixtures')
  return { getSectionRoutes: () => fixtures.FIXTURE_SECTION_ROUTES }
})
vi.mock('@sentinel/shell-api/shell/settingsRegistry', async () => {
  const fixtures = await import('@/test/settingsRouteFixtures')
  return { getSettingsSections: () => fixtures.FIXTURE_SETTINGS_SECTIONS }
})

import { createAppRouter } from '@/router'
import { settingsBackground } from '@/router/settingsRoute'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { useSettingsRouteSync } from './useSettingsRouteSync'

enableAutoUnmount(afterEach)

let pinia: Pinia

/** Mounts a component that keeps the panel and the URL in step, as App does. */
function mountSync(router: Router) {
  return mount(
    defineComponent({
      setup() {
        useSettingsRouteSync()
        return () => h('div')
      },
    }),
    { global: { plugins: [router, pinia] } },
  )
}

/** Lets a history traversal (Back) land: jsdom fires popstate asynchronously. */
async function settleHistory(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30))
  await flushPromises()
}

function path(router: Router): string {
  return router.currentRoute.value.path
}

describe('useSettingsRouteSync', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    useAppStore().setEnabledDomains(['air', 'space', 'sdr'])
    window.history.replaceState(null, '', '/')
  })

  describe('URL → panel', () => {
    it('opens the panel on the section a settings link names', async () => {
      const router = createAppRouter()
      await router.push('/settings/sdr')
      mountSync(router)
      await flushPromises()

      const store = useSettingsStore()
      expect(store.open).toBe(true)
      expect(store.activeSection).toBe('sdr')
      expect(path(router)).toBe('/settings/sdr')
    })

    it('does not navigate again when the URL itself switched the section', async () => {
      const router = createAppRouter()
      await router.push('/settings/app')
      mountSync(router)
      await flushPromises()
      const push = vi.spyOn(router, 'push')
      const replace = vi.spyOn(router, 'replace')

      await router.push('/settings/air')
      await flushPromises()

      // Only the URL's own navigation: the panel following it moves nothing.
      expect(useSettingsStore().activeSection).toBe('air')
      expect(push).toHaveBeenCalledTimes(1)
      expect(replace).not.toHaveBeenCalled()
    })

    it('leaves the panel closed on a normal page', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      mountSync(router)
      await flushPromises()
      expect(useSettingsStore().open).toBe(false)
    })

    it('switches section when the URL names another one', async () => {
      const router = createAppRouter()
      await router.push('/settings/app')
      mountSync(router)
      await flushPromises()

      await router.push('/settings/air')
      await flushPromises()

      expect(useSettingsStore().activeSection).toBe('air')
    })

    it('closes the panel, announcing it, when the URL leaves Settings', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      await router.push('/settings/app')
      mountSync(router)
      await flushPromises()
      const closed = vi.fn()
      document.addEventListener('settings-panel-closed', closed)

      await router.push('/space/')
      await flushPromises()

      expect(useSettingsStore().open).toBe(false)
      expect(closed).toHaveBeenCalledTimes(1)
      expect(path(router)).toBe('/space/')
      document.removeEventListener('settings-panel-closed', closed)
    })

    it('closes the panel when Back leaves Settings', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      mountSync(router)
      await flushPromises()
      useSettingsStore().openPanel('air')
      await flushPromises()
      expect(path(router)).toBe('/settings/air')

      router.back()
      await settleHistory()

      expect(path(router)).toBe('/air/')
      expect(useSettingsStore().open).toBe(false)
    })
  })

  describe('panel → URL', () => {
    it('pushes the section URL when the panel opens on a page, keeping the page in history', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      mountSync(router)
      await flushPromises()

      useSettingsStore().openPanel('sdr')
      await flushPromises()

      expect(path(router)).toBe('/settings/sdr')
      expect(window.history.state?.back).toBe('/air/')
    })

    it('waits until the panel names its section before moving the URL', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      mountSync(router)
      await flushPromises()
      const store = useSettingsStore()

      store.openPanel()
      await flushPromises()
      expect(path(router)).toBe('/air/')

      store.activeSection = 'app'
      await flushPromises()
      expect(path(router)).toBe('/settings/app')
    })

    it('replaces the URL when the section changes, so Back still returns to the page', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      mountSync(router)
      await flushPromises()
      const store = useSettingsStore()
      store.openPanel('app')
      await flushPromises()

      store.activeSection = 'sdr'
      await flushPromises()

      expect(path(router)).toBe('/settings/sdr')
      expect(window.history.state?.back).toBe('/air/')
    })

    it('closes by going back to the page it was opened from, so Forward reopens it', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      mountSync(router)
      await flushPromises()
      const store = useSettingsStore()
      store.openPanel('sdr')
      await flushPromises()

      store.closePanel()
      await settleHistory()

      expect(path(router)).toBe('/air/')
      expect(window.history.state?.forward).toBe('/settings/sdr')
    })

    it('closes a directly opened link onto the page under it, in place', async () => {
      const router = createAppRouter()
      await router.push('/settings/sdr')
      mountSync(router)
      await flushPromises()

      useSettingsStore().closePanel()
      await settleHistory()

      expect(path(router)).toBe('/sdr/')
      expect(window.history.state?.back).toBeNull()
    })

    it('closes home when no page underneath is known', async () => {
      const router = createAppRouter()
      await router.push('/settings/app')
      mountSync(router)
      await flushPromises()
      settingsBackground.reset()

      useSettingsStore().closePanel()
      await settleHistory()

      expect(path(router)).toBe('/air/')
    })

    it('does not navigate when the panel closes on a normal page', async () => {
      const router = createAppRouter()
      await router.push('/space/')
      mountSync(router)
      await flushPromises()
      const push = vi.spyOn(router, 'push')
      const replace = vi.spyOn(router, 'replace')
      const store = useSettingsStore()

      store.open = true
      store.open = false
      await flushPromises()

      expect(push).not.toHaveBeenCalled()
      expect(replace).not.toHaveBeenCalled()
      expect(path(router)).toBe('/space/')
    })
  })
})
