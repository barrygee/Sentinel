import { createRouter, createWebHistory, type Router } from 'vue-router'
import { getSectionRoutes } from '@sentinel/shell-api/shell/sectionRegistry'
import { getSettingsSections } from '@sentinel/shell-api/shell/settingsRegistry'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import NoSectionsAvailable from '@/shell/NoSectionsAvailable.vue'
import { DOCS_ROUTE_NAME, docsReturn, isDocsRoute } from './docsRoute'
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_ROUTE_NAME,
  isSettingsRoute,
  settingsReturn,
  settingsSectionOf,
} from './settingsRoute'

/**
 * True when the Settings panel offers `section`: core's sections always, a
 * domain's only while that domain is enabled — the same rule as the panel's nav.
 */
function isSettingsSectionOffered(section: string): boolean {
  const entry = getSettingsSections().find((candidate) => candidate.key === section)
  if (!entry) return false
  return !entry.domain || useAppStore().enabledDomains.includes(section)
}

/**
 * Builds the app router from the section registry — call it once the sections
 * have loaded and registered (main.ts), since the routes are whatever they
 * registered (docs/plans/section-containers.md §1.3, F1).
 */
export function createAppRouter(): Router {
  const sectionRoutes = getSectionRoutes()
  const firstSectionRoute = sectionRoutes[0]
  settingsReturn.reset()
  docsReturn.reset()

  const router = createRouter({
    history: createWebHistory(),
    routes: [
      // "/" redirects to the first registered section (AIR, in nav order).
      // With none registered (the section list could not be read) it shows
      // why instead: redirecting to a section route that doesn't exist would hit
      // the catch-all, which redirects back to "/" until the stack overflows.
      firstSectionRoute
        ? { path: '/', redirect: firstSectionRoute.path }
        : { path: '/', component: NoSectionsAvailable },
      ...sectionRoutes,
      // The Settings page. It renders no view of its own: the Settings panel
      // (App) is shown full-screen for it by `useSettingsRouteSync`.
      { path: '/settings/:section?', name: SETTINGS_ROUTE_NAME, component: { render: () => null } },
      // The documentation. Loaded on demand: it carries the renderer, which
      // nothing else needs; the markdown comes from the optional docs service
      // when the view opens (`DocsRouteView`). The parameter is optional so both
      // `/docs` and `/docs/` land on the welcome page.
      {
        path: '/docs/:docPath(.*)?',
        name: DOCS_ROUTE_NAME,
        component: () => import('@/docs/DocsRouteView.vue'),
      },
      // The docs used to live at `/doc/`: old links and bookmarks land on the
      // same page, query and anchor at `/docs/`.
      {
        path: '/doc/:docPath(.*)?',
        redirect: (to) => ({
          path: `/docs/${String(to.params.docPath ?? '')}`,
          query: to.query,
          hash: to.hash,
        }),
      },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })

  /** Where closing Settings returns to when a settings link was the first thing opened. */
  function defaultReturnPath(section: string): string {
    const appStore = useAppStore()
    // `/settings/air` returns to AIR; `/settings/app` to the first enabled section.
    if (appStore.enabledDomains.includes(section)) {
      const sectionRoute = sectionRoutes.find((candidate) => candidate.meta?.domain === section)
      if (sectionRoute) return sectionRoute.path
    }
    return `/${appStore.firstEnabledDomain()}/`
  }

  router.beforeEach((to, from) => {
    if (isDocsRoute(to)) {
      if (!isDocsRoute(from)) {
        // On a cold load nothing opened Docs and focus is on <body>: keep no
        // opener, so closing falls back to the main region.
        const opener = document.activeElement
        docsReturn.opener =
          opener instanceof HTMLElement && opener !== document.body ? opener : null
      }
      // A docs link opened first: close lands on the first enabled section.
      if (!docsReturn.path) docsReturn.path = `/${useAppStore().firstEnabledDomain()}/`
      return
    }
    if (isSettingsRoute(to)) {
      const section = settingsSectionOf(to)
      if (!isSettingsSectionOffered(section)) {
        // Inherits the navigation's push/replace, so the page it came from stays in history.
        return { name: SETTINGS_ROUTE_NAME, params: { section: DEFAULT_SETTINGS_SECTION } }
      }
      if (!settingsReturn.path) settingsReturn.path = defaultReturnPath(section)
      return
    }
    const domain = to.meta?.domain as string | undefined
    if (!domain) return
    const appStore = useAppStore()
    if (!appStore.enabledDomains.includes(domain)) {
      const first = appStore.firstEnabledDomain()
      return `/${first}/`
    }
  })

  router.afterEach((to) => {
    // Docs keeps the domain of the section it came from, as Settings does.
    if (isDocsRoute(to)) return
    // Docs closes back to whatever came before it, a Settings page included.
    docsReturn.path = to.fullPath
    // The Settings page keeps the domain of the section it came from, as the
    // section it returns to: nothing section-wide (the map sidebar's per-section
    // tab memory) reacts to a visit to Settings.
    if (isSettingsRoute(to)) return
    settingsReturn.path = to.fullPath
    const domain = (to.meta?.domain as string) ?? ''
    const prev = document.body.dataset.domain ?? ''
    document.body.dataset.domain = domain
    if (prev && prev !== domain) {
      document.dispatchEvent(
        new CustomEvent('sentinel:domain-changed', { detail: { domain, prev } }),
      )
    }
  })

  return router
}
