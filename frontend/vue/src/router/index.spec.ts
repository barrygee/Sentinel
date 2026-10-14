import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'
import { FIXTURE_SETTINGS_SECTIONS } from '@/test/settingsRouteFixtures'

vi.mock('@sentinel/shell-api/shell/sectionRegistry', async () => {
  const fixtures = await import('@/test/settingsRouteFixtures')
  return { getSectionRoutes: () => fixtures.FIXTURE_SECTION_ROUTES }
})
vi.mock('@sentinel/shell-api/shell/settingsRegistry', async () => {
  const fixtures = await import('@/test/settingsRouteFixtures')
  return { getSettingsSections: () => fixtures.FIXTURE_SETTINGS_SECTIONS }
})

import { createAppRouter } from './index'
import { settingsReturn } from './settingsRoute'
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
  })

  describe('section routes', () => {
    it('redirects / to the first section and records it as where Settings returns to', async () => {
      const router = createAppRouter()
      await router.push('/')
      expect(router.currentRoute.value.path).toBe('/air/')
      expect(document.body.dataset.domain).toBe('air')
      expect(settingsReturn.path).toBe('/air/')
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
    it('leaves the section for the Settings page, remembering it to return to', async () => {
      const router = createAppRouter()
      await router.push('/sdr/')
      const changes = domainChanges()

      await router.push('/settings/air')

      expect(router.currentRoute.value.name).toBe('settings')
      expect(settingsReturn.path).toBe('/sdr/')
      // The Settings page keeps the section's domain: nothing section-wide reacts.
      expect(document.body.dataset.domain).toBe('sdr')
      expect(changes).toEqual([])
    })

    it('keeps the section to return to across section switches inside Settings', async () => {
      const router = createAppRouter()
      await router.push('/space/')
      await router.push('/settings/app')
      await router.replace('/settings/sdr')
      expect(settingsReturn.path).toBe('/space/')
      expect(document.body.dataset.domain).toBe('space')
    })

    it('returns a direct link to a domain section to that section', async () => {
      const router = createAppRouter()
      await router.push('/settings/sdr')
      expect(settingsReturn.path).toBe('/sdr/')
    })

    it('returns a direct link to App Settings to the first enabled section', async () => {
      useAppStore().setEnabledDomains(['space', 'sdr'])
      const router = createAppRouter()
      await router.push('/settings/app')
      expect(settingsReturn.path).toBe('/space/')
    })

    it('returns a direct link to an enabled section with no page of its own to the first enabled one', async () => {
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
      expect(settingsReturn.path).toBe('/air/')
    })

    it('announces the domain change when Settings returns to another section', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      await router.push('/settings/app')
      const changes = domainChanges()

      await router.push('/space/')

      expect(changes.at(-1)).toEqual({ domain: 'space', prev: 'air' })
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

    it('starts each new router with nowhere to return to', async () => {
      const first = createAppRouter()
      await first.push('/sdr/')
      expect(settingsReturn.path).toBe('/sdr/')

      createAppRouter()

      expect(settingsReturn.path).toBeNull()
    })
  })
})
