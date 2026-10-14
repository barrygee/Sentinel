import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'
import { FIXTURE_SETTINGS_SECTIONS, loadedViews } from '@/test/settingsRouteFixtures'

vi.mock('@sentinel/shell-api/shell/sectionRegistry', async () => {
  const fixtures = await import('@/test/settingsRouteFixtures')
  return { getSectionRoutes: () => fixtures.FIXTURE_SECTION_ROUTES }
})
vi.mock('@sentinel/shell-api/shell/settingsRegistry', async () => {
  const fixtures = await import('@/test/settingsRouteFixtures')
  return { getSettingsSections: () => fixtures.FIXTURE_SETTINGS_SECTIONS }
})
const viewRoutePaths = vi.hoisted(() => [] as Array<string | null>)
vi.mock('@sentinel/shell-api/shell/viewRoute', () => ({
  setViewRoutePath: (path: string | null) => viewRoutePaths.push(path),
}))

import { createAppRouter } from './index'
import { settingsBackground } from './settingsRoute'
import { useAppStore } from '@sentinel/shell-api/stores/app'

function domainChanges(): Array<{ domain: string; prev: string }> {
  const changes: Array<{ domain: string; prev: string }> = []
  document.addEventListener('sentinel:domain-changed', (event) =>
    changes.push((event as CustomEvent).detail),
  )
  return changes
}

describe('createAppRouter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAppStore().setEnabledDomains(['air', 'space', 'sdr'])
    window.history.replaceState(null, '', '/')
    delete document.body.dataset.domain
    viewRoutePaths.length = 0
    loadedViews.length = 0
  })

  describe('section routes', () => {
    it('redirects / to the first section and records it as the page on screen', async () => {
      const router = createAppRouter()
      await router.push('/')
      expect(router.currentRoute.value.path).toBe('/air/')
      expect(document.body.dataset.domain).toBe('air')
      expect(viewRoutePaths.at(-1)).toBe('/air/')
      expect(settingsBackground.path).toBe('/air/')
    })

    it('sends a disabled section to the first enabled one', async () => {
      useAppStore().setEnabledDomains(['space', 'sdr'])
      const router = createAppRouter()
      await router.push('/air/')
      expect(router.currentRoute.value.path).toBe('/space/')
    })

    it('announces a domain change between sections', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      const changes = domainChanges()
      await router.push('/sdr/')
      expect(changes.at(-1)).toEqual({ domain: 'sdr', prev: 'air' })
    })

    it('redirects an unknown path home', async () => {
      const router = createAppRouter()
      await router.push('/nowhere')
      expect(router.currentRoute.value.path).toBe('/air/')
    })
  })

  describe('settings routes', () => {
    it('opens over the page it was opened from, which stays the page on screen', async () => {
      const router = createAppRouter()
      await router.push('/sdr/')
      const changes = domainChanges()

      await router.push('/settings/air')

      expect(router.currentRoute.value.name).toBe('settings')
      expect(settingsBackground.path).toBe('/sdr/')
      expect(viewRoutePaths.at(-1)).toBe('/sdr/')
      // Nothing behind the panel changes: same domain, no domain-changed event.
      expect(document.body.dataset.domain).toBe('sdr')
      expect(changes).toEqual([])
    })

    it('keeps the page underneath across section switches inside Settings', async () => {
      const router = createAppRouter()
      await router.push('/space/')
      await router.push('/settings/app')
      await router.replace('/settings/sdr')
      expect(settingsBackground.path).toBe('/space/')
      expect(document.body.dataset.domain).toBe('space')
    })

    it('opens a direct link to a domain section over that section, its view loaded first', async () => {
      const router = createAppRouter()
      await router.push('/settings/sdr')
      expect(settingsBackground.path).toBe('/sdr/')
      expect(loadedViews).toContain('sdr')
      expect(document.body.dataset.domain).toBe('sdr')
      expect(viewRoutePaths.at(-1)).toBe('/sdr/')
    })

    it('opens a direct link to App Settings over the first enabled section', async () => {
      useAppStore().setEnabledDomains(['space', 'sdr'])
      const router = createAppRouter()
      await router.push('/settings/app')
      expect(settingsBackground.path).toBe('/space/')
    })

    it('opens a direct link to an enabled section with no page of its own over the first enabled one', async () => {
      // 'land' is offered in Settings here but has no route among the fixtures.
      useAppStore().setEnabledDomains(['air', 'land'])
      const router = createAppRouter()
      const sectionsWithLand = [
        ...FIXTURE_SETTINGS_SECTIONS,
        { key: 'land', label: 'LAND', order: 40, domain: true },
      ]
      const settingsRegistry = await import('@sentinel/shell-api/shell/settingsRegistry')
      vi.spyOn(settingsRegistry, 'getSettingsSections').mockReturnValue(sectionsWithLand)

      await router.push('/settings/land')

      expect(router.currentRoute.value.path).toBe('/settings/land')
      expect(settingsBackground.path).toBe('/air/')
    })

    it.each([
      ['no section', '/settings'],
      ['an unknown section', '/settings/nonsense'],
    ])('lands %s on App Settings', async (_case, path) => {
      const router = createAppRouter()
      await router.push(path)
      expect(router.currentRoute.value.path).toBe('/settings/app')
    })

    it("lands a disabled domain's section on App Settings, as the panel does not offer it", async () => {
      useAppStore().setEnabledDomains(['air', 'space'])
      const router = createAppRouter()
      await router.push('/settings/sdr')
      expect(router.currentRoute.value.path).toBe('/settings/app')
    })

    it('keeps the page it came from in history when it corrects a section', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      await router.push('/settings/nonsense')
      expect(window.history.state?.back).toBe('/air/')
    })

    it('has no view of its own: shown through a plain RouterView it renders nothing', async () => {
      const router = createAppRouter()
      await router.push('/settings/app')
      const wrapper = mount(defineComponent({ setup: () => () => h('main', [h(RouterView)]) }), {
        global: { plugins: [router] },
      })
      expect(wrapper.find('main').element.children).toHaveLength(0)
      wrapper.unmount()
    })

    it('starts each new router with no page underneath', async () => {
      const first = createAppRouter()
      await first.push('/sdr/')
      expect(settingsBackground.path).toBe('/sdr/')

      createAppRouter()

      expect(settingsBackground.path).toBeNull()
    })
  })
})
