/**
 * Contract between `MapSidebar.vue` (the host, which owns the `#msb-pane-*`
 * DOM nodes and renders them regardless of the active route) and the
 * domain views (`AirView.vue`, `SpaceView.vue`, ...) that `<Teleport>` their
 * own panels into those nodes from across the route tree.
 *
 * The ids used to be scattered as magic strings across the host and every
 * teleporting consumer, so renaming or adding a pane meant hunting down every
 * literal. This module is the single source of truth: `MapSidebar` binds its
 * pane element ids and rail `aria-controls` from here, and every teleporting
 * view/composable imports {@link sidebarPaneSelector} instead of hardcoding
 * a `#msb-pane-*` string.
 */

/** Sidebar tab/pane identifiers mapped to the DOM id MapSidebar renders for each. */
export const SIDEBAR_PANE_IDS = {
  search: 'msb-pane-search',
  alerts: 'msb-pane-alerts',
  tracking: 'msb-pane-tracking',
  passes: 'msb-pane-passes',
  playback: 'msb-pane-playback',
  radio: 'msb-pane-radio',
} as const

/** A valid sidebar pane identifier — the keys of {@link SIDEBAR_PANE_IDS}. */
export type SidebarPaneId = keyof typeof SIDEBAR_PANE_IDS

/**
 * CSS id-selector (e.g. `#msb-pane-search`) for a sidebar pane, for use as a
 * `<Teleport to="...">` target or a `document.querySelector` lookup.
 */
export function sidebarPaneSelector(pane: SidebarPaneId): string {
  return `#${SIDEBAR_PANE_IDS[pane]}`
}
