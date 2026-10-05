import { createRouter, createWebHistory, type Router } from 'vue-router'
import { getSectionRoutes } from '@sentinel/shell-api/shell/sectionRegistry'
import { useAppStore } from '@sentinel/shell-api/stores/app'

/**
 * Builds the app router from the section registry — call it once the sections
 * have loaded and registered (main.ts), since the routes are whatever they
 * registered (docs/plans/section-containers.md §1.3, F1).
 */
export function createAppRouter(): Router {
  const sectionRoutes = getSectionRoutes()
  // "/" redirects to the first registered section (AIR, in nav order).
  const defaultSectionPath = sectionRoutes[0]?.path ?? '/air/'

  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', redirect: defaultSectionPath },
      ...sectionRoutes,
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })

  router.beforeEach((to) => {
    const domain = to.meta?.domain as string | undefined
    if (!domain) return
    const appStore = useAppStore()
    if (!appStore.enabledDomains.includes(domain)) {
      const first = appStore.firstEnabledDomain()
      return `/${first}/`
    }
  })

  router.afterEach((to) => {
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
