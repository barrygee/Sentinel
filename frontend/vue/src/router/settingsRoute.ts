import { reactive } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'

/**
 * Settings URLs (`/settings/<section>`): Settings is a page of its own, so a
 * link can open a settings page directly. Like switching sections, going to it
 * leaves the section you were on (its view unmounts; the SDR engine, outside
 * the routed view, plays on); closing it returns there.
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
 * Where closing Settings returns to: the last section page visited, or — when
 * a settings link was the first thing opened — the page the router chose for it.
 */
export const settingsReturn = reactive({
  path: null as string | null,
  /** Forget it (a new router starts with nowhere to return to). */
  reset(): void {
    settingsReturn.path = null
  },
})
