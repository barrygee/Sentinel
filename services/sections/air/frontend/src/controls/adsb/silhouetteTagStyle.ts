/**
 * How aircraft data is written beside a silhouette: plain text, with no
 * background block and no shadow or outline. Shared by the map's hover and
 * selected tags and the Aircraft Icons settings example, so the example always
 * looks like the map.
 */

/**
 * Text sizes beside a silhouette, in CSS pixels: ADS-B Exchange's 12px labels,
 * which sit in proportion to a 21–32px aircraft. The arrow-mode tag's 14px
 * reads as larger than the aircraft it names.
 */
export const SILHOUETTE_TAG_CALLSIGN_PX = 12
/** Data fields (type, altitude, squawk…) one step smaller than the callsign. */
export const SILHOUETTE_TAG_FIELD_PX = 11

/**
 * Line height of a stacked tag's rows, as a multiple of the font size. The
 * app's own 20px line height would leave a line's worth of space under each
 * 11–12px row.
 */
export const SILHOUETTE_TAG_LINE_HEIGHT = 1.2

/**
 * Half the callsign row's height, in CSS pixels. A silhouette's tag hangs from
 * its top edge, raised by this much, so the callsign is level with the
 * aircraft however many fields are stacked below it.
 */
export const SILHOUETTE_TAG_CALLSIGN_HALF_LINE_PX =
  (SILHOUETTE_TAG_CALLSIGN_PX * SILHOUETTE_TAG_LINE_HEIGHT) / 2
