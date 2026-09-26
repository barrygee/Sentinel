import type { Map, StyleSpecification, TransformStyleFunction } from 'maplibre-gl'
import type { MapTheme } from '@/stores/theme'

/**
 * Make a style's `sprite` URL absolute against the page origin.
 *
 * The bundled fiord styles point at `/assets/sprites/ofm`, relative on purpose:
 * Sentinel is served from whatever address the host has, so the JSON cannot
 * name one. MapLibre 6 parses the sprite URL with `new URL()` and rejects a
 * relative one outright ("Invalid sprite URL … must be absolute"), which left
 * every basemap blank after the upgrade. Glyphs and tiles are fetched through
 * the request manager and resolve relatively as before, so only `sprite` needs
 * the help. An already-absolute sprite (or a multi-sprite array) is left alone.
 */
export const absoluteSpriteTransform: TransformStyleFunction = (
  _previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification => {
  if (typeof next.sprite !== 'string' || !next.sprite.startsWith('/')) return next
  return { ...next, sprite: new URL(next.sprite, window.location.origin).toString() }
}

/**
 * Swap a map's style by URL, with the sprite fix applied. Every style change
 * goes through here rather than `map.setStyle` directly, so no call site can
 * forget the transform and reload a blank basemap.
 */
export function setMapStyle(map: Map, styleUrl: string): void {
  map.setStyle(styleUrl, { transformStyle: absoluteSpriteTransform })
}

/**
 * The six bundled basemaps: a dark (`fiord`), a light (`positron`) and a
 * full-colour (`cartographic`) pair, each with an online build (planet vector
 * tiles) and an offline one (the local PMTiles archives). All six are the same
 * map — same sources, same layers in the same order, same layer ids — with
 * only their paint colours differing, so a palette change is a repaint and
 * every layer-id-driven control keeps working. The colour pair is generated
 * from the light one by `frontend/scripts/build_colour_basemap.py`.
 */
const BASEMAP_STYLES: Record<MapTheme, { online: string; offline: string }> = {
  dark: { online: '/assets/fiord-online.json', offline: '/assets/fiord.json' },
  light: { online: '/assets/positron-online.json', offline: '/assets/positron.json' },
  colour: {
    online: '/assets/cartographic-online.json',
    offline: '/assets/cartographic.json',
  },
}

/** The basemap style a map should be showing for the given connectivity and theme. */
export function basemapStyleUrl(online: boolean, theme: MapTheme): string {
  const pair = BASEMAP_STYLES[theme]
  return online ? pair.online : pair.offline
}
