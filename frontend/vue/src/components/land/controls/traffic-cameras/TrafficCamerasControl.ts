import maplibregl from 'maplibre-gl'
import { watch, type WatchStopHandle } from 'vue'
import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import { APRS_BADGE_BACKGROUND, APRS_COUNT_FILL, APRS_COUNT_RING } from '@/constants/aprs'
import {
  buildCountMarker,
  groupByGridCell,
  COUNT_MARKER_SIZE_PX,
} from '@/components/shared/map-cluster/mapCluster'
import { setMarkerAccessibleName } from '@/components/shared/map-label/mapMarkerAria'
import './trafficCamerasPopup.css'
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

/** How often an open popup's image is re-fetched, in milliseconds — the
 *  feed's own refresh cadence, floored so a fast feed can't be hammered by a
 *  left-open popup. */
const MIN_IMAGE_REFRESH_MS = 15_000

/**
 * Land-map control that plots live traffic camera feeds (Durham CC, TfL
 * JamCams in P0; more providers arrive with later phases) — see
 * `docs/plans/land-live-feeds.md` §5a for the exact visual spec every colour
 * and size below is taken from.
 *
 * Markers are monochrome pills, built exactly like `PortsControl`'s, grouped
 * into APRS-style count markers below `LABEL_REVEAL_ZOOM` and drawn
 * individually above it, both scoped to the current viewport so the DOM
 * marker count never reflects the full ~1,000-camera dataset at once.
 * Clicking a marker (or a count, which first zooms in) opens a focus-managed
 * popup with the latest image, optional clip, status chip and source link.
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
  private _popupImageTimer: ReturnType<typeof setInterval> | null = null
  private _popupReturnFocusTo: HTMLElement | null = null

  /**
   * Bound once so `document.addEventListener`/`removeEventListener` target
   * the same function reference — the CAMERAS sidebar list ↔ map parity
   * mechanism, mirroring `aprs-station-selected` in `AprsStationsControl`,
   * just in the opposite direction (list click drives the map here).
   */
  private readonly _onCameraSelected = (event: Event): void => {
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
    // A simple camera glyph — body + lens, matching the marker's own icon.
    return (
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2 5.5h2.4l.9-1.5h5.4l.9 1.5H14v7.5H2z" />' +
      '<circle cx="8" cy="9" r="2.2" /></svg>'
    )
  }

  get buttonTitle(): string {
    return 'Toggle traffic cameras'
  }

  private get _visible(): boolean {
    return this._landStore.trafficCamerasLayerVisible
  }

  protected onInit(): void {
    this.setButtonActive(this._visible)
    this._ensureA11yRegion()
    if (this._visible) void this._landFeedsStore.startPolling()
    this._onMapMoveEnd = () => this._render()
    this.map.on('moveend', this._onMapMoveEnd)
    this._stopWatch = watch(
      () => [this._landFeedsStore.featuresByFeed, this._visible] as const,
      () => this._render(),
      { immediate: true, deep: true },
    )
    document.addEventListener('land-camera-selected', this._onCameraSelected)
  }

  protected handleClick(): void {
    this.setVisible(!this._visible)
  }

  /** Set visibility to a specific value (e.g. from `land.defaultLayers`), a
   *  no-op if already in that state. */
  setVisible(visible: boolean): void {
    if (this._visible === visible) return
    this._landStore.setTrafficCamerasLayerVisible(visible)
    this.setButtonActive(visible)
    if (visible) void this._landFeedsStore.startPolling()
    else this._landFeedsStore.stopPolling()
    this._render()
  }

  onRemove(): void {
    /* v8 ignore start -- defensive: onInit always assigns the handler, and
       MapLibre never removes a control it did not add */
    if (this._onMapMoveEnd) this.map.off('moveend', this._onMapMoveEnd)
    /* v8 ignore stop */
    this._onMapMoveEnd = null
    this._stopWatch?.()
    this._stopWatch = null
    document.removeEventListener('land-camera-selected', this._onCameraSelected)
    if (this._visible) this._landFeedsStore.stopPolling()
    this._closePopup()
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
      anchor: 'top-left',
      offset: [8, -6],
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
    card.setAttribute(
      'aria-label',
      `Traffic camera, ${properties.name}${properties.view ? `, ${properties.view}` : ''}, ${stateLabel(state)}`,
    )

    const header = this._buildMarkerElement(feature)
    // The header is decorative inside the card: the card carries the name.
    header.removeAttribute('aria-label')
    header.style.padding = '4px 8px 4px 0'
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
      ringColor: APRS_COUNT_RING,
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

  /** Build one camera's marker pill — a 20x20 chip carrying the camera glyph
   *  plus a two-line label, styled exactly per §5a: live at full opacity,
   *  stale dimmed to .45, offline recoloured and dimmed to .35. No borders
   *  anywhere; state is carried by fill and opacity alone (with the state
   *  chip in the popup giving the same information as text). */
  private _buildMarkerElement(feature: CameraFeature): HTMLDivElement {
    const properties = feature.properties
    const state = properties.state
    const pillBackground = state === 'offline' ? 'var(--color-button-bg)' : APRS_BADGE_BACKGROUND
    const glyphAndTextOpacity = state === 'offline' ? '0.35' : '1'
    const markerOpacity = state === 'stale' ? '0.45' : '1'

    const wrap = document.createElement('div')
    wrap.style.cssText = `padding:6px 16px 6px 0;cursor:pointer;pointer-events:auto;user-select:none;opacity:${markerOpacity};display:flex;align-items:center;gap:6px`

    const well = document.createElement('div')
    well.style.cssText = `flex-shrink:0;width:20px;height:20px;border-radius:0;background:${pillBackground};display:flex;align-items:center;justify-content:center;opacity:${glyphAndTextOpacity}`
    well.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.4" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2 5.5h2.4l.9-1.5h5.4l.9 1.5H14v7.5H2z" /><circle cx="8" cy="9" r="2.2" /></svg>'

    const label = document.createElement('div')
    label.style.cssText = `color:#fff;font-family:'Barlow Condensed','Barlow',sans-serif;font-size:10px;font-weight:700;letter-spacing:.08em;line-height:1.5;white-space:nowrap;pointer-events:none;text-transform:uppercase;opacity:${glyphAndTextOpacity}`
    const name = document.createElement('span')
    name.textContent = properties.name
    label.appendChild(name)
    if (properties.view) {
      const view = document.createElement('span')
      view.style.cssText = 'opacity:0.7;font-weight:400;display:block'
      view.textContent = properties.view.toUpperCase()
      label.appendChild(view)
    }

    wrap.append(well, label)
    wrap.setAttribute(
      'aria-label',
      `Traffic camera, ${properties.name}${properties.view ? `, ${properties.view}` : ''}, ${stateLabel(state)}`,
    )
    wrap.addEventListener('click', (domEvent: Event) => {
      domEvent.stopPropagation()
      this._raiseMarker(properties.id)
      this._openPopup(feature, wrap)
    })
    return wrap
  }

  // ── popup ────────────────────────────────────────────────────────────────

  private _closePopup(): void {
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
      className: 'traffic-camera-popup',
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
    content.addEventListener('keydown', (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') {
        keyboardEvent.stopPropagation()
        this._closePopup()
      }
    })
    content.focus()
  }

  private _buildPopupContent(feature: CameraFeature): HTMLDivElement {
    const properties = feature.properties
    const container = document.createElement('div')
    container.style.cssText =
      'background:rgba(21,23,29,.98);color:#fff;width:840px;max-width:calc(100vw - 48px);font-family:var(--font-primary,Barlow,sans-serif)'

    const title = document.createElement('h2')
    title.style.cssText =
      "font-family:var(--font-condensed,'Barlow Condensed',sans-serif);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;margin:0 0 6px;padding:10px 12px 0"
    title.textContent = properties.name
    container.appendChild(title)

    // The camera's view line ("View towards the City Centre", "West") — the
    // body text of the popup, per §5a; TfL gives a compass point, Durham a
    // sentence, so it is shown as given rather than upper-cased.
    if (properties.view) {
      const view = document.createElement('p')
      view.style.cssText =
        'font-size:13px;color:rgba(255,255,255,.82);margin:0 12px 8px;line-height:1.4'
      view.textContent = properties.view
      container.appendChild(view)
    }

    // State is carried by the marker's opacity and the sidebar row; the popup
    // is the picture, so no LIVE chip here.

    if (properties.imageUrl || properties.clipUrl) {
      container.appendChild(this._buildMediaElement(feature))
    }

    const meta = document.createElement('p')
    meta.style.cssText =
      'font-size:9px;color:var(--color-text-muted,rgba(255,255,255,.75));margin:8px 12px 0;line-height:1.5'
    const refreshSeconds = this._refreshSecondsFor(properties.sourceId)
    meta.textContent = [
      properties.updatedAt ? `Updated ${formatUpdatedAt(properties.updatedAt)}` : null,
      refreshSeconds ? `refreshes every ~${refreshSeconds}s` : null,
      properties.sourceName,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ')
    container.appendChild(meta)

    container.style.paddingBottom = '12px'

    return container
  }

  private _refreshSecondsFor(feedId: string): number | null {
    return this._landFeedsStore.feeds.find((feed) => feed.id === feedId)?.refreshSeconds ?? null
  }

  /**
   * The image (always) and, when the feed offers one, the looping clip — a
   * still under `prefers-reduced-motion` regardless of the toggle, per the
   * accessibility guardrail on motion.
   */
  private _buildMediaElement(feature: CameraFeature): HTMLDivElement {
    const properties = feature.properties
    const holder = document.createElement('div')

    const imageWrap = document.createElement('div')
    imageWrap.style.cssText = 'background:#000;width:100%;overflow:hidden'
    const image = document.createElement('img')
    image.alt = `${properties.name}${properties.view ? `, ${properties.view}` : ''} — latest camera image`
    image.style.cssText = 'display:block;width:100%;height:auto'
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

    const [feedId, ref] = splitFeatureId(properties.id, properties.sourceId)
    const video = document.createElement('video')
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.style.cssText = 'display:none;width:100%;height:auto;background:#000'
    video.poster = image.src
    video.src = buildClipUrl(feedId, ref)
    video.setAttribute(
      'aria-label',
      `${properties.name}${properties.view ? `, ${properties.view}` : ''} — looping clip`,
    )
    imageWrap.appendChild(video)

    const toggle = document.createElement('button')
    toggle.type = 'button'
    let playing = false
    const setToggleLabel = () => {
      toggle.textContent = playing ? 'STILL' : 'PLAY'
    }
    toggle.style.cssText =
      "display:block;margin:6px 12px 0;padding:6px 14px;background:var(--color-button-bg);color:#fff;font-family:'Barlow Condensed','Barlow',sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border:none;cursor:pointer"
    setToggleLabel()
    toggle.addEventListener('click', () => {
      playing = !playing
      video.style.display = playing ? 'block' : 'none'
      image.style.display = playing ? 'none' : 'block'
      if (playing) void video.play()
      else video.pause()
      setToggleLabel()
    })
    holder.appendChild(toggle)

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

/** A group of camera features too close together on screen to draw apart. */
interface FeatureCluster {
  key: string
  features: CameraFeature[]
  coordinates: LngLat
}

/** Human label for a camera's state, used on both the marker's accessible
 *  name and the popup's status chip. */
function stateLabel(state: CameraFeatureState): string {
  if (state === 'live') return 'LIVE'
  if (state === 'stale') return 'STALE'
  return 'OFFLINE'
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

/** Escape a string for safe interpolation into the a11y table's HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
