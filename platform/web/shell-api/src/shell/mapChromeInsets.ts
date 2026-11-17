/**
 * How much of a section map the shell's chrome covers at each side.
 *
 * Every section map fills the window, and the shell lays its rails and the side
 * panel over it: the left icon rail, the SEARCH/ALERTS panel beside it when
 * open, and the section's map-controls rail on the right. Centring something
 * on the map container therefore puts it off-centre on what the operator can
 * see, partly behind the panel. A camera move that should land in the middle
 * of the visible map pads (or offsets) by these insets.
 */

/** Pixels of the map hidden behind chrome at its left and right edges. */
export interface MapChromeInsets {
  left: number
  right: number
}

/** The shell chrome along the map's left edge, outermost first. */
export const LEFT_CHROME_SELECTORS = ['#map-sidebar-rail', '#map-sidebar'] as const

/** Each section's map-controls rail along the right edge. */
export const RIGHT_CHROME_SELECTORS = ['#side-menu', '#space-side-menu', '#sea-side-menu'] as const

/** The side panel's class while it is slid away (MapSidebar). */
const HIDDEN_PANEL_CLASS = 'msb-hidden'

/**
 * Below this many visible pixels the chrome covers the map (the full-width
 * drawer on a phone): insets that large would leave nothing to fit into, so
 * the map is treated as uncovered and the move centres on the whole map.
 */
export const MIN_VISIBLE_MAP_WIDTH_PX = 200

/**
 * Whether a chrome element is on screen: laid out (not `display: none`) and,
 * for the side panel, not slid away.
 */
function isShown(element: HTMLElement): boolean {
  return element.offsetWidth > 0 && !element.classList.contains(HIDDEN_PANEL_CLASS)
}

/**
 * The chrome elements that are on screen, as their laid-out left and right
 * edges. Layout offsets rather than the bounding box: the panel slides in with
 * a CSS transform, and the box would report it part-way during the slide.
 */
function shownEdges(selectors: readonly string[]): Array<{ left: number; right: number }> {
  const edges: Array<{ left: number; right: number }> = []
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector)
    if (element && isShown(element)) {
      edges.push({ left: element.offsetLeft, right: element.offsetLeft + element.offsetWidth })
    }
  }
  return edges
}

/**
 * The map's left and right insets behind the shell chrome that is on screen
 * now, measured against the map container. Zero on a side with no chrome, and
 * zero on both when the chrome would leave too little of the map to see.
 */
export function mapChromeInsets(mapContainer: HTMLElement): MapChromeInsets {
  const mapBox = mapContainer.getBoundingClientRect()
  const left = Math.max(
    0,
    ...shownEdges(LEFT_CHROME_SELECTORS).map((edge) => edge.right - mapBox.left),
  )
  const right = Math.max(
    0,
    ...shownEdges(RIGHT_CHROME_SELECTORS).map((edge) => mapBox.right - edge.left),
  )
  if (mapBox.width - left - right < MIN_VISIBLE_MAP_WIDTH_PX) return { left: 0, right: 0 }
  return { left, right }
}
