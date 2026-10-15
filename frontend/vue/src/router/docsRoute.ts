import { reactive } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'

/**
 * Docs URLs (`/doc/<page>`): like Settings, the docs page leaves the section
 * you were on (its view unmounts; the SDR engine, outside the routed view,
 * plays on) and closing it returns there. Unlike Settings it is an ordinary
 * routed view rather than a modal panel, because it is a document to read.
 */

/** Name of the `/doc/:docPath(.*)` route. */
export const DOCS_ROUTE_NAME = 'doc'

/** True while a `/doc/...` URL is active. */
export function isDocsRoute(route: Pick<RouteLocationNormalized, 'name'>): boolean {
  return route.name === DOCS_ROUTE_NAME
}

/** The page path a docs route names (`operations`), empty for the welcome page. */
export function docsParamOf(route: Pick<RouteLocationNormalized, 'params'>): string {
  const param = route.params.docPath
  return typeof param === 'string' ? param : ''
}

/**
 * Where closing Docs returns to: the last page visited that was not a docs
 * page — a section, or a `/settings/<section>` page when Docs was opened from
 * the Settings rail (so closing Docs lands back in Settings, and closing
 * Settings then lands on the map). When a docs link was the first thing opened,
 * the router fills in the first enabled section.
 */
export const docsReturn = reactive({
  path: null as string | null,
  /** The control that opened Docs, so closing can hand focus back to it. */
  opener: null as HTMLElement | null,
  /** Forget it (a new router starts with nowhere to return to). */
  reset(): void {
    docsReturn.path = null
    docsReturn.opener = null
  },
})
