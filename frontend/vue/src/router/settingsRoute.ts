import { computed, reactive, type ComputedRef } from 'vue'
import {
  useRoute,
  useRouter,
  type RouteLocationNormalized,
  type RouteLocationNormalizedLoaded,
} from 'vue-router'

/**
 * Settings URLs (`/settings/<section>`), so a link can open a settings page
 * directly. Settings stays a panel over the page you were on: while a settings
 * URL is active the shell keeps rendering that page (`useViewRoute`), so its
 * map and the SDR audio carry on, and the panel opens over it.
 */

/** Name of the `/settings/:section` route. */
export const SETTINGS_ROUTE_NAME = 'settings'
/** The Settings section `/settings` (no section, or one not on offer) lands on. */
export const DEFAULT_SETTINGS_SECTION = 'app'

/** True while a `/settings/<section>` URL is active. */
export function isSettingsRoute(route: Pick<RouteLocationNormalized, 'name'>): boolean {
  return route.name === SETTINGS_ROUTE_NAME
}

/** The Settings section a settings route names (empty when it names none). */
export function settingsSectionOf(route: Pick<RouteLocationNormalized, 'params'>): string {
  const section = route.params.section
  return typeof section === 'string' ? section : ''
}

/** The URL of a Settings section, e.g. `/settings/air`. */
export function settingsPath(section: string): string {
  return `/settings/${section}`
}

/**
 * The page under Settings: the last non-settings route, or — when a settings
 * link was the first thing opened — the page the router chose for it. Reactive,
 * so the view route follows it.
 */
export const settingsBackground = reactive({
  path: null as string | null,
  /** Forget it (a new router starts with no page underneath). */
  reset(): void {
    settingsBackground.path = null
  },
})

/**
 * The route whose page is on screen: under Settings, the page it opened over;
 * otherwise the current route. App renders `<RouterView :route>` from it and
 * lays out by it, so opening Settings changes nothing behind the panel.
 */
export function useViewRoute(): ComputedRef<RouteLocationNormalizedLoaded> {
  const route = useRoute()
  const router = useRouter()
  return computed(() =>
    isSettingsRoute(route) && settingsBackground.path
      ? (router.resolve(settingsBackground.path) as RouteLocationNormalizedLoaded)
      : route,
  )
}
