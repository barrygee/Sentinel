import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'
import { FIXTURE_SETTINGS_SECTIONS } from '@/test/settingsRouteFixtures'

// `registered.routes` stands in for what the sections registered; null = the fixtures.
const registered = vi.hoisted(() => ({ routes: null as unknown[] | null }))
vi.mock('@sentinel/shell-api/shell/sectionRegistry', async () => {
  const fixtures = await import('@/test/settingsRouteFixtures')
  return { getSectionRoutes: () => registered.routes ?? fixtures.FIXTURE_SECTION_ROUTES }
})
// The real docs page bundles all the markdown and the renderer; the router
// only needs something to show.
vi.mock('@/docs/DocsPage.vue', () => ({ default: { render: () => null } }))
vi.mock('@sentinel/shell-api/shell/settingsRegistry', async () => {
  const fixtures = await import('@/test/settingsRouteFixtures')
  return { getSettingsSections: () => fixtures.FIXTURE_SETTINGS_SECTIONS }
})

import { createAppRouter } from './index'
import { settingsReturn } from './settingsRoute'
import { docsReturn } from './docsRoute'
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
    docsReturn.reset()
    registered.routes = null
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

  describe('with no section registered (the section list could not be loaded)', () => {
    beforeEach(() => {
      registered.routes = []
    })

    it('shows why at / instead of redirecting', async () => {
      const router = createAppRouter()
      await router.push('/')
      const wrapper = mount(defineComponent({ setup: () => () => h('main', [h(RouterView)]) }), {
        global: { plugins: [router] },
      })

      expect(router.currentRoute.value.path).toBe('/')
      expect(wrapper.get('h1').text()).toBe('No sections are available')
      wrapper.unmount()
    })

    it('lands an unknown path on that notice, not in a redirect loop', async () => {
      const router = createAppRouter()

      await expect(router.push('/air/')).resolves.toBeUndefined()
      expect(router.currentRoute.value.path).toBe('/')
    })

    it('still opens Settings', async () => {
      const router = createAppRouter()
      await router.push('/settings/app')

      expect(router.currentRoute.value.path).toBe('/settings/app')
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

  describe('docs routes', () => {
    it.each([
      ['/docs', ''],
      ['/docs/', ''],
      ['/docs/operations', 'operations'],
      ['/docs/adr/0006-section-containers', 'adr/0006-section-containers'],
    ])('resolves %s to the docs route', async (path, docPath) => {
      const router = createAppRouter()
      await router.push(path)
      expect(router.currentRoute.value.name).toBe('doc')
      expect(router.currentRoute.value.params.docPath ?? '').toBe(docPath)
    })

    it.each([
      ['/doc', '/docs/'],
      ['/doc/', '/docs/'],
      ['/doc/adr/0006-section-containers', '/docs/adr/0006-section-containers'],
      ['/doc/operations?q=radio#backups', '/docs/operations?q=radio#backups'],
    ])('redirects the old address %s to %s', async (oldPath, newPath) => {
      const router = createAppRouter()
      await router.push(oldPath)
      expect(router.currentRoute.value.name).toBe('doc')
      expect(router.currentRoute.value.fullPath).toBe(newPath)
    })

    it('does not send an unknown docs path home: the docs page shows its own not-found', async () => {
      const router = createAppRouter()
      await router.push('/docs/nowhere/at/all')
      expect(router.currentRoute.value.name).toBe('doc')
    })

    it('remembers the section it was opened from as where closing returns to', async () => {
      const router = createAppRouter()
      await router.push('/sdr/')
      await router.push('/docs/operations')
      expect(docsReturn.path).toBe('/sdr/')
    })

    it('returns to a Settings page when Docs was opened from the Settings rail', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      await router.push('/settings/sdr')
      await router.push('/docs/')
      expect(docsReturn.path).toBe('/settings/sdr')
    })

    it('keeps the return path across docs pages and searches', async () => {
      const router = createAppRouter()
      await router.push('/space/')
      await router.push('/docs/operations')
      await router.push('/docs/sections#sdr')
      await router.replace('/docs/sections?q=radio')
      expect(docsReturn.path).toBe('/space/')
    })

    it('follows the reader when they leave Docs for another section', async () => {
      const router = createAppRouter()
      await router.push('/air/')
      await router.push('/docs/')
      await router.push('/sdr/')
      await router.push('/docs/')
      expect(docsReturn.path).toBe('/sdr/')
    })

    it('returns a cold-loaded docs link to the first enabled section', async () => {
      useAppStore().setEnabledDomains(['space', 'sdr'])
      const router = createAppRouter()
      await router.push('/docs/operations')
      expect(docsReturn.path).toBe('/space/')
    })

    it('is available even when no domain is enabled for it (it is not a section)', async () => {
      useAppStore().setEnabledDomains(['sdr'])
      const router = createAppRouter()
      await router.push('/docs/')
      expect(router.currentRoute.value.path).toBe('/docs/')
    })

    it('keeps the body domain of the section it came from and announces no domain change', async () => {
      const router = createAppRouter()
      await router.push('/sdr/')
      const changes = domainChanges()
      await router.push('/docs/operations')
      expect(document.body.dataset.domain).toBe('sdr')
      expect(changes).toEqual([])
    })

    it('does not move where Settings returns to', async () => {
      const router = createAppRouter()
      await router.push('/space/')
      await router.push('/docs/')
      expect(settingsReturn.path).toBe('/space/')
    })

    describe('the control that opened it', () => {
      afterEach(() => {
        document.body.innerHTML = ''
      })

      it('is the focused control when Docs is opened from a section', async () => {
        const router = createAppRouter()
        await router.push('/air/')
        const opener = document.createElement('button')
        document.body.appendChild(opener)
        opener.focus()
        await router.push('/docs/')
        expect(docsReturn.opener).toBe(opener)
      })

      it('is nothing on a cold load, when focus is on <body>', async () => {
        const router = createAppRouter()
        ;(document.activeElement as HTMLElement | null)?.blur()
        expect(document.activeElement).toBe(document.body)
        await router.push('/docs/')
        expect(docsReturn.opener).toBeNull()
      })

      it('is nothing when the focused element is not an HTML element', async () => {
        const router = createAppRouter()
        await router.push('/air/')
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('tabindex', '0')
        document.body.appendChild(svg)
        svg.focus()
        expect(document.activeElement).toBe(svg)
        await router.push('/docs/')
        expect(docsReturn.opener).toBeNull()
      })

      it('is not replaced by whatever has focus when moving between docs pages', async () => {
        const router = createAppRouter()
        await router.push('/air/')
        const opener = document.createElement('button')
        const linkInDocs = document.createElement('a')
        linkInDocs.href = '#'
        document.body.append(opener, linkInDocs)
        opener.focus()
        await router.push('/docs/')
        linkInDocs.focus()
        await router.push('/docs/operations')
        expect(docsReturn.opener).toBe(opener)
      })

      it('is not taken from the <body> element itself', async () => {
        const router = createAppRouter()
        await router.push('/air/')
        document.body.tabIndex = -1
        document.body.focus()
        await router.push('/docs/')
        document.body.removeAttribute('tabindex')
        expect(docsReturn.opener).toBeNull()
      })
    })

    it('starts each new router with nowhere to return to', async () => {
      const first = createAppRouter()
      await first.push('/sdr/')
      await first.push('/docs/')
      expect(docsReturn.path).toBe('/sdr/')
      createAppRouter()
      expect(docsReturn.path).toBeNull()
      expect(docsReturn.opener).toBeNull()
    })
  })
})
