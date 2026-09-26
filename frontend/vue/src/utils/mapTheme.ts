/**
 * Theme lookups for map overlays.
 *
 * Overlay colours live in class-based `IControl`s rather than in CSS, so they
 * cannot pick the theme up from a stylesheet. They read the same
 * `<html data-theme>` attribute the theme store publishes instead of taking a
 * store in their constructor: a control is free to read it from `initLayers`,
 * which is exactly when it is needed, and every map re-runs `initLayers` after
 * a theme change reloads the basemap.
 */

/**
 * Whether the light basemap is the one currently loaded.
 *
 * Reads `data-map-theme`, not `data-theme`: the interface and the map have
 * separate controls, and an overlay's ink has to answer to the ground it is
 * drawn on, not to the panels around it.
 */
export function isLightTheme(): boolean {
  return document.documentElement.dataset.mapTheme === 'light'
}

/**
 * Ink for overlay geometry drawn in the brand lime on the dark basemap.
 *
 * Lime reads as a highlight against near-black, but it is one of the weakest
 * colours against near-white — on the light basemap the same lines all but
 * disappear. Black is the light theme's equivalent highlight, and keeps the
 * geometry the subject of the map rather than the basemap beneath it.
 */
export function overlayAccentColor(): string {
  return isLightTheme() ? '#000000' : '#c8ff00'
}
