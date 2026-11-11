/**
 * Airport and military base labels on the AIR map: the shared map-kit
 * `SiteMarkers`, drawn beneath the aircraft and in each kind's colours.
 *
 * Each site is a dot, black for civil and green for military, until it is
 * hovered or clicked; its label then opens over the dot. An aircraft over a
 * site takes the hover and the click.
 */
import type * as maplibregl from 'maplibre-gl'
import {
  CIVIL_SITE_COLOURS,
  SITE_LABEL_FILLS,
  SiteMarkers,
  type SiteMarker,
  type SiteMarkerColours,
} from '@sentinel/map-kit/controls/site-markers/SiteMarkers'

/** Whose airfield it is, which sets its colours. */
export type AirfieldKind = 'civil' | 'military'

/** One airfield on the map. */
export type AirfieldSite = SiteMarker

/** The dot layer of each kind. */
export const AIRFIELD_LAYER_IDS: Readonly<Record<AirfieldKind, string>> = {
  civil: 'airfield-labels-civil',
  military: 'airfield-labels-military',
}

/** The layer each kind opens its labels on. */
export const AIRFIELD_OPEN_LABEL_LAYER_IDS: Readonly<Record<AirfieldKind, string>> = {
  civil: 'airfield-labels-civil-open',
  military: 'airfield-labels-military-open',
}

/**
 * Bottom to top, for `AdsbLiveControl` to keep beneath the aircraft. Every dot
 * comes first, so an open label is never crossed by the other kind's dots.
 */
export const AIRFIELD_LAYER_ORDER: readonly string[] = [
  ...Object.values(AIRFIELD_LAYER_IDS),
  ...Object.values(AIRFIELD_OPEN_LABEL_LAYER_IDS),
]

/** Colours per kind: civil is the shared civil look; military is green. */
const KIND_COLOURS: Readonly<Record<AirfieldKind, SiteMarkerColours>> = {
  civil: CIVIL_SITE_COLOURS,
  military: { closedDot: '#c8ff00', accent: '#c8ff00', block: '#4d6600' },
}

/** Label fill per basemap: black on both, matching the aircraft tags. */
export const AIRFIELD_LABEL_FILLS = SITE_LABEL_FILLS

/** One control's airfield labels. */
export class AirfieldMarkers extends SiteMarkers {
  constructor(map: maplibregl.Map, sites: readonly AirfieldSite[], kind: AirfieldKind) {
    super(map, sites, {
      dotLayerId: AIRFIELD_LAYER_IDS[kind],
      labelLayerId: AIRFIELD_OPEN_LABEL_LAYER_IDS[kind],
      colours: KIND_COLOURS[kind],
      beneathLayerId: 'adsb-trail-line',
      priorityLayerId: 'adsb-hit',
    })
  }
}
