import * as maplibregl from 'maplibre-gl'
import { SentinelControlBase } from '@sentinel/map-kit/sentinel-control-base/SentinelControlBase'
import {
  buildRingsGeoJSON,
  buildRingTopsGeoJSON,
  RING_DISTANCES_NM,
} from '@sentinel/map-kit/utils/rangeRings'
import type { ResolvedRingOrigin } from '@sentinel/map-kit/composables/useRangeRingOrigin'
import { isBrightBasemap, overlayAccentColor } from '@sentinel/map-kit/utils/mapTheme'

/**
 * The shared behaviour of every domain's range-rings control: concentric
 * distance rings drawn around the **ring origin** (see `useRangeRingOrigin`),
 * plus the map furniture that says *which* point they are centred on.
 *
 * Extracted from the byte-for-byte twins the Air and Land controls had become —
 * both built the same source, the same dashed line layer and the same
 * "hide unless there is a centre" rule, and both would otherwise have grown the
 * same origin crosshair and label. Subclasses supply only what genuinely
 * differs: the layer id prefix, and where the on/off toggle is persisted.
 *
 * Rings are only ever shown when the operator's toggle is on **and** an origin
 * resolves. Toggling on without one does nothing: rings pinned to the map
 * centre would be a measurement of nothing.
 */
export abstract class RangeRingsControlBase extends SentinelControlBase {
  /** Stroke of the rings and origin crosshair on the dark basemap. */
  private static readonly DARK_STROKE = 'rgba(255,255,255,0.40)'

  /**
   * Ring distance labels: --map-overlay-ink at slightly reduced strength (light
   * on the dark map, dark on the light one), bold and with no halo — the
   * weight alone carries it, and any halo read as a drop shadow.
   */
  private static readonly DARK_MAP_DISTANCE_INK = 'rgba(255,255,255,0.85)'
  private static readonly LIGHT_MAP_DISTANCE_INK = 'rgba(27,29,34,0.85)'

  /** Whether the operator has the rings switched on for this map. */
  ringsVisible: boolean

  /** Where the rings are centred, or null when nothing can be drawn. */
  protected origin: ResolvedRingOrigin | null = null

  /**
   * The base id for this map's ring layers — also the source id, so the
   * existing per-domain ids (`range-rings-lines`, `land-range-rings`) survive
   * this extraction unchanged.
   */
  protected abstract get layerId(): string

  /** Record the toggle wherever this domain keeps it (a store, localStorage). */
  protected abstract persistVisible(visible: boolean): void

  constructor(initiallyVisible: boolean, initialOrigin: ResolvedRingOrigin | null) {
    super()
    this.ringsVisible = initiallyVisible
    this.origin = initialOrigin
  }

  private get originLayerId(): string {
    return `${this.layerId}-origin`
  }
  private get originDotLayerId(): string {
    return `${this.layerId}-origin-dot`
  }
  private get labelLayerId(): string {
    return `${this.layerId}-label`
  }
  /** Each ring's distance, at the top of the ring (layer and its point source). */
  private get distanceLayerId(): string {
    return `${this.layerId}-distances`
  }

  get buttonLabel(): string {
    return '◎'
  }
  get buttonTitle(): string {
    return 'Toggle range rings'
  }

  protected onInit(): void {
    this.setButtonActive(this.ringsVisible)
    if (this.map.isStyleLoaded()) this._initRings()
    else this.map.once('style.load', () => this._initRings())
  }

  protected handleClick(): void {
    this.ringsVisible = !this.ringsVisible
    this.setButtonActive(this.ringsVisible)
    this.persistVisible(this.ringsVisible)
    // Honour the toggle, but rings still only show if an origin resolves.
    this._applyVisibility()
  }

  /**
   * Re-centre (or clear) the rings.
   *
   * The one entry point for everything about where the rings are: the geometry,
   * the crosshair marking a centre that is not the ⊙ marker, the ring label,
   * and whether any of it is shown at all.
   */
  setOrigin(origin: ResolvedRingOrigin | null): void {
    // The origin is recomputed on every Sentry poll, so most calls carry the
    // same point as the last: rebuilding 5 × 65-point rings every 15 seconds
    // for no visible change is work the map does not need.
    if (this._sameOrigin(origin)) return
    this.origin = origin
    if (!this.map) return
    const ringsSource = this.map.getSource(this.layerId) as maplibregl.GeoJSONSource | undefined
    if (ringsSource) ringsSource.setData(this._buildRings())
    const originSource = this.map.getSource(this.originLayerId) as
      | maplibregl.GeoJSONSource
      | undefined
    if (originSource) originSource.setData(this._buildOriginPoint())
    const distanceSource = this.map.getSource(this.distanceLayerId) as
      | maplibregl.GeoJSONSource
      | undefined
    if (distanceSource) distanceSource.setData(this._buildRingTops())
    this._applyLabel()
    this._applyVisibility()
  }

  /** Build the source data + layers for this map's style. Re-run on style reload. */
  _initRings(): void {
    // Faint white disappears on the light and colour basemaps, so there the
    // rings take the same black as the satellite ground track. Read here
    // because a palette change reloads the style and re-runs this method.
    const brightBasemap = isBrightBasemap()
    const stroke = brightBasemap ? overlayAccentColor() : RangeRingsControlBase.DARK_STROKE
    for (const id of [
      this.distanceLayerId,
      this.labelLayerId,
      this.originDotLayerId,
      this.originLayerId,
      this.layerId,
    ]) {
      if (this.map.getLayer(id)) this.map.removeLayer(id)
    }
    for (const id of [this.distanceLayerId, this.originLayerId, this.layerId]) {
      if (this.map.getSource(id)) this.map.removeSource(id)
    }

    this.map.addSource(this.layerId, { type: 'geojson', data: this._buildRings() })
    this.map.addLayer({
      id: this.layerId,
      type: 'line',
      source: this.layerId,
      layout: { visibility: 'none' },
      paint: {
        'line-color': stroke,
        'line-width': 1,
        'line-dasharray': [4, 4],
      },
    })

    this.map.addSource(this.originLayerId, { type: 'geojson', data: this._buildOriginPoint() })
    // A centre that is not your own ⊙ needs a mark of its own, or the rings
    // read as floating: the crosshair is what gives them a middle.
    this.map.addLayer({
      id: this.originLayerId,
      type: 'circle',
      source: this.originLayerId,
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': 5,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': stroke,
        'circle-stroke-width': 1.2,
      },
    })
    this.map.addLayer({
      id: this.originDotLayerId,
      type: 'circle',
      source: this.originLayerId,
      layout: { visibility: 'none' },
      paint: { 'circle-radius': 1.6, 'circle-color': stroke },
    })

    // The origin's name rides the outermost ring only — on every ring it would
    // repeat the same fact five times. `symbol-spacing` is screen distance between
    // placements along that ring, and it has to stay well under the ring's
    // on-screen circumference or the single placement lands off-view and the
    // label is invisible — which is exactly what a large spacing did here.
    this.map.addLayer({
      id: this.labelLayerId,
      type: 'symbol',
      source: this.layerId,
      filter: ['==', ['get', 'dist'], RING_DISTANCES_NM[RING_DISTANCES_NM.length - 1]],
      layout: {
        visibility: 'none',
        'symbol-placement': 'line',
        'text-font': ['Noto Sans Regular'],
        'text-field': '',
        'text-size': 10,
        'text-letter-spacing': 0.16,
        'text-max-angle': 45,
        'symbol-spacing': 500,
        'text-offset': [0, -0.9],
      },
      paint: {
        'text-color': brightBasemap ? '#000000' : 'rgba(255,255,255,0.65)',
        'text-halo-color': brightBasemap ? '#ffffff' : '#000000',
        'text-halo-width': 1,
      },
    })

    // Each ring's distance ("50 NM") once, just above the top of the ring.
    // Point labels sit in the viewport plane, so the text is always upright
    // and level whatever the zoom, pitch or bearing; labels placed along the
    // ring line flipped over as the ring's direction swung past vertical.
    // Allowed to overlap and kept out of collision detection so a label is
    // never dropped near the edge of view and never knocks out a basemap name.
    const distanceInk = brightBasemap
      ? RangeRingsControlBase.LIGHT_MAP_DISTANCE_INK
      : RangeRingsControlBase.DARK_MAP_DISTANCE_INK
    this.map.addSource(this.distanceLayerId, { type: 'geojson', data: this._buildRingTops() })
    this.map.addLayer({
      id: this.distanceLayerId,
      type: 'symbol',
      source: this.distanceLayerId,
      layout: {
        visibility: 'none',
        'symbol-placement': 'point',
        'text-field': ['concat', ['to-string', ['get', 'dist']], ' NM'],
        // Bold so the small label holds up against the ring line and basemap.
        // Only the ASCII range of Noto Sans Bold is bundled (digits + "NM").
        'text-font': ['Noto Sans Bold'],
        'text-size': 9,
        'text-letter-spacing': 0.1,
        'text-anchor': 'bottom',
        'text-offset': [0, -0.3],
        'text-rotation-alignment': 'viewport',
        'text-pitch-alignment': 'viewport',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': distanceInk,
      },
    })

    this._applyLabel()
    this._applyVisibility()
  }

  private _sameOrigin(next: ResolvedRingOrigin | null): boolean {
    const current = this.origin
    if (current === null || next === null) return current === next
    return (
      current.longitude === next.longitude &&
      current.latitude === next.latitude &&
      current.label === next.label &&
      current.kind === next.kind &&
      current.degraded === next.degraded
    )
  }

  private _buildRings(): GeoJSON.FeatureCollection {
    if (!this.origin) return { type: 'FeatureCollection', features: [] }
    return buildRingsGeoJSON(this.origin.longitude, this.origin.latitude)
  }

  private _buildRingTops(): GeoJSON.FeatureCollection {
    if (!this.origin) return { type: 'FeatureCollection', features: [] }
    return buildRingTopsGeoJSON(this.origin.longitude, this.origin.latitude)
  }

  private _buildOriginPoint(): GeoJSON.FeatureCollection {
    if (!this.origin) return { type: 'FeatureCollection', features: [] }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [this.origin.longitude, this.origin.latitude] },
          properties: {},
        },
      ],
    }
  }

  /**
   * Name the origin along the outer ring, flagging a position that has gone
   * stale. The distance is not repeated here: every ring carries its own.
   */
  private _applyLabel(): void {
    if (!this.map?.getLayer(this.labelLayerId)) return
    const origin = this.origin
    const text = origin ? `${origin.label}${origin.degraded ? ' · OFFLINE' : ''}` : ''
    this.map.setLayoutProperty(this.labelLayerId, 'text-field', text)
  }

  /** Single source of truth for what is shown. */
  private _applyVisibility(): void {
    if (!this.map?.getLayer(this.layerId)) return
    const ringsOn = this.ringsVisible && this.origin !== null
    this.map.setLayoutProperty(this.layerId, 'visibility', ringsOn ? 'visible' : 'none')
    // Distances go with the rings themselves, your own position included.
    if (this.map.getLayer(this.distanceLayerId)) {
      this.map.setLayoutProperty(this.distanceLayerId, 'visibility', ringsOn ? 'visible' : 'none')
    }
    // The ⊙ marker already marks your own position, so the crosshair and the
    // label are for the cases where the centre is somewhere else — showing them
    // on top of ⊙ would be noise, and its own name written twice.
    const originMarksOn = ringsOn && this.origin?.kind !== 'user'
    for (const id of [this.originLayerId, this.originDotLayerId, this.labelLayerId]) {
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', originMarksOn ? 'visible' : 'none')
      }
    }
  }
}
