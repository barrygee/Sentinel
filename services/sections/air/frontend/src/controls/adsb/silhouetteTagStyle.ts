/**
 * How aircraft data is written beside a silhouette: plain text with no
 * background block, as ADS-B Exchange and Flightradar24 do. Shared by the map's
 * hover and selected tags and the Aircraft Icons settings example, so the
 * example always looks like the map.
 */

/**
 * Dark halo behind the text: it keeps it readable over light imagery and
 * terrain with no background block behind it.
 */
export const SILHOUETTE_TAG_TEXT_HALO =
  'text-shadow:0 0 2px #000,0 0 3px #000,1px 1px 1px #000,-1px -1px 1px #000;'

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
