import { createRouter, createWebHistory, type Router } from 'vue-router'
import { getSectionRoutes } from '@sentinel/shell-api/shell/sectionRegistry'
import { getSettingsSections } from '@sentinel/shell-api/shell/settingsRegistry'
import { useAppStore } from '@sentinel/shell-api/stores/app'
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
  // "/" redirects to the first registered section (AIR, in nav order).
  const defaultSectionPath = sectionRoutes[0]?.path ?? '/air/'
  settingsReturn.reset()

  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', redirect: defaultSectionPath },
      ...sectionRoutes,
      // The Settings page. It renders no view of its own: the Settings panel
      // (App) is shown full-screen for it by `useSettingsRouteSync`.
      { path: '/settings/:section?', name: SETTINGS_ROUTE_NAME, component: { render: () => null } },
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

  router.beforeEach((to) => {
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
