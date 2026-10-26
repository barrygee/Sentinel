import { createRouter, createWebHistory, type Router } from 'vue-router'
import { getSettingsSections } from '@sentinel/shell-api/shell/settingsRegistry'
import {
  SETTINGS_ROUTE_NAME,
  isSettingsRoute,
  settingsReturn,
  settingsSectionOf,
} from './settingsRoute'

/**
 * The router for SDR Manager-only mode (ADR 0007): the Settings page and
 * nothing else. There are no section routes and no docs, so every other URL —
 * `/`, an old `/air/` bookmark, a Settings section no remote registered —
 * lands on `landingPath` (core's, normally `/settings/sdr-manager`).
 */
export function createSdrManagerOnlyRouter(landingPath: string): Router {
  // Closing Settings (the panel's route sync) goes back to the landing page,
  // which is Settings again: the panel is the whole app here.
  settingsReturn.reset()
  settingsReturn.path = landingPath

  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/settings/:section?', name: SETTINGS_ROUTE_NAME, component: { render: () => null } },
      { path: '/:pathMatch(.*)*', redirect: landingPath },
    ],
  })

  router.beforeEach((to) => {
    if (!isSettingsRoute(to)) return
    const section = settingsSectionOf(to)
    const offered = getSettingsSections().some((candidate) => candidate.key === section)
    if (!offered && to.path !== landingPath) return landingPath
  })

  return router
}
