/**
 * A live object as the renderer sees it: where it is, which way it points,
 * its colour and what its label says. Built from the feed's items by
 * `feeds/globeObjects.ts`, so the renderer knows nothing about the feed.
 */
import type { BadgeColours } from './objectStyles'

/** The kinds of live object the globe draws as points. */
export type GlobeObjectKind = 'air' | 'sea' | 'aprs'

/** What an object's label pill shows. */
export interface GlobeObjectLabel {
  /** Callsign, vessel name or station callsign. */
  name: string
  /** The short badge after the name (type code, vessel type, APRS symbol), if any. */
  badge: string | null
  badgeColours: BadgeColours
  /** Background of the glyph well at the pill's end. */
  wellBackground: string
}

/** One drawable object. */
export interface GlobeObject {
  /** Unique across kinds: `air:4ca123`, `sea:235009802`, `aprs:M0ABC-9`. */
  key: string
  kind: GlobeObjectKind
  lat: number
  lon: number
  /** Scene units above the surface (aircraft sit a little higher the higher they fly). */
  heightAboveSurface: number
  /** True heading or course in degrees, or null when unknown (drawn as a dot). */
  headingDeg: number | null
  /** CSS colour of its mark. */
  colour: string
  /** Always labelled, whatever the cap (an emergency squawk). */
  urgent: boolean
  label: GlobeObjectLabel
}
