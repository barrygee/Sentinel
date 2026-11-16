/**
 * The position trail of the ADS-B map: the reported positions kept for every
 * aircraft, and the dots and altitude-coloured line drawn for the one aircraft
 * whose trail is showing (hovered, else selected).
 *
 * `AdsbLiveControl` owns one instance. It records positions as polls arrive and
 * decides *which* aircraft's trail shows and *when* it is redrawn; this class
 * keeps the history, builds the GeoJSON and line gradient, and owns the two
 * trail sources and layers. What it needs from the control comes through
 * {@link AircraftTrailsHost}.
 */
import type * as maplibregl from 'maplibre-gl'
import { altitudeColour } from '@sentinel/map-kit/aircraft-silhouettes/altitudeColour'
import {
  ARROW_COLOURS,
  SILHOUETTE_PALETTES,
  SILHOUETTE_PLAIN_COLOURS,
  type SilhouettePalette,
} from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'
import type { AircraftIconStyle } from '../../stores/air'
import type { AircraftGeoFeature } from './adsbFeature'
import { trailLineGradient } from './trailLineGradient'

/** The trail layers, bottom to top. */
export const TRAIL_LAYER_IDS = ['adsb-trail-line', 'adsb-trail-dots'] as const

const TRAIL_LINE_LAYER_ID = 'adsb-trail-line'
const TRAIL_DOTS_LAYER_ID = 'adsb-trail-dots'
const TRAIL_LINE_SOURCE_ID = 'adsb-trail-line-source'
const TRAIL_DOTS_SOURCE_ID = 'adsb-trails-source'

/** The default number of reported positions kept per aircraft. */
const DEFAULT_MAX_TRAIL_POINTS = 100

/** One reported position of an aircraft. */
export interface TrailEntry {
  lon: number
  lat: number
  alt: number
}

interface TrailGeoFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    alt: number
    colour: string
    opacity: number
    emerg: 0 | 1
    military: 0 | 1
    hex: string
  }
}

type TrailLineFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  { emerg: 0 | 1; military: 0 | 1; hex: string }
>

/** What the trail reads from the control that owns it. */
export interface AircraftTrailsHost {
  /** The map the trail is drawn on, or undefined before the control is on one. */
  getMap(): maplibregl.Map | undefined
  /** The aircraft currently known, as map features (their emergency/military state colours the trail). */
  features(): AircraftGeoFeature[]
  /** The selected aircraft, whose trail shows when no other aircraft's is asked for. */
  selectedHex(): string | null
  /** Where the aircraft is drawn right now, or null when it is not on the map: the line runs on to it. */
  interpolatedCoords(hex: string): [number, number] | null
  iconStyle(): AircraftIconStyle
  /** True when the trail takes its altitude's colour. */
  altitudeColouring(): boolean
  silhouettePalette(): SilhouettePalette
}

function emptyCollection<FeatureType>(): { type: 'FeatureCollection'; features: FeatureType[] } {
  return { type: 'FeatureCollection', features: [] }
}

export class AircraftTrails {
  /** Reported positions by aircraft hex, oldest first. */
  points: Record<string, TrailEntry[]> = {}
  /** How many positions are kept per aircraft; the oldest goes first. */
  maxPoints = DEFAULT_MAX_TRAIL_POINTS
  /** The aircraft whose trail is asked for (the hovered one); null falls back to the selection. */
  hex: string | null = null

  private dotsGeojson = emptyCollection<TrailGeoFeature>()
  private lineGeojson = emptyCollection<TrailLineFeature>()

  constructor(private readonly host: AircraftTrailsHost) {}

  /** The aircraft whose trail is drawn: the one asked for, else the selected one. */
  private shownHex(): string | null {
    return this.hex ?? this.host.selectedHex()
  }

  /** Keep a reported position, unless the aircraft has not moved since its last one. */
  record(hex: string, entry: TrailEntry): void {
    if (!this.points[hex]) this.points[hex] = []
    const trail = this.points[hex]
    const last = trail[trail.length - 1]
    if (!last || last.lon !== entry.lon || last.lat !== entry.lat) {
      trail.push(entry)
      if (trail.length > this.maxPoints) trail.shift()
    }
  }

  /** Drop an aircraft's history (it has gone, or parked after landing). */
  forget(hex: string): void {
    delete this.points[hex]
  }

  /**
   * Add the trail sources and layers, hidden. Run after the map's style (re)loads;
   * the dots start empty and come back on the next {@link rebuild}.
   */
  addLayers(map: maplibregl.Map): void {
    map.addSource(TRAIL_DOTS_SOURCE_ID, {
      type: 'geojson',
      data: emptyCollection<TrailGeoFeature>() as GeoJSON.GeoJSON,
    })
    map.addSource(TRAIL_LINE_SOURCE_ID, {
      type: 'geojson',
      // The altitude gradient along the line needs the source's line metrics.
      lineMetrics: true,
      data: this.lineGeojson as GeoJSON.GeoJSON,
    })
    map.addLayer({
      id: TRAIL_LINE_LAYER_ID,
      type: 'line',
      source: TRAIL_LINE_SOURCE_ID,
      layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-width': 4,
        'line-opacity': 0.75,
      },
    })
    map.addLayer({
      id: TRAIL_DOTS_LAYER_ID,
      type: 'circle',
      source: TRAIL_DOTS_SOURCE_ID,
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': 2.5,
        'circle-opacity': ['get', 'opacity'],
        'circle-stroke-width': 0,
        'circle-color': ['get', 'colour'],
      },
    })
  }

  /** Show or hide both trail layers, where they exist. */
  setVisibility(visible: boolean): void {
    // Only called once the control is on a map (filter and toggle changes).
    const map = this.host.getMap()!
    for (const layerId of TRAIL_LAYER_IDS) {
      if (map.getLayer(layerId))
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }
  }

  /** True when an aircraft's trail is asked for or selected (it may still have no points). */
  hasShownAircraft(): boolean {
    return !!this.shownHex()
  }

  /** Redraw the shown aircraft's trail (or none) from its kept positions. */
  rebuild(): void {
    const map = this.host.getMap()
    if (!map) return
    const hex = this.shownHex()
    const trailFeatures: TrailGeoFeature[] = []
    const lineFeatures: TrailLineFeature[] = []
    const showTrail = !!(hex && this.points[hex])
    let lineGradient: maplibregl.ExpressionSpecification | null = null

    if (showTrail && hex) {
      const points = this.points[hex]
      const pointCount = points.length
      const shownFeature = this.host.features().find((feature) => feature.properties.hex === hex)
      const isEmerg: 0 | 1 =
        shownFeature &&
        (shownFeature.properties.squawkEmerg === 1 ||
          (shownFeature.properties.emergency && shownFeature.properties.emergency !== 'none'))
          ? 1
          : 0
      const isMil: 0 | 1 = shownFeature && shownFeature.properties.military ? 1 : 0

      // Build dot features (oldest → newest)
      for (let index = 0; index < pointCount; index++) {
        const point = points[index]
        trailFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
          properties: {
            alt: point.alt,
            colour: this.colour(point.alt, isEmerg, isMil),
            opacity: (index + 1) / pointCount,
            emerg: isEmerg,
            military: isMil,
            hex,
          },
        })
      }

      const dedupedCoords = this.lineCoords(hex, points)
      if (dedupedCoords.length >= 2) {
        const reported = points.map((point) => ({
          lon: point.lon,
          lat: point.lat,
          colour: this.colour(point.alt, isEmerg, isMil),
        }))
        // The line runs on to the aircraft, in the colour of its latest report.
        const [headLon, headLat] = dedupedCoords.at(-1)!
        const head = { lon: headLon, lat: headLat, colour: reported.at(-1)!.colour }
        lineGradient = trailLineGradient([...reported, head])
        lineFeatures.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: dedupedCoords },
          properties: { emerg: isEmerg, military: isMil, hex },
        })
      }
    }

    this.dotsGeojson = { type: 'FeatureCollection', features: trailFeatures }
    this.lineGeojson = { type: 'FeatureCollection', features: lineFeatures }

    // Toggle layer visibility based on whether we have trail data
    const visibility = showTrail ? 'visible' : 'none'
    try {
      if (map.getLayer(TRAIL_LINE_LAYER_ID))
        map.setLayoutProperty(TRAIL_LINE_LAYER_ID, 'visibility', visibility)
      if (map.getLayer(TRAIL_DOTS_LAYER_ID))
        map.setLayoutProperty(TRAIL_DOTS_LAYER_ID, 'visibility', visibility)
    } catch {}
    try {
      if (map.getSource(TRAIL_DOTS_SOURCE_ID))
        (map.getSource(TRAIL_DOTS_SOURCE_ID) as maplibregl.GeoJSONSource).setData(
          this.dotsGeojson as GeoJSON.GeoJSON,
        )
      if (map.getSource(TRAIL_LINE_SOURCE_ID))
        (map.getSource(TRAIL_LINE_SOURCE_ID) as maplibregl.GeoJSONSource).setData(
          this.lineGeojson as GeoJSON.GeoJSON,
        )
      if (lineGradient && map.getLayer(TRAIL_LINE_LAYER_ID))
        map.setPaintProperty(TRAIL_LINE_LAYER_ID, 'line-gradient', lineGradient)
    } catch {}
  }

  /**
   * A trail's colour at a stored position, matching the aircraft: its altitude
   * colour then, or red throughout for an emergency. With no altitude to go on,
   * or altitude colouring off, it takes the aircraft's flat colour.
   */
  colour(altitudeFeet: number, isEmergency: 0 | 1, isMilitary: 0 | 1): string {
    const palette = this.host.silhouettePalette()
    if (isEmergency) return ARROW_COLOURS.emergency
    if (this.host.altitudeColouring() && altitudeFeet > 0) {
      return altitudeColour(altitudeFeet, palette)
    }
    if (isMilitary) return ARROW_COLOURS.military
    if (this.host.iconStyle() !== 'silhouette') return ARROW_COLOURS.civil
    return this.host.altitudeColouring()
      ? SILHOUETTE_PALETTES[palette].civil
      : SILHOUETTE_PLAIN_COLOURS[palette]
  }

  /** Trail line vertices: historical reported points, then the aircraft's current interpolated position. */
  private lineCoords(hex: string, points: TrailEntry[]): [number, number][] {
    const lineCoords: [number, number][] = points.map((point) => [point.lon, point.lat])
    const interpolatedCoords = this.host.interpolatedCoords(hex)
    if (interpolatedCoords) lineCoords.push(interpolatedCoords)
    // Deduplicate consecutive identical coords to avoid zero-length segments
    return lineCoords.filter(
      (coord, index) =>
        index === 0 ||
        coord[0] !== lineCoords[index - 1][0] ||
        coord[1] !== lineCoords[index - 1][1],
    )
  }

  /**
   * Keeps the trail line's leading vertex attached to the dead-reckoned icon.
   * The icon moves every interpolation tick but {@link rebuild} only runs per
   * fetch, so without this the line end lags behind the aircraft and then snaps
   * forward on the next data reception. Only the single-feature line source is
   * updated (not the dots) to keep the per-tick setData cost minimal.
   */
  refreshLineHead(): void {
    const hex = this.shownHex()
    const lineFeature = this.lineGeojson.features[0]
    const points = hex ? this.points[hex] : undefined
    if (!hex || !lineFeature || lineFeature.properties.hex !== hex || !points) return
    const lineCoords = this.lineCoords(hex, points)
    if (lineCoords.length < 2) return
    lineFeature.geometry.coordinates = lineCoords
    try {
      ;(
        this.host.getMap()?.getSource(TRAIL_LINE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      )?.setData(this.lineGeojson as GeoJSON.GeoJSON)
    } catch {}
  }

  /** Forget every aircraft's history and empty both trail sources. */
  clear(): void {
    this.dotsGeojson = emptyCollection<TrailGeoFeature>()
    this.lineGeojson = emptyCollection<TrailLineFeature>()
    this.hex = null
    this.points = {}
    // Before the control is on a map there is nothing to empty: getSource throws inside the try and is caught.
    const map = this.host.getMap()!
    try {
      ;(map.getSource(TRAIL_DOTS_SOURCE_ID) as maplibregl.GeoJSONSource)?.setData(
        this.dotsGeojson as GeoJSON.GeoJSON,
      )
    } catch {}
    try {
      ;(map.getSource(TRAIL_LINE_SOURCE_ID) as maplibregl.GeoJSONSource)?.setData(
        this.lineGeojson as GeoJSON.GeoJSON,
      )
    } catch {}
  }
}
