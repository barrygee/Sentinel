import { createRouter, createWebHistory } from 'vue-router'
import '@/shell/sections'
import { getSectionRoutes } from '@sentinel/shell-api/shell/sectionRegistry'
import { useAppStore } from '@sentinel/shell-api/stores/app'

// Routes are built from the section registry rather than importing each
// section's view directly — see docs/plans/section-containers.md §1.3 (F1).
// The registry is populated by the `shell/sections` import above, which must
// run before `getSectionRoutes()` is read.
const sectionRoutes = getSectionRoutes()
// "/" always redirects to the first registered section, which is AIR today —
// identical to the previous hard-coded `/air/` redirect while sections
// register in nav order.
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
    document.dispatchEvent(new CustomEvent('sentinel:domain-changed', { detail: { domain, prev } }))
  }
})

export default router
