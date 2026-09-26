/**
 * Theme lookups for map overlays.
 *
 * Overlay colours live in class-based `IControl`s rather than in CSS, so they
 * cannot pick the theme up from a stylesheet. They read the
 * `<html data-map-theme>` attribute the theme store publishes instead of
 * taking a store in their constructor: a control is free to read it from
 * `initLayers`, which is exactly when it is needed, and every map re-runs
 * `initLayers` after a palette change reloads the basemap.
 *
 * `data-map-theme`, not `data-theme`: the interface and the map have separate
 * controls, and an overlay's ink has to answer to the ground it is drawn on,
 * not to the panels around it.
 */

/**
 * Whether the basemap currently loaded is a BRIGHT one — the light palette or
 * the full-colour cartographic build.
 *
 * Overlays only care about this much: dark ground or bright ground. Colour is
 * bright ground (cream land, blue sea), so it takes the same overlay ink the
 * light basemap does even though it is a different map.
 */
export function isBrightBasemap(): boolean {
  const mapTheme = document.documentElement.dataset.mapTheme
  return mapTheme === 'light' || mapTheme === 'colour'
}

/**
 * Ink for overlay geometry drawn in the brand lime on the dark basemap.
 *
 * Lime reads as a highlight against near-black, but it is one of the weakest
 * colours against anything pale — on the light and colour basemaps the same
 * lines all but disappear, and on the colour one they also compete with the
 * map's own greens and golds. Black is the bright basemaps' equivalent
 * highlight, and keeps the geometry the subject of the map rather than the
 * basemap beneath it.
 */
export function overlayAccentColor(): string {
  return isBrightBasemap() ? '#000000' : '#c8ff00'
}
