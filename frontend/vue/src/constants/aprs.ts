/**
 * Shared APRS presentation constants for the Land domain.
 *
 * APRS map labels are deliberately monochrome — white glyph and text on the
 * pill's black, with the symbol chip in the app's standard grey. The Air domain
 * uses colour to carry meaning (lime for military, blue for civil, red for an
 * emergency squawk), so leaving Land uncoloured keeps colour meaningful rather
 * than decorative. Contrast is 21:1 for the text and 13:1 for the chip.
 */

/** Glyph and text colour for APRS station labels on the map. */
export const APRS_ACCENT_COLOR = '#ffffff'

/**
 * Fill behind the APRS symbol icon and its type chip.
 *
 * The same charcoal as the sidebar list the stations are listed in
 * (`#map-sidebar` in `MapSidebar.vue`, `rgba(21, 23, 29, 0.98)`), so a label
 * and its row read as one surface. Duplicated as a hex rather than read from
 * the custom property because marker elements are handed to MapLibre and live
 * outside the Vue tree; `aprsStyle.spec.ts` guards the two staying in step.
 */
export const APRS_BADGE_BACKGROUND = '#15171d'

/** Fill of a count marker's centre — black, as the labels' own background is,
 *  so a group reads as part of the same set as the labels it stands in for. */
export const APRS_COUNT_FILL = '#000000'

/**
 * Ring around a count marker.
 *
 * The SDR spectrum's signal blue around the black centre, so the marker reads
 * as a group of plotted items rather than a site marker.
 *
 * Semitransparent: the ring sits flush against the centre and is wide enough to
 * hide a fair patch of ground, so letting the map through keeps a group of
 * stations from blanking out what it stands over. Blue, not black, so a
 * group of stations is told apart at a glance from the dark-ringed
 * Sentinel/Sentry site markers.
 */
export const APRS_COUNT_RING = 'rgba(0, 170, 255, 0.25)'

/**
 * Rings for the other Land layers' count markers. Each layer groups its own
 * points, and several layers can be on at once, so a count's ring says which
 * set it stands for: APRS blue (above), cameras dark green, repeaters lime —
 * at the same transparency so the map still shows through. (Cameras were
 * amber, which read as brown over the dark base map.)
 */
export const TRAFFIC_CAMERA_COUNT_RING = 'rgba(0, 120, 60, 0.45)'
export const REPEATER_COUNT_RING = 'rgba(200, 255, 0, 0.3)'
