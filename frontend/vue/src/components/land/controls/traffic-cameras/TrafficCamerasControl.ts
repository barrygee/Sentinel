import * as maplibregl from 'maplibre-gl'
import { watch, type WatchStopHandle } from 'vue'
import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import { APRS_BADGE_BACKGROUND, APRS_COUNT_FILL, TRAFFIC_CAMERA_COUNT_RING } from '@/constants/aprs'
import {
  buildCountMarker,
  groupByGridCell,
  COUNT_MARKER_SIZE_PX,
} from '@/components/shared/map-cluster/mapCluster'
import { setMarkerAccessibleName } from '@/components/shared/map-label/mapMarkerAria'
import { escapeHtml } from '@/utils/escapeHtml'
import {
  appendMirrored,
  createAccentBadge,
  createGlyphWell,
  createLabelPill,
  createNameSegment,
  MAP_LABEL_SIZE_PX,
} from '@/components/shared/map-label/mapLabelParts'
import '@/components/shared/map-popup/landMapPopup.css'
import { imageUrl as buildImageUrl, clipUrl as buildClipUrl } from '@/services/landFeedsApi'
import type { useLandStore } from '@/stores/land'
import type { useLandFeedsStore } from '@/stores/landFeeds'
import type { CameraFeature, CameraFeatureState } from '@/types/landFeeds'

type LandStore = ReturnType<typeof useLandStore>
type LandFeedsStore = ReturnType<typeof useLandFeedsStore>
type LngLat = [number, number]

/** Zoom below which cameras are only ever drawn as per-area counts — a
 *  region-wide view of 890 London cameras has no room for pins at all. */
const LABEL_REVEAL_ZOOM = 11

/** Grid cell (in screen pixels) for grouping when the view is too far out
 *  for labels — one and a half count markers, so counts in neighbouring cells
 *  sit clear of each other instead of touching. */
const COUNT_GROUP_RADIUS_PX = COUNT_MARKER_SIZE_PX * 1.5

/** Grid cell (in screen pixels) once labels are showing. A labelled marker is
 *  a pill plus a two-line name ~140 px wide, so cameras sharing a cell this
 *  size would overprint each other's text; in central London that is most of
 *  them until ~zoom 14. Grouping is applied at every zoom, so a dense patch
 *  stays a readable count while the sparse ones around it get their pins. */
const LABEL_GROUP_RADIUS_PX = 120

/** Zoom from which, on a desktop-sized viewport, every visible camera shows
 *  its live preview as an always-open card instead of a pill you have to
 *  click. Street level: at ~15 a camera's card no longer hides its neighbours. */
const PREVIEW_CARD_ZOOM = 15

/** Viewports narrower than this keep the tap-to-open popup at every zoom —
 *  a phone cannot hold several 240 px cards and still show the road. Matches
 *  the app's `--bp-mobile` breakpoint. */
const PREVIEW_CARD_MIN_VIEWPORT_PX = 768

/** Default width of an always-open preview card. Cards are drag-resizable
 *  (CSS `resize`), and the last size the operator chose becomes the default
 *  for cards built afterwards, so one drag re-sizes the layer as it re-renders. */
const PREVIEW_CARD_DEFAULT_WIDTH_PX = 480
const PREVIEW_CARD_MIN_WIDTH_PX = 200
const PREVIEW_CARD_MAX_WIDTH_PX = 960

/** Cards sit above every pill marker (which have no explicit z-index, i.e. 0)
 *  so a card never hides behind a neighbouring label; raising a card by
 *  clicking it counts upward from here. */
const PREVIEW_CARD_BASE_Z_INDEX = 10

/** How far a count marker's click zooms in — enough to split most groups
 *  without jumping past the surrounding context. */
const CLUSTER_CLICK_ZOOM_STEP = 2

/** Extra margin (in CSS pixels) added around the visible map when deciding
 *  which cameras get markers at all, so a marker just off-screen doesn't pop
 *  in and out as the map is nudged. */
const VIEWPORT_PADDING_PX = 120

/** Floor on how often an always-open card's image is re-fetched, in
 *  milliseconds, so a fast feed can't be hammered by a busy render loop. */
const MIN_IMAGE_REFRESH_MS = 15_000

/**
 * Document event a marker click fires so the sidebar opens on the FILTER
 * tab (App.vue) with the camera's row expanded (LandFilter).
 */
export const CAMERA_OPEN_EVENT = 'land-open-camera'

/**
 * Document event the FILTER pane fires (a click on a row's preview still) to
 * fly the map to that camera and open its live view in a popup — the same
 * popup a click on the marker opens.
 */
export const CAMERA_PREVIEW_EVENT = 'land-preview-camera'

/** The camera glyph in the label's leading well, and on the rail button. */
const CAMERA_GLYPH_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#ffffff" stroke-width="1.4" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block">' +
  '<path d="M2 5.5h2.4l.9-1.5h5.4l.9 1.5H14v7.5H2z" /><circle cx="8" cy="9" r="2.2" /></svg>'

/**
 * Land-map control that plots live traffic camera feeds (Durham CC, TfL
 * JamCams in P0; more providers arrive with later phases) — see
 * `docs/plans/land-live-feeds.md` §5a for the exact visual spec every colour
 * and size below is taken from.
 *
 * Each camera is the shared Sentinel label pill the Air and Sea maps draw —
 * the camera glyph in the leading well, the name, then its view/location as
 * a badge — kept monochrome per the Land rule, grouped into APRS-style count
 * markers below `LABEL_REVEAL_ZOOM` and drawn individually above it, both
 * scoped to the current viewport so the DOM marker count never reflects the
 * full ~1,000-camera dataset at once. Clicking a label (or a count, which
 * first zooms in) opens the camera's live view in a focus-managed popup on
 * the map — the latest still, refreshed at the feed's cadence, plus the
 * looping clip where the provider offers one — and expands the camera's row
 * in the FILTER pane; the pane's preview still opens the same popup.
 *
 * Visibility and polling live on the Land stores so the rail button, the
 * default-layers config, the sidebar list and this control can never disagree
 * about what is currently shown.
 */
export class TrafficCamerasControl extends SentinelControlBase {
  private readonly _landStore: LandStore
  private readonly _landFeedsStore: LandFeedsStore
  private _markers = new Map<string, maplibregl.Marker>()
  private _markerSignatures = new Map<string, string>()
  /** Live images inside always-open preview cards, refreshed on each poll. */
  private _cardImages = new Map<string, { image: HTMLImageElement; lastRefreshAt: number }>()
  /** Monotonic z-index handed to whichever card was clicked last, so it sits
   *  above its neighbours until another is raised. */
  private _raisedZIndex = PREVIEW_CARD_BASE_Z_INDEX
  /** Width the operator last dragged a card to; new cards start at it. */
  private _previewCardWidthPx = PREVIEW_CARD_DEFAULT_WIDTH_PX
  private _cardResizeObserver: ResizeObserver | null = null
  private _clusterMarkers = new Map<string, maplibregl.Marker>()
  private _clusterCounts = new Map<string, number>()
  private _onMapMoveEnd: (() => void) | null = null
  private _stopWatch: WatchStopHandle | null = null
  private _a11yRegion: HTMLDivElement | null = null
  private _popup: maplibregl.Popup | null = null
  private _popupResizeObserver: ResizeObserver | null = null
  private _popupImageTimer: ReturnType<typeof setInterval> | null = null
  private _popupReturnFocusTo: HTMLElement | null = null

  /**
   * Bound once so `document.addEventListener`/`removeEventListener` target
   * the same function reference — the pane's preview still asks for the
   * camera's popup, so the map flies there first and opens it on arrival.
   */
  private readonly _onPreviewRequested = (event: Event): void => {
    const { featureId } = (event as CustomEvent<{ featureId: string }>).detail
    const feature = this._allFeatures().find((candidate) => candidate.properties.id === featureId)
    if (!feature) return
    const coordinates = feature.geometry.coordinates as LngLat
    const targetZoom = Math.max(this.map.getZoom(), LABEL_REVEAL_ZOOM)
    this.map.once('moveend', () => this._openPopup(feature, this.button))
    this.map.flyTo({ center: coordinates, zoom: targetZoom, duration: 300 })
  }

  constructor(landStore: LandStore, landFeedsStore: LandFeedsStore) {
    super()
    this._landStore = landStore
    this._landFeedsStore = landFeedsStore
  }

  get buttonLabel(): string {
    return CAMERA_GLYPH_SVG.replace('stroke="#ffffff"', 'stroke="currentColor"')
  }

  get buttonTitle(): string {
    return 'Toggle traffic cameras'
  }

  private get _visible(): boolean {
    return this._landStore.trafficCamerasLayerVisible
  }

  /** Whether this control currently holds a poll on the feeds store, so the
   *  store flag can change from anywhere (the sidebar tabs, Settings, a config
   *  upload) and polling always follows it exactly once. */
  private _polling = false

  protected onInit(): void {
    this._ensureA11yRegion()
    this._onMapMoveEnd = () => this._render()
    this.map.on('moveend', this._onMapMoveEnd)
    // The store flag is the truth: whoever flips it, the button, the poll and
    // the markers follow here.
    this._stopWatch = watch(
      () => [this._landFeedsStore.featuresByFeed, this._visible] as const,
      () => {
        this._applyVisibility()
        this._render()
      },
      { immediate: true, deep: true },
    )
    document.addEventListener(CAMERA_PREVIEW_EVENT, this._onPreviewRequested)
  }

  protected handleClick(): void {
    this.setVisible(!this._visible)
  }

  /** Set visibility to a specific value (e.g. from `land.defaultLayers`), a
   *  no-op if already in that state. */
  setVisible(visible: boolean): void {
    if (this._visible === visible) return
    this._landStore.setTrafficCamerasLayerVisible(visible)
  }

  /** Bring the button and the feed poll in line with the store flag. */
  private _applyVisibility(): void {
    this.setButtonActive(this._visible)
    if (this._visible && !this._polling) {
      this._polling = true
      void this._landFeedsStore.startPolling()
    } else if (!this._visible && this._polling) {
      this._polling = false
      this._landFeedsStore.stopPolling()
    }
  }

  onRemove(): void {
    /* v8 ignore start -- defensive: onInit always assigns the handler, and
       MapLibre never removes a control it did not add */
    if (this._onMapMoveEnd) this.map.off('moveend', this._onMapMoveEnd)
    /* v8 ignore stop */
    this._onMapMoveEnd = null
    this._stopWatch?.()
    this._stopWatch = null
    document.removeEventListener(CAMERA_PREVIEW_EVENT, this._onPreviewRequested)
    this._closePopup()
    if (this._polling) {
      this._polling = false
      this._landFeedsStore.stopPolling()
    }
    this._clearMarkers()
    this._a11yRegion?.remove()
    this._a11yRegion = null
    super.onRemove()
  }

  // ── data ─────────────────────────────────────────────────────────────────

  /** Every camera feature across every enabled feed, flattened. */
  private _allFeatures(): CameraFeature[] {
    return Object.values(this._landFeedsStore.featuresByFeed).flatMap(
      (collection) => collection.features,
    )
  }

  /** Features within the current map viewport (plus a screen-space margin),
   *  which is what both the map markers and the a11y table show — the same
   *  bbox-filtering the sidebar CAMERAS list applies. */
  private _visibleFeatures(): CameraFeature[] {
    const bounds = this.map.getBounds()
    const sw = this.map.project(bounds.getSouthWest())
    const ne = this.map.project(bounds.getNorthEast())
    const minX = Math.min(sw.x, ne.x) - VIEWPORT_PADDING_PX
    const maxX = Math.max(sw.x, ne.x) + VIEWPORT_PADDING_PX
    const minY = Math.min(sw.y, ne.y) - VIEWPORT_PADDING_PX
    const maxY = Math.max(sw.y, ne.y) + VIEWPORT_PADDING_PX
    return this._allFeatures().filter((feature) => {
      const point = this.map.project(feature.geometry.coordinates as LngLat)
      return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
    })
  }

  // ── rendering ────────────────────────────────────────────────────────────

  private _render(): void {
    const bounds = this.map.getBounds()
    this._landFeedsStore.setViewportBounds({
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    })
    this._syncMarkers(this._visible ? this._visibleFeatures() : [])
    this._renderA11yTable(this._visible ? this._visibleFeatures() : [])
  }

  private _syncMarkers(features: CameraFeature[]): void {
    const seen = new Set<string>()
    const seenClusters = new Set<string>()

    // Group at every zoom: a lone camera gets its pin, neighbours that would
    // overprint each other share one count. The radius widens once labels are
    // drawn because the label, not the pill, is what collides.
    const labelsShowing = this.map.getZoom() >= LABEL_REVEAL_ZOOM
    const groupRadiusPx = labelsShowing ? LABEL_GROUP_RADIUS_PX : COUNT_GROUP_RADIUS_PX
    for (const cluster of this._groupFeatures(features, groupRadiusPx)) {
      const loneFeature = cluster.features.length === 1 ? cluster.features[0] : undefined
      if (labelsShowing && loneFeature) {
        seen.add(loneFeature.properties.id)
        this._syncCameraMarker(loneFeature)
      } else {
        seenClusters.add(cluster.key)
        this._syncClusterMarker(cluster)
      }
    }

    for (const [featureId, marker] of this._markers) {
      if (!seen.has(featureId)) {
        marker.remove()
        this._markers.delete(featureId)
        this._markerSignatures.delete(featureId)
      }
    }
    for (const [key, marker] of this._clusterMarkers) {
      if (!seenClusters.has(key)) {
        marker.remove()
        this._clusterMarkers.delete(key)
        this._clusterCounts.delete(key)
      }
    }
  }

  private _groupFeatures(features: CameraFeature[], groupRadiusPx: number): FeatureCluster[] {
    const positions = new Map<string, { x: number; y: number }>()
    for (const feature of features) {
      positions.set(feature.properties.id, this.map.project(feature.geometry.coordinates as LngLat))
    }
    // Grid cells, not single-linkage: a city-wide lattice of cameras would
    // otherwise chain into one count (see `groupByGridCell`).
    return groupByGridCell(
      features.map((feature) => ({ key: feature.properties.id, feature })),
      positions,
      groupRadiusPx,
    ).map((cluster) => ({
      key: cluster.key,
      features: cluster.members.map((member) => member.feature),
      coordinates:
        cluster.members.length === 1
          ? (cluster.members[0]!.feature.geometry.coordinates as LngLat)
          : (this.map.unproject([cluster.position.x, cluster.position.y]).toArray() as LngLat),
    }))
  }

  /** Whether cameras render as always-open preview cards right now: street
   *  zoom on a desktop-sized viewport. Phones keep pills + popup. */
  private _previewCardsActive(): boolean {
    return (
      this.map.getZoom() >= PREVIEW_CARD_ZOOM &&
      window.matchMedia(`(min-width: ${PREVIEW_CARD_MIN_VIEWPORT_PX}px)`).matches
    )
  }

  private _syncCameraMarker(feature: CameraFeature): void {
    const id = feature.properties.id
    const asCard = this._previewCardsActive()
    // The card/pill choice is part of the identity: crossing the preview zoom
    // must rebuild the element, not just move it.
    const signature = `${asCard ? 'card' : 'pill'}:${JSON.stringify(feature.properties)}`
    const existing = this._markers.get(id)
    if (existing && this._markerSignatures.get(id) === signature) {
      existing.setLngLat(feature.geometry.coordinates as LngLat)
      this._refreshCardImage(id, feature)
      return
    }
    existing?.remove()
    this._cardImages.delete(id)
    const marker = new maplibregl.Marker({
      element: asCard ? this._buildPreviewCardElement(feature) : this._buildMarkerElement(feature),
      // A pill sits with its glyph well centred on the camera, as the Air and
      // Sea labels do; a card hangs from that same point.
      anchor: asCard ? 'top-left' : 'left',
      offset: asCard ? [8, -6] : [-MAP_LABEL_SIZE_PX / 2, 0],
    })
      .setLngLat(feature.geometry.coordinates as LngLat)
      .addTo(this.map)
    // Cards start above every pill (and above the other domains' markers);
    // a clicked card climbs above the rest via `_raiseMarker`.
    if (asCard) marker.getElement().style.zIndex = String(PREVIEW_CARD_BASE_Z_INDEX)
    this._markers.set(id, marker)
    this._markerSignatures.set(id, signature)
  }

  /** Re-point a card's image at a fresh cache-busted URL, at most once per
   *  refresh floor — `_render` runs on every store snapshot, which is already
   *  the feed's own cadence, so this mostly just guards a burst of renders. */
  private _refreshCardImage(id: string, feature: CameraFeature): void {
    const entry = this._cardImages.get(id)
    if (!entry || !feature.properties.imageUrl) return
    const now = Date.now()
    if (now - entry.lastRefreshAt < MIN_IMAGE_REFRESH_MS) return
    const [feedId, ref] = splitFeatureId(feature.properties.id, feature.properties.sourceId)
    entry.image.src = buildImageUrl(feedId, ref, now)
    entry.lastRefreshAt = now
  }

  /** Bring one card above every other marker. MapLibre positions markers
   *  absolutely, so a growing z-index on the marker element is enough. */
  private _raiseMarker(id: string): void {
    const marker = this._markers.get(id)
    /* v8 ignore start -- defensive: only reachable from a click on an element
       this control built for a marker it still holds */
    if (!marker) return
    /* v8 ignore stop */
    this._raisedZIndex += 1
    marker.getElement().style.zIndex = String(this._raisedZIndex)
  }

  /**
   * An always-open preview card: the pill + name header the pill marker
   * already draws, with the live still beneath it. Same monochrome surface
   * as the popup (#15171d, square, no border). Clicking raises the card above
   * its neighbours; that is the only click behaviour — the card already is
   * the preview, so there is nothing to open.
   */
  private _buildPreviewCardElement(feature: CameraFeature): HTMLDivElement {
    const properties = feature.properties
    const state = properties.state
    const markerOpacity = state === 'stale' ? '0.45' : '1'

    const card = document.createElement('div')
    const width = this._previewCardWidthPx
    // `resize` only takes effect with a non-visible overflow; the image scales
    // with the card, so nothing is actually clipped.
    card.style.cssText = `width:${width}px;min-width:${PREVIEW_CARD_MIN_WIDTH_PX}px;max-width:${PREVIEW_CARD_MAX_WIDTH_PX}px;resize:horizontal;overflow:hidden;background:${APRS_BADGE_BACKGROUND};cursor:pointer;pointer-events:auto;user-select:none;opacity:${markerOpacity};position:relative`
    card.setAttribute('role', 'group')
    card.setAttribute('aria-label', cameraAccessibleName(feature))

    const header = this._buildMarkerElement(feature)
    // The header is decorative inside the card: the card carries the name.
    header.removeAttribute('aria-label')
    header.style.opacity = '1'
    header.style.pointerEvents = 'none'
    card.appendChild(header)

    if (properties.imageUrl) {
      const [feedId, ref] = splitFeatureId(properties.id, properties.sourceId)
      const image = document.createElement('img')
      image.alt = `${properties.name} — latest camera image`
      image.style.cssText = 'display:block;width:100%;height:auto;background:#000'
      image.draggable = false
      image.src = buildImageUrl(feedId, ref, Date.now())
      card.appendChild(image)
      this._cardImages.set(properties.id, { image, lastRefreshAt: Date.now() })
    } else {
      const noImage = document.createElement('div')
      noImage.style.cssText = `width:100%;aspect-ratio:4/3;background:#000;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.35);font-family:'Barlow Condensed','Barlow',sans-serif;font-size:10px;letter-spacing:.08em;text-transform:uppercase`
      noImage.textContent = stateLabel(state)
      card.appendChild(noImage)
    }

    card.addEventListener('click', (domEvent: Event) => {
      domEvent.stopPropagation()
      this._raiseMarker(properties.id)
    })
    // A resize drag is a mousedown on the card's corner; stop it reaching the
    // map so the drag resizes the card instead of panning.
    card.addEventListener('mousedown', (domEvent: Event) => domEvent.stopPropagation())
    this._observeCardResize(card)
    return card
  }

  /** Remember the width the operator drags a card to, for cards built later. */
  private _observeCardResize(card: HTMLDivElement): void {
    if (typeof ResizeObserver === 'undefined') return
    this._cardResizeObserver ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.round(entry.contentRect.width)
        if (width >= PREVIEW_CARD_MIN_WIDTH_PX) this._previewCardWidthPx = width
      }
    })
    this._cardResizeObserver.observe(card)
  }

  private _syncClusterMarker(cluster: FeatureCluster): void {
    const existing = this._clusterMarkers.get(cluster.key)
    if (existing && this._clusterCounts.get(cluster.key) === cluster.features.length) {
      existing.setLngLat(cluster.coordinates)
      return
    }
    existing?.remove()
    const element = buildCountMarker({
      count: cluster.features.length,
      ariaLabel: `${cluster.features.length} traffic cameras here — zoom in to see them`,
      className: 'traffic-camera-cluster-marker',
      countClassName: 'traffic-camera-cluster-count',
      ringColor: TRAFFIC_CAMERA_COUNT_RING,
      fillColor: APRS_COUNT_FILL,
      textColor: '#ffffff',
    })
    element.addEventListener('click', (domEvent: Event) => {
      domEvent.stopPropagation()
      this.map.easeTo({
        center: cluster.coordinates,
        zoom: Math.max(this.map.getZoom() + CLUSTER_CLICK_ZOOM_STEP, LABEL_REVEAL_ZOOM),
        duration: 300,
      })
    })
    const marker = new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat(cluster.coordinates)
      .addTo(this.map)
    setMarkerAccessibleName(
      marker,
      `${cluster.features.length} traffic cameras here — zoom in to see them`,
    )
    this._clusterMarkers.set(cluster.key, marker)
    this._clusterCounts.set(cluster.key, cluster.features.length)
  }

  /**
   * The shared Sentinel pill for one camera: camera glyph in the well, the
   * name, then its view (the road or direction it looks along) as a badge.
   * Monochrome per the Land rule; state is carried by opacity alone — stale
   * dimmed to .45, offline to .35 — with the state spelled out in the pane.
   */
  private _buildMarkerElement(feature: CameraFeature): HTMLDivElement {
    const properties = feature.properties
    const state = properties.state
    const pill = createLabelPill()
    pill.style.pointerEvents = 'auto'
    if (state === 'stale') pill.style.opacity = '0.45'
    if (state === 'offline') pill.style.opacity = '0.35'
    pill.setAttribute('aria-label', cameraAccessibleName(feature))
    appendMirrored(
      pill,
      [
        createGlyphWell(CAMERA_GLYPH_SVG, APRS_BADGE_BACKGROUND),
        createNameSegment(properties.name, 'right'),
        properties.view
          ? createAccentBadge(properties.view, APRS_BADGE_BACKGROUND, '#ffffff')
          : null,
      ],
      false,
    )
    pill.addEventListener('click', (domEvent: Event) => {
      domEvent.stopPropagation()
      this._raiseMarker(properties.id)
      this.openInPane(properties.id)
      this._openPopup(feature, pill)
    })
    return pill
  }

  /** Expand the camera's row in the FILTER pane and bring the pane forward. */
  openInPane(featureId: string): void {
    this._landStore.setSearchExpandedCallsign(featureId)
    document.dispatchEvent(new CustomEvent(CAMERA_OPEN_EVENT, { detail: { featureId } }))
  }

  // ── popup ────────────────────────────────────────────────────────────────

  private _closePopup(): void {
    this._popupResizeObserver?.disconnect()
    this._popupResizeObserver = null
    if (this._popupImageTimer !== null) {
      clearInterval(this._popupImageTimer)
      this._popupImageTimer = null
    }
    this._popup?.remove()
    this._popup = null
    this._popupReturnFocusTo?.focus()
    this._popupReturnFocusTo = null
  }

  private _openPopup(feature: CameraFeature, trigger: HTMLElement): void {
    this._closePopup()
    this._popupReturnFocusTo = trigger
    const content = this._buildPopupContent(feature)
    this._popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: 'min(860px, calc(100vw - 48px))',
      className: 'land-map-popup',
      // Pinned below-centre of the camera rather than MapLibre's auto anchor:
      // auto flips the card sideways near an edge, which would undo the
      // centring pan below. With a fixed anchor the card is always centred
      // on the camera horizontally, so one pan puts it mid-viewport.
      anchor: 'bottom',
    })
      .setLngLat(feature.geometry.coordinates as LngLat)
      .setDOMContent(content)
      .addTo(this.map)
    this._popup.on('close', () => {
      if (this._popupImageTimer !== null) {
        clearInterval(this._popupImageTimer)
        this._popupImageTimer = null
      }
      this._popup = null
    })
    content.tabIndex = -1
    // Focus is taken for Escape only; the ring would frame the whole picture.
    content.style.outline = 'none'
    content.addEventListener('keydown', (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') {
        keyboardEvent.stopPropagation()
        this._closePopup()
      }
    })
    // preventScroll: focusing a card that overhangs the map's edge would
    // otherwise scroll the (overflow-hidden) map container itself, shifting
    // every marker off its canvas position — the map is moved by panning, never
    // by scrolling.
    content.focus({ preventScroll: true })
    // Centre the popup itself, not the camera under it: once laid out, and
    // again whenever the card changes size — the still arriving, the clip
    // taking over — since with a bottom anchor the card grows upward.
    requestAnimationFrame(() => this._centrePopup())
    if (typeof ResizeObserver !== 'undefined') {
      this._popupResizeObserver = new ResizeObserver(() =>
        requestAnimationFrame(() => this._centrePopup()),
      )
      this._popupResizeObserver.observe(content)
    }
  }

  /**
   * Pan so the open popup's card sits in the middle of the *visible* map.
   *
   * Checked again once the pan has settled: the card can change size while
   * the pan is in flight (the still or the clip arriving), and a pan started
   * from a mid-animation position lands short, so up to three passes run
   * until the card is within a couple of pixels of centre.
   */
  private _centrePopup(attempt = 0): void {
    const element = this._popup?.getElement()
    if (!element) return
    const card = element.getBoundingClientRect()
    const visible = this._visibleMapBox()
    const offsetX = card.left + card.width / 2 - (visible.left + visible.width / 2)
    const offsetY = card.top + card.height / 2 - (visible.top + visible.height / 2)
    if (Math.abs(offsetX) < 2 && Math.abs(offsetY) < 2) return
    this.map.panBy([offsetX, offsetY], { duration: 250 })
    if (attempt < 3) setTimeout(() => this._centrePopup(attempt + 1), 320)
  }

  /**
   * The part of the map the operator can actually see: the container minus
   * the sidebar drawer + its tab rail on the left, the icon rail on the right
   * and the app header along the top, all fixed over the map rather than
   * beside it.
   */
  private _visibleMapBox(): { left: number; top: number; width: number; height: number } {
    const box = this.map.getContainer().getBoundingClientRect()
    let left = box.left
    let right = box.right
    // The app header runs across the top of the map.
    const nav = document.getElementById('nav')?.getBoundingClientRect()
    const top = nav && nav.bottom > box.top && nav.top <= box.top + 1 ? nav.bottom : box.top
    for (const id of ['map-sidebar-rail', 'map-sidebar']) {
      const rect = document.getElementById(id)?.getBoundingClientRect()
      if (rect && rect.width > 0 && rect.right > left && rect.left <= left + 1) left = rect.right
    }
    const rail = document.getElementById('land-side-menu')?.getBoundingClientRect()
    if (rail && rail.width > 0 && rail.left < right && rail.right >= right - 1) right = rail.left
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, box.bottom - top) }
  }

  private _buildPopupContent(feature: CameraFeature): HTMLDivElement {
    const properties = feature.properties
    const container = document.createElement('div')
    container.style.cssText =
      'background:rgba(21,23,29,.98);color:#fff;width:840px;max-width:calc(100vw - 48px);font-family:var(--font-primary,Barlow,sans-serif)'

    // Header: the name, with the frame's timestamp beside it (smaller, dimmer)
    // when the feed reports one — kept on one 36px line so it sits level with
    // MapLibre's close button. The image itself is shown as the provider
    // serves it; any time burned into the frame is theirs, not a footer.
    const header = document.createElement('div')
    header.style.cssText =
      'display:flex;align-items:baseline;gap:10px;min-height:36px;box-sizing:border-box;padding:0 44px 0 12px;align-items:center'
    const title = document.createElement('h2')
    title.style.cssText =
      "font-family:var(--font-condensed,'Barlow Condensed',sans-serif);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;margin:0"
    title.textContent = properties.name
    header.appendChild(title)
    if (properties.updatedAt) {
      const stamp = document.createElement('span')
      stamp.style.cssText =
        "font-family:var(--font-condensed,'Barlow Condensed',sans-serif);font-size:9px;font-weight:400;letter-spacing:.08em;color:rgba(255,255,255,.5)"
      stamp.textContent = formatUpdatedAt(properties.updatedAt)
      header.appendChild(stamp)
    }
    container.appendChild(header)

    // Just the name and the picture: the view line, state, cadence and source
    // all live in the pane's row, which opens alongside the popup.
    if (properties.imageUrl || properties.clipUrl) {
      container.appendChild(this._buildMediaElement(feature))
    }

    return container
  }

  private _refreshSecondsFor(feedId: string): number | null {
    return this._landFeedsStore.feeds.find((feed) => feed.id === feedId)?.refreshSeconds ?? null
  }

  /**
   * The image (always) and, when the feed offers one, the looping clip
   * playing automatically over it — a still under `prefers-reduced-motion`
   * regardless, per the accessibility guardrail on motion.
   */
  private _buildMediaElement(feature: CameraFeature): HTMLDivElement {
    const properties = feature.properties
    const holder = document.createElement('div')

    const imageWrap = document.createElement('div')
    imageWrap.style.cssText = 'background:#000;width:100%;overflow:hidden'
    const image = document.createElement('img')
    image.alt = `${properties.name}${properties.view ? `, ${properties.view}` : ''} — latest camera image`
    image.style.cssText = 'display:block;width:100%;height:auto'
    image.addEventListener('load', () =>
      applyCifAspect(image, image.naturalWidth, image.naturalHeight),
    )
    const setImageSrc = () => {
      if (!properties.imageUrl) return
      const [feedId, ref] = splitFeatureId(properties.id, properties.sourceId)
      image.src = buildImageUrl(feedId, ref, Date.now())
    }
    setImageSrc()
    imageWrap.appendChild(image)
    holder.appendChild(imageWrap)
    this._startImageRefresh(setImageSrc, properties.sourceId)

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!properties.clipUrl || reducedMotion) return holder

    // Where the provider offers a clip (TfL JamCams), it plays at once,
    // muted and looping, over the still — the still stays underneath as the
    // poster and the fallback if the clip cannot load, and is what shows
    // under a reduced-motion preference.
    const [feedId, ref] = splitFeatureId(properties.id, properties.sourceId)
    const video = document.createElement('video')
    video.muted = true
    video.loop = true
    video.autoplay = true
    video.playsInline = true
    video.style.cssText = 'display:none;width:100%;height:auto;background:#000'
    video.poster = image.src
    video.src = buildClipUrl(feedId, ref)
    video.setAttribute(
      'aria-label',
      `${properties.name}${properties.view ? `, ${properties.view}` : ''} — looping clip`,
    )
    video.addEventListener('loadedmetadata', () =>
      applyCifAspect(video, video.videoWidth, video.videoHeight),
    )
    video.addEventListener('playing', () => {
      video.style.display = 'block'
      image.style.display = 'none'
    })
    video.addEventListener('error', () => {
      video.style.display = 'none'
      image.style.display = 'block'
    })
    // Nothing here ever pauses the clip, so a pause is the browser giving up
    // on the loop (a seek it could not make); kick it off again from the top.
    video.addEventListener('pause', () => {
      if (video.error || !video.isConnected) return
      video.currentTime = 0
      void video.play().catch(() => {
        /* still refused: the last frame stays up */
      })
    })
    // Played once the clip can play, not here: the element is not in the
    // document yet, and a play() on a detached video is aborted by the load
    // that follows its insertion.
    video.addEventListener(
      'canplay',
      () =>
        void video.play().catch(() => {
          /* autoplay refused: the still stays up */
        }),
      { once: true },
    )
    imageWrap.appendChild(video)

    return holder
  }

  /** Start the open popup's image refresh timer. Only ever called from
   *  `_openPopup`, which has already run `_closePopup` and so cleared any
   *  previous timer — there is never one to clear here. */
  private _startImageRefresh(refresh: () => void, feedId: string): void {
    const configuredSeconds = this._refreshSecondsFor(feedId)
    const intervalMs = Math.max(MIN_IMAGE_REFRESH_MS, (configuredSeconds ?? 60) * 1000)
    this._popupImageTimer = setInterval(refresh, intervalMs)
  }

  // ── accessibility ───────────────────────────────────────────────────────

  private _ensureA11yRegion(): void {
    /* v8 ignore start -- defensive idempotency guard: onInit calls this exactly once */
    if (this._a11yRegion) return
    /* v8 ignore stop */
    const region = document.createElement('div')
    region.setAttribute('role', 'region')
    region.setAttribute('aria-label', 'Traffic cameras')
    region.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'
    this.map.getContainer().appendChild(region)
    this._a11yRegion = region
  }

  private _renderA11yTable(features: CameraFeature[]): void {
    /* v8 ignore start -- defensive: _render only runs after onInit created the region */
    if (!this._a11yRegion) return
    /* v8 ignore stop */
    if (features.length === 0) {
      this._a11yRegion.innerHTML = '<p>No traffic cameras in view.</p>'
      return
    }
    const rows = features
      .map((feature) => {
        const properties = feature.properties
        const cells = [
          escapeHtml(properties.name),
          properties.view ? escapeHtml(properties.view) : '',
          stateLabel(properties.state),
          properties.updatedAt ? formatUpdatedAt(properties.updatedAt) : '',
          escapeHtml(properties.sourceName),
        ]
        return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`
      })
      .join('')
    const headers = ['Name', 'View', 'Status', 'Updated', 'Source']
    this._a11yRegion.innerHTML =
      '<table><caption>Traffic cameras in view</caption><thead><tr>' +
      headers.map((header) => `<th scope="col">${header}</th>`).join('') +
      `</tr></thead><tbody>${rows}</tbody></table>`
  }

  private _clearMarkers(): void {
    for (const marker of this._markers.values()) marker.remove()
    this._markers.clear()
    this._markerSignatures.clear()
    this._cardImages.clear()
    this._cardResizeObserver?.disconnect()
    this._cardResizeObserver = null
    for (const marker of this._clusterMarkers.values()) marker.remove()
    this._clusterMarkers.clear()
    this._clusterCounts.clear()
  }
}

/** Accessible name for a camera's label: name, view, state. */
function cameraAccessibleName(feature: CameraFeature): string {
  const properties = feature.properties
  return `Traffic camera, ${properties.name}${properties.view ? `, ${properties.view}` : ''}, ${stateLabel(properties.state)}`
}

/** A group of camera features too close together on screen to draw apart. */
interface FeatureCluster {
  key: string
  features: CameraFeature[]
  coordinates: LngLat
}

/** Human label for a camera's state, for the marker's accessible name and
 *  the screen-reader table. */
function stateLabel(state: CameraFeatureState): string {
  if (state === 'live') return 'LIVE'
  if (state === 'stale') return 'STALE'
  return 'OFFLINE'
}

/**
 * Show CIF-sized media (352×288, PAL's non-square pixels — TfL JamCams) at
 * the 4:3 it was shot for. Rendered at its stored pixel ratio (1.22:1) the
 * picture is stretched tall; nothing else is touched, so a feed that already
 * serves square pixels keeps its own ratio.
 */
function applyCifAspect(element: HTMLElement, width: number, height: number): void {
  if (!width || !height) return
  if (Math.abs(width / height - 352 / 288) > 0.01) return
  element.style.aspectRatio = '4 / 3'
  element.style.height = 'auto'
  element.style.objectFit = 'fill'
}

/** Split a feature id (`"<feedId>:<providerRef>"`) back into its parts,
 *  falling back to the feed id itself as the ref if the feature id was ever
 *  malformed — defensive only, the backend always emits the joined form. */
function splitFeatureId(featureId: string, feedId: string): [string, string] {
  const separatorIndex = featureId.indexOf(':')
  /* v8 ignore start -- defensive: the backend always joins feedId:providerId */
  if (separatorIndex === -1) return [feedId, featureId]
  /* v8 ignore stop */
  return [featureId.slice(0, separatorIndex), featureId.slice(separatorIndex + 1)]
}

/** Format an ISO 8601 timestamp as 24-hour local wall time, matching the
 *  APRS control's `formatHeardTime`. */
function formatUpdatedAt(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString([], { hour12: false })
}
