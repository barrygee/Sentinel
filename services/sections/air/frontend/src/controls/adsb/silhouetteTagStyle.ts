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
