import type maplibregl from 'maplibre-gl'
import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import type { useSeaStore } from '@/stores/sea'

type SeaStore = ReturnType<typeof useSeaStore>

const SOURCE_ID = 'sea-shipping-lanes'
const LAYER_FILL = 'sea-shipping-lanes-fill'
const LAYER_LINE = 'sea-shipping-lanes-line'
const LAYER_LINE_DASHED = 'sea-shipping-lanes-line-dashed'

/** Kinds drawn dashed, as a chart prints them; everything else is solid. */
const DASHED_KINDS = ['separation_boundary', 'recommended_route', 'recommended_track', 'fairway']

/** Zoom below which no routes are requested or drawn — the view is too wide
 *  for the backend's cell budget, and lanes are unreadable at that scale. */
export const SHIPPING_LANES_MIN_ZOOM = 7

/** Chart magenta — the colour routeing measures are printed in. Kept off the
 *  passenger-pink of the vessel palette so a lane never reads as a ship. */
const ROUTE_COLOR = '#c46bff'

/** Settle time after a map move before the viewport's routes are requested. */
const FETCH_DEBOUNCE_MS = 350

/** How long to wait before asking again while the backend is still filling
 *  cells for this view in the background. */
const PARTIAL_RETRY_MS = 4_000

/**
 * Sea-map control that draws the charted route structure — traffic
 * separation lanes, zones and boundaries, roundabouts, precautionary areas,
 * inshore traffic zones, two-way / recommended / deep-water routes and
 * fairways — as lines and light fills.
 *
 * Geometry comes from `GET /api/sea/lanes?bbox=` (OpenStreetMap seamarks,
 * cell-cached on the backend), fetched for the padded viewport whenever the
 * map settles while the layer is on. Nothing else from the chart is drawn:
 * lights, buoys and areas are deliberately left out.
 *
 * Visibility lives on the Sea store's overlay flags, so the rail button, the
 * default-layers config and this control can never disagree. The layers sit
 * beneath the vessel layers so a route never covers a ship or its label.
 */
export class ShippingLanesControl extends SentinelControlBase {
  private readonly _seaStore: SeaStore
  private _onMoveEnd: (() => void) | null = null
  private _fetchTimer: ReturnType<typeof setTimeout> | null = null
  private _inFlight: AbortController | null = null
  private _collection: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  /** The bbox the current collection was fetched for, to skip repeat fetches. */
  private _fetchedBbox: string | null = null

  constructor(seaStore: SeaStore) {
    super()
    this._seaStore = seaStore
  }

  get buttonLabel(): string {
    // Two lanes with opposing arrows either side of a separation line.
    return (
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2 5.5h9m0 0-2-2m2 2-2 2" /><path d="M14 10.5H5m0 0 2-2m-2 2 2 2" />' +
      '<path d="M2 8h12" stroke-dasharray="1.5 2" /></svg>'
    )
  }

  get buttonTitle(): string {
    return 'Toggle shipping lanes'
  }

  get visible(): boolean {
    return this._seaStore.overlayStates.shippingLanes
  }

  protected onInit(): void {
    this.initLayers()
    this._onMoveEnd = () => this._scheduleFetch()
    this.map.on('moveend', this._onMoveEnd)
    this._scheduleFetch()
  }

  protected handleClick(): void {
    this._seaStore.setOverlay('shippingLanes', !this.visible)
    this.applyVisibility()
  }

  /** Toggle from the side menu. */
  toggle(): void {
    this.handleClick()
  }

  onRemove(): void {
    if (this._onMoveEnd) this.map.off('moveend', this._onMoveEnd)
    this._onMoveEnd = null
    if (this._fetchTimer) clearTimeout(this._fetchTimer)
    this._fetchTimer = null
    this._inFlight?.abort()
    this._inFlight = null
    super.onRemove()
  }

  /**
   * (Re)create the source and layers. Safe to call after a style reload. The
   * layers go in beneath the first vessel layer when one exists.
   */
  initLayers(): void {
    if (!this.map.getSource(SOURCE_ID)) {
      this.map.addSource(SOURCE_ID, { type: 'geojson', data: this._collection })
    }
    const beneath = this.map.getLayer('sea-vessel-track-line') ? 'sea-vessel-track-line' : undefined
    if (!this.map.getLayer(LAYER_FILL)) {
      this.map.addLayer(
        {
          id: LAYER_FILL,
          type: 'fill',
          source: SOURCE_ID,
          minzoom: SHIPPING_LANES_MIN_ZOOM,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': ROUTE_COLOR,
            // Separation zones are the "keep out" strip between lanes, so they
            // read a touch heavier than the lanes and areas around them.
            'fill-opacity': [
              'match',
              ['get', 'kind'],
              ['separation_zone', 'separation_roundabout'],
              0.22,
              ['precautionary_area', 'inshore_traffic_zone'],
              0.06,
              0.1,
            ] as maplibregl.ExpressionSpecification,
          },
        },
        beneath,
      )
    }
    // `line-dasharray` cannot be data-driven, so dashed and solid kinds are
    // two layers over the same source.
    const lineWidth = [
      'match',
      ['get', 'kind'],
      ['separation_line', 'separation_boundary'],
      1.6,
      ['fairway'],
      0.8,
      1.2,
    ] as maplibregl.ExpressionSpecification
    if (!this.map.getLayer(LAYER_LINE)) {
      this.map.addLayer(
        {
          id: LAYER_LINE,
          type: 'line',
          source: SOURCE_ID,
          minzoom: SHIPPING_LANES_MIN_ZOOM,
          filter: ['!', ['in', ['get', 'kind'], ['literal', DASHED_KINDS]]],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ROUTE_COLOR, 'line-width': lineWidth, 'line-opacity': 0.85 },
        },
        beneath,
      )
    }
    if (!this.map.getLayer(LAYER_LINE_DASHED)) {
      this.map.addLayer(
        {
          id: LAYER_LINE_DASHED,
          type: 'line',
          source: SOURCE_ID,
          minzoom: SHIPPING_LANES_MIN_ZOOM,
          filter: ['in', ['get', 'kind'], ['literal', DASHED_KINDS]],
          layout: { 'line-join': 'round' },
          paint: {
            'line-color': ROUTE_COLOR,
            'line-width': lineWidth,
            'line-opacity': 0.85,
            'line-dasharray': [3, 2],
          },
        },
        beneath,
      )
    }
    this.applyVisibility()
  }

  /** Push the store's flag onto the layers and the button, fetching if newly on. */
  applyVisibility(): void {
    const shown = this.visible ? 'visible' : 'none'
    for (const layer of [LAYER_FILL, LAYER_LINE, LAYER_LINE_DASHED]) {
      if (this.map.getLayer(layer)) this.map.setLayoutProperty(layer, 'visibility', shown)
    }
    this.setButtonActive(this.visible)
    if (this.visible) this._scheduleFetch()
  }

  // ── data ───────────────────────────────────────────────────────────────────

  private _scheduleFetch(delayMs = FETCH_DEBOUNCE_MS, force = false): void {
    if (this._fetchTimer) clearTimeout(this._fetchTimer)
    this._fetchTimer = setTimeout(() => {
      this._fetchTimer = null
      void this._fetchViewport(force)
    }, delayMs)
  }

  /** Fetch the routes for the padded viewport, unless they are already held.
   *  `force` re-asks for a bbox already held — used while the backend is still
   *  filling in cells for it. */
  private async _fetchViewport(force = false): Promise<void> {
    if (!this.visible || this.map.getZoom() < SHIPPING_LANES_MIN_ZOOM) return
    const bounds = this.map.getBounds()
    const latPad = (bounds.getNorth() - bounds.getSouth()) * 0.25
    const lonPad = (bounds.getEast() - bounds.getWest()) * 0.25
    const bbox = [
      Math.max(-90, bounds.getSouth() - latPad),
      Math.max(-180, bounds.getWest() - lonPad),
      Math.min(90, bounds.getNorth() + latPad),
      Math.min(180, bounds.getEast() + lonPad),
    ]
      .map((edge) => edge.toFixed(2))
      .join(',')
    if (bbox === this._fetchedBbox && !force) return
    this._inFlight?.abort()
    const controller = new AbortController()
    this._inFlight = controller
    try {
      const response = await fetch(`/api/sea/lanes?bbox=${bbox}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!response.ok) return
      const collection = (await response.json()) as GeoJSON.FeatureCollection & {
        tooWide?: boolean
        partial?: boolean
      }
      if (controller.signal.aborted) return
      // A too-wide answer carries no features: keep what is drawn rather than
      // blanking the routes the operator was just looking at.
      if (collection.tooWide) return
      this._collection = { type: 'FeatureCollection', features: collection.features }
      this._fetchedBbox = bbox
      const source = this.map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      source?.setData(this._collection)
      // The backend is still fetching some cells for this view — ask again.
      if (collection.partial) this._scheduleFetch(PARTIAL_RETRY_MS, true)
    } catch {
      /* aborted or offline — the last routes stay drawn */
    } finally {
      if (this._inFlight === controller) this._inFlight = null
    }
  }
}
