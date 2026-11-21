import { readCachedSectionMode, type SourceMode } from '@sentinel/shell-api/utils/sourceMode'
import * as maplibregl from 'maplibre-gl'
import type { AirStore, AirNotifStore, NotificationsStore, TrackingStore } from '../types'
import { createNotifEnabledAdapter, type NotifEnabledAdapter } from '../../stores/airNotif'
import type { AircraftIconStyle } from '../../stores/air'
import { parseAlt, isMilitary, type AdsbApiEntry } from './adsbParse'
import {
  displayedPosition,
  isGone,
  isStale,
  observedAt,
  reanchor,
  durationHeaderMs,
  startTracking,
  type TrackedPosition,
} from './aircraftPosition'
import { ADSB_POLL_INTERVAL_MS, ADSB_REFETCH_GUARD_MS } from '../../constants/adsb'
import type { TrackingField } from '@sentinel/shell-api/stores/tracking'
import { isLeftFacing } from '@sentinel/map-kit/map-label/mapLabelParts'
import { resolveAircraftShape } from '@sentinel/map-kit/aircraft-silhouettes/resolveAircraftShape'
import { isBrightBasemap } from '@sentinel/map-kit/utils/mapTheme'
import { addMapDimLayer } from '@sentinel/map-kit/map-dimming/mapDimming'
import { AircraftTrails, TRAIL_LAYER_IDS } from './AircraftTrails'
import { createAirReplayPlayer, replayEntryFromFrame } from './adsbReplayFrames'
import type { HistoryFramePlayer } from '@sentinel/shell-api/playback/HistoryFramePlayer'
import { usePlaybackStore } from '@sentinel/shell-api/stores/playback'
import { AdsbTrackingPersistence } from './AdsbTrackingPersistence'
import type { AircraftGeoFeature, AircraftProperties } from './adsbFeature'
import { AircraftTags } from './AircraftTags'
import { CallsignLabels } from './CallsignLabels'
import {
  applyMapDimming,
  iconImageExpression,
  iconLayerVisibility,
  iconRotateExpression,
  iconSizeExpression,
  MAP_DIM_LAYER_ID,
  registerAdsbIcons,
} from './adsbIconStyle'
import { AIRFIELD_LAYER_ORDER } from '../airfield-label/AirfieldMarkers'
import {
  altitudeColourKey,
  createSilhouetteImageData,
  SILHOUETTE_PIXEL_RATIO,
  silhouetteIconSizePx,
  silhouetteImageId,
  silhouetteRotatesWithTrack,
  SILHOUETTE_IMAGE_PREFIX,
  type SilhouettePalette,
  type SilhouetteColourKey,
} from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'

// ---- Internal types ----

/**
 * The silhouette-related feature properties for one aircraft.
 *
 * Resolved when the feature is built, not by the map, because the colour is
 * part of the image name: an emergency squawk picks the red image and everything
 * else its altitude's colour, with the state's colour when there is no altitude. Kept outside the class so it can be read and checked on its own.
 */
function silhouetteProperties(
  typeDesignator: string,
  category: string,
  military: boolean,
  squawkEmergency: boolean,
  altitudeFeet: number,
  altitudeColouring: boolean,
): Pick<AircraftProperties, 'silhouetteImage' | 'silhouetteRadiusPx' | 'silhouetteRotates'> {
  const shape = resolveAircraftShape(typeDesignator, category)
  if (!shape) return { silhouetteImage: '', silhouetteRadiusPx: 0, silhouetteRotates: 0 }
  const colourKey: SilhouetteColourKey = squawkEmergency
    ? 'emergency'
    : altitudeColouring && altitudeFeet > 0
      ? altitudeColourKey(altitudeFeet)
      : military
        ? 'military'
        : altitudeColouring
          ? 'civil'
          : 'plain'
  return {
    silhouetteImage: silhouetteImageId(shape.shapeKey, colourKey),
    silhouetteRadiusPx: silhouetteIconSizePx(shape.shapeKey) / 2,
    silhouetteRotates: silhouetteRotatesWithTrack(shape.shapeKey) ? 1 : 0,
  }
}

// The raw feed entry shape lives with the shared parser: a second copy here is
// how the phantom `military` field outlived the feed that never sent it.
type AircraftApiEntry = AdsbApiEntry

export class AdsbLiveControl implements maplibregl.IControl {
  visible: boolean
  labelsVisible: boolean

  map!: maplibregl.Map
  container!: HTMLDivElement
  button!: HTMLButtonElement

  private _airStore: AirStore
  private _notificationsStore: NotificationsStore
  private _trackingStore: TrackingStore
  private _is3DActive: () => boolean
  private _getTargetPitch: () => number
  private _onAdsbLabelsSync: ((visible: boolean) => void) | null

  private _pollInterval: ReturnType<typeof setInterval> | null = null
  // The mode the shown aircraft came from, so a style reload in the same mode
  // doesn't wipe them — only a real feed switch does.
  private _lastFeedMode: SourceMode = this._effectiveMode()
  private _interpolateInterval: ReturnType<typeof setInterval> | null = null

  _geojson: { type: 'FeatureCollection'; features: AircraftGeoFeature[] }
  private _lastPositions: Record<string, TrackedPosition> = {}
  // Observation time of the newest snapshot received: how far the feed has got.
  // Aircraft are removed by how much newer feed has left them out, not by age.
  private _feedObservedAt = 0
  // How long the newest snapshot was meant to stand (`X-Snapshot-Lifetime-Ms`):
  // online, a whole refresh interval, which must not dim every aircraft.
  private _snapshotLifetimeMs = 0
  private _interpolatedFeatures: AircraftGeoFeature[] | null = null

  private _selectedHexValue: string | null = null

  get _selectedHex(): string | null {
    return this._selectedHexValue
  }

  /** Setting this repaints the silhouettes, because the selected one is drawn in its own colour. */
  set _selectedHex(hex: string | null) {
    if (hex === this._selectedHexValue) return
    this._selectedHexValue = hex
    if (this._iconStyle === 'silhouette' && this.map?.getLayer('adsb-icons'))
      this.map.setLayoutProperty(
        'adsb-icons',
        'icon-image',
        iconImageExpression(this._iconStyle, this._selectedHex, this._silhouettePalette),
      )
  }

  _isolatedHex: string | null = null
  private _eventsAdded = false
  _followEnabled = false

  /** The hover and selected tag markers; this control decides when each shows. */
  private _tags = new AircraftTags({
    getMap: () => this.map,
    iconStyle: () => this._iconStyle,
    allHidden: () => this._allHidden,
    selectedHex: () => this._selectedHex,
    isFollowing: () => this._followEnabled,
    tagFields: (military) => (military ? this._tagFields.mil : this._tagFields.civil),
    isAlertEnabled: (hex) => this._notifEnabled.has(hex),
    interpolatedCoords: (hex) => this._interpolatedCoords(hex),
    restingLabel: (hex) => this._callsignMarkers[hex]?.getElement(),
    categoryLabel: (code) => this._categoryLabel(code),
    formatAltitude: (altitudeFeet) => this._formatAltBadge(altitudeFeet),
    arrowColour: (props, isEmergency, isMilitary) =>
      this._arrowColour(props, isEmergency, isMilitary),
    arrowSvg: (colour, track, category, type) => this._makeArrowSvg(colour, track, category, type),
    onUntrack: () => {
      this._followEnabled = false
      this._handleUntrack()
    },
    onHoverTagClick: (hex) => {
      this._tagClickHandled = true
      this._selectedHex = hex
      this._hideHoverTagNow()
      this._applySelection()
      this._emitOpenInPanel(hex)
    },
  })

  /** The resting callsign labels; this control decides when they refresh. */
  private _labels = new CallsignLabels({
    getMap: () => this.map,
    labelsVisible: () => this.labelsVisible,
    features: () => this._geojson.features,
    iconStyle: () => this._iconStyle,
    altitudeColouring: () => this._altitudeColouring,
    labelFields: () => this._tagFields,
    allHidden: () => this._allHidden,
    selectedHex: () => this._selectedHex,
    isolatedHex: () => this._isolatedHex,
    typeFilter: () => this._typeFilter,
    hideGroundVehicles: () => this._hideGroundVehicles,
    hideTowers: () => this._hideTowers,
    layerVisible: () => this.visible,
    isFollowing: () => this._followEnabled,
    taggedHex: () => this._tagHex,
    isAlertEnabled: (hex) => this._notifEnabled.has(hex),
    isStale: (hex) => {
      const position = this._lastPositions[hex]
      return position
        ? isStale(position, this._feedObservedAt, this._now(), this._snapshotLifetimeMs)
        : false
    },
    interpolatedCoords: (hex) => this._interpolatedCoords(hex),
    labelOffset: (props, leftFacing) => this._labelOffset(props, leftFacing),
    categoryLabel: (code) => this._categoryLabel(code),
    formatAltitude: (altitudeFeet) => this._formatAltBadge(altitudeFeet),
    onLabelPlaced: (hex, labelEl) => {
      // The hover tag hides the label it opened over; a label rebuilt under it stays hidden too.
      if (this._hoverHex === hex && this._tags.hoverMarker) {
        labelEl.style.visibility = 'hidden'
        labelEl.style.pointerEvents = 'none'
        this._tags.hoverLabelEl = labelEl
      }
    },
    onLabelUntrack: (hex) => {
      this._notifEnabled.delete(hex)
      this._updateCallsignMarkers()
    },
    onLabelEnter: (hex, labelEl) => {
      const feature = this._geojson.features.find((f) => f.properties.hex === hex)
      if (feature)
        this._showHoverTag(
          feature,
          true,
          labelEl,
          labelEl.dataset.dir as 'left' | 'right' | undefined,
        )
      if (hex) {
        this._trailHex = hex
        this._rebuildTrails()
      }
    },
    onLabelLeave: () => {
      this._hideHoverTag()
      this._trailHex = this._selectedHex ?? null
      this._rebuildTrails()
    },
    onLabelClick: (hex) => {
      this._selectedHex = hex
      this._hideHoverTag()
      this._applySelection()
      this._emitOpenInPanel(hex)
    },
  })

  /** Each labelled aircraft's resting label marker, by hex. */
  private get _callsignMarkers(): Record<string, maplibregl.Marker> {
    return this._labels.markers
  }

  /** The kept positions and the drawn trail; this control decides whose trail shows and when. */
  private _aircraftTrails = new AircraftTrails({
    getMap: () => this.map,
    features: () => this._geojson.features,
    selectedHex: () => this._selectedHex,
    interpolatedCoords: (hex) => this._interpolatedCoords(hex),
    iconStyle: () => this._iconStyle,
    altitudeColouring: () => this._altitudeColouring,
    silhouettePalette: () => this._silhouettePalette,
  })

  // Accessors kept for the spec, which reaches the trail state through priv().
  private get _trails(): Record<string, { lon: number; lat: number; alt: number }[]> {
    return this._aircraftTrails.points
  }

  /** The aircraft whose trail is asked for (the hovered one); null falls back to the selection. */
  get _trailHex(): string | null {
    return this._aircraftTrails.hex
  }

  set _trailHex(hex: string | null) {
    this._aircraftTrails.hex = hex
  }

  private set _MAX_TRAIL(maxPoints: number) {
    this._aircraftTrails.maxPoints = maxPoints
  }

  /** Saves and restores the followed and isolated aircraft across visits. */
  private _trackingPersistence = new AdsbTrackingPersistence({
    taggedHex: () => this._tagHex,
    selectedHex: () => this._selectedHex,
    isFollowing: () => this._followEnabled,
    features: () => this._geojson.features,
    savedIsolatedHex: () => this._airStore.mapIsolatedHex,
    applyIsolation: (hex) => {
      this._selectedHex = hex
      this._isolatedHex = hex
      this._applySelection()
    },
    applyTracking: (feature) => this._applyTrackingRestore(feature),
  })

  private get _trackingRestored(): boolean {
    return this._trackingPersistence.trackingRestored
  }

  private get _isolationRestored(): boolean {
    return this._trackingPersistence.isolationRestored
  }

  /** The aircraft whose selected (or tracked) tag is pinned, or null. */
  get _tagHex(): string | null {
    return this._tags.selectedHex
  }

  set _tagHex(hex: string | null) {
    this._tags.selectedHex = hex
  }

  /** The pinned selected tag's marker, or null when none is pinned. */
  get _tagMarker(): maplibregl.Marker | null {
    return this._tags.selectedMarker
  }

  /** The aircraft the hover tag is showing for, or null. */
  private get _hoverHex(): string | null {
    return this._tags.hoverHex
  }

  private set _hoverHex(hex: string | null) {
    this._tags.hoverHex = hex
  }

  /** The pending delayed hide of the hover tag, cleared when the map is reset. */
  private get _hoverHideTimer(): ReturnType<typeof setTimeout> | null {
    return this._tags.hoverHideTimer
  }

  private set _hoverHideTimer(timer: ReturnType<typeof setTimeout> | null) {
    this._tags.hoverHideTimer = timer
  }

  private _prevAlt: Record<string, number> = {}
  private _hasDeparted: Record<string, boolean> = {}
  private _landedAt: Record<string, number> = {}
  private _seenOnGround: Record<string, boolean> = {}
  private _parkedTimers: Record<string, ReturnType<typeof setTimeout>> = {}

  // Set-like adapter backed by the persisted airNotif store (source of truth
  // for the per-aircraft notification opt-in). Initialised in the constructor.
  _notifEnabled!: NotifEnabledAdapter
  private _airNotifStore!: AirNotifStore
  private _tagClickHandled = false
  _trackingNotifIds: Record<string, string> | null = null

  private _lastFetchTime = 0
  private _isFetching = false
  // ---- Replay (Settings › AIR › History & Replay) ----
  // The shared playback clock: the wall clock while live, the replayed moment
  // in replay. Every age/staleness/dead-reckoning calculation reads it.
  private readonly _playback = usePlaybackStore()
  private _replayPlayer: HistoryFramePlayer | null = null
  private _replayTimer: ReturnType<typeof setInterval> | null = null
  private _replaySeekVersion = -1
  private _replayFrameInFlight = false
  private _fetchAbort: AbortController | null = null
  private _fetchFailCount = 0
  // Resumes polling once the online feed's spent daily limit resets.
  private _resumePollingTimer: ReturnType<typeof setTimeout> | null = null

  private _emergencySquawks: Set<string> = new Set(['7700', '7600', '7500'])
  _typeFilter: 'all' | 'civil' | 'mil' = 'all'
  _allHidden = false
  _hideGroundVehicles = false
  _hideTowers = false

  private _tagFields: {
    civil: Record<string, boolean>
    mil: Record<string, boolean>
    always: Record<string, boolean>
  } = {
    always: {},
    civil: {},
    mil: { aircraftType: true },
  }
  private _onTagFieldsChanged: ((e: Event) => void) | null = null
  /** Arrow inside the label, or silhouette beside it (Settings › AIR › Aircraft Icons). */
  _iconStyle: AircraftIconStyle = 'arrow'
  private _altitudeColouring = true
  /**
   * Which basemap the silhouettes are coloured for, read in initLayers — which
   * every map re-runs when the palette changes and reloads the basemap.
   */
  private _silhouettePalette: SilhouettePalette = 'dark'
  // Draws silhouette images the moment the map first needs one (and again after
  // a style reload drops them), so only shapes actually on screen are built.
  private _resolveMissingImage: ((imageId: string) => void) | null = null
  private _onPageVisibilityChange: (() => void) | null = null

  constructor(
    airStore: AirStore,
    notificationsStore: NotificationsStore,
    trackingStore: TrackingStore,
    airNotifStore: AirNotifStore,
    is3DActive: () => boolean,
    getTargetPitch: () => number,
    onAdsbLabelsSync: ((visible: boolean) => void) | null = null,
  ) {
    this._airStore = airStore
    this._notificationsStore = notificationsStore
    this._trackingStore = trackingStore
    this._airNotifStore = airNotifStore
    this._notifEnabled = createNotifEnabledAdapter(airNotifStore)
    this._is3DActive = is3DActive
    this._getTargetPitch = getTargetPitch
    this._onAdsbLabelsSync = onAdsbLabelsSync
    this.visible = airStore.overlayStates.adsb
    // Aircraft labels are permanently on — there is no user-facing toggle. Ignore
    // any persisted overlay/DB/localStorage value so no machine can start with
    // labels hidden. `setLabelsVisible` likewise refuses to turn them off.
    this.labelsVisible = true
    this._geojson = { type: 'FeatureCollection', features: [] }
    this._tagFields = {
      civil: { ...airStore.adsbTagFields.civil },
      mil: { ...airStore.adsbTagFields.mil },
      always: { ...airStore.adsbTagFields.always },
    }
    this._iconStyle = airStore.aircraftIconStyle
    this._altitudeColouring = airStore.overlayStates.altitudeColouring
    // Restore the persisted type/visibility filter here (not via a delayed
    // setTimeout in AirSideMenu) so the very first poll renders under the
    // correct filter — otherwise civil aircraft flash for ~1s on load before
    // the filter is applied.
    this._loadFilterState()
  }

  private _loadFilterState(): void {
    try {
      const raw = localStorage.getItem('adsbFilter')
      if (!raw) return
      const p = JSON.parse(raw) as { typeFilter?: string; allHidden?: boolean }
      if (p && (p.typeFilter === 'civil' || p.typeFilter === 'mil' || p.typeFilter === 'all')) {
        this._typeFilter = p.typeFilter
      }
      if (typeof p.allHidden === 'boolean') this._allHidden = p.allHidden
    } catch {}
  }

  // ---- Public filter setters ----

  setTypeFilter(mode: 'all' | 'civil' | 'mil'): void {
    this._typeFilter = mode
    this._applyTypeFilter()
    this._updateCallsignMarkers()
  }

  setAllHidden(hidden: boolean): void {
    this._allHidden = hidden
    this._applyTypeFilter()
    this._updateCallsignMarkers()
    const isTracking = this._followEnabled && this._selectedHex
    const hasSelection = !!this._selectedHex
    const tagEl = this._tagMarker ? this._tagMarker.getElement() : null
    if (tagEl) tagEl.style.visibility = hidden && !isTracking && !hasSelection ? 'hidden' : ''
    const hoverEl = this._tags.hoverMarker ? this._tags.hoverMarker.getElement() : null
    if (hoverEl) hoverEl.style.visibility = hidden ? 'hidden' : ''
    this._aircraftTrails.setVisibility(
      (!hidden || !!isTracking || hasSelection) && this._aircraftTrails.hasShownAircraft(),
    )
  }

  setHideGroundVehicles(hide: boolean): void {
    this._hideGroundVehicles = hide
    this._applyTypeFilter()
    this._updateCallsignMarkers()
  }

  setHideTowers(hide: boolean): void {
    this._hideTowers = hide
    this._applyTypeFilter()
    this._updateCallsignMarkers()
  }

  // ---- Layer filter ----

  private _applyTypeFilter(): void {
    if (!this.map) return

    const baseFilter = ['any', ['>', ['get', 'alt_baro'], 0], ['>=', ['zoom'], 10]]
    const isGndExpr = ['match', ['get', 'category'], ['C1', 'C2'], true, false]
    const isTowerExpr = [
      'any',
      ['match', ['get', 'category'], ['C3', 'C4', 'C5'], true, false],
      ['==', ['get', 't'], 'TWR'],
    ]
    const isPlaneExpr = ['all', ['!', isGndExpr], ['!', isTowerExpr]]

    if (this._allHidden && !this._selectedHex) {
      ;['adsb-bracket', 'adsb-icons'].forEach((id) => {
        if (!this.map.getLayer(id)) return
        this.map.setLayoutProperty(id, 'visibility', 'none')
      })
      if (this.map.getLayer('adsb-hit'))
        this.map.setLayoutProperty('adsb-hit', 'visibility', 'none')
      return
    }

    ;['adsb-bracket', 'adsb-icons'].forEach((id) => {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', 'visible')
    })
    if (this.map.getLayer('adsb-hit'))
      this.map.setLayoutProperty('adsb-hit', 'visibility', this.visible ? 'visible' : 'none')

    // Isolation mode: show only the selected aircraft
    if (this._isolatedHex) {
      const isolateFilter = ['==', ['get', 'hex'], this._isolatedHex]
      if (this.map.getLayer('adsb-bracket'))
        this.map.setFilter('adsb-bracket', isolateFilter as maplibregl.FilterSpecification)
      if (this.map.getLayer('adsb-hit'))
        this.map.setFilter('adsb-hit', isolateFilter as maplibregl.FilterSpecification)
      if (this.map.getLayer('adsb-icons')) {
        this.map.setFilter('adsb-icons', isolateFilter as maplibregl.FilterSpecification)
        // Keep icon visible in isolation mode even when labelsVisible (HTML markers replace symbols
        // for the full fleet, but we still need the symbol for the isolated aircraft)
        this.map.setLayoutProperty('adsb-icons', 'visibility', 'visible')
      }
      return
    }

    const typeFiltering = this._typeFilter !== 'all'
    const showGnd = this.visible && !typeFiltering && !this._hideGroundVehicles
    const showTowers = this.visible && !typeFiltering && !this._hideTowers
    const conditions: unknown[] = []

    if (this.visible) {
      if (this._typeFilter === 'civil') {
        conditions.push([
          'all',
          baseFilter,
          isPlaneExpr,
          ['!', ['boolean', ['get', 'military'], false]],
        ])
      } else if (this._typeFilter === 'mil') {
        conditions.push(['all', baseFilter, isPlaneExpr, ['boolean', ['get', 'military'], false]])
      } else {
        conditions.push(['all', baseFilter, isPlaneExpr])
      }
    }

    if (showGnd) conditions.push(isGndExpr)
    if (showTowers) conditions.push(isTowerExpr)

    const filter =
      conditions.length === 0
        ? ['==', ['get', 'hex'], '']
        : conditions.length === 1
          ? conditions[0]
          : ['any', ...conditions]

    if (this.map.getLayer('adsb-bracket'))
      this.map.setFilter('adsb-bracket', filter as maplibregl.FilterSpecification)
    // Apply the same filter to the transparent hit-test layer so hover/click only
    // fire for aircraft that are actually visible under the current type filter.
    if (this.map.getLayer('adsb-hit'))
      this.map.setFilter('adsb-hit', filter as maplibregl.FilterSpecification)
    if (this.map.getLayer('adsb-icons')) {
      this.map.setFilter('adsb-icons', filter as maplibregl.FilterSpecification)
      // Labels are permanently on. In arrow mode their glyph wells replace the
      // symbol layer, so it stays hidden; in silhouette mode it draws the aircraft.
      this.map.setLayoutProperty('adsb-icons', 'visibility', iconLayerVisibility(this._iconStyle))
    }
  }

  // ---- MapLibre IControl lifecycle ----

  onAdd(mapInstance: maplibregl.Map): HTMLElement {
    this.map = mapInstance

    this.container = document.createElement('div')
    this.container.className = 'maplibregl-ctrl'
    this.container.style.cssText = 'background:#000;border-radius:0;margin-top:4px'

    this.button = document.createElement('button')
    this.button.title = 'Toggle live ADS-B aircraft'
    // 'ADS' is a terse glyph; expose the full descriptive name to AT (WCAG 4.1.2).
    this.button.setAttribute('aria-label', 'Toggle live ADS-B aircraft')
    this.button.textContent = 'ADS'
    this.button.style.cssText =
      'width:29px;height:29px;border:none;background:#000;cursor:pointer;font-size:8px;font-weight:bold;display:flex;align-items:center;justify-content:center;transition:opacity 0.2s,color 0.2s'
    this.button.style.opacity = this.visible ? '1' : '0.3'
    this.button.style.color = this.visible ? '#c8ff00' : '#ffffff'
    this.button.onclick = () => this.toggle()
    this.button.onmouseover = () => {
      this.button.style.background = '#111'
    }
    this.button.onmouseout = () => {
      this.button.style.background = '#000'
    }
    this.container.appendChild(this.button)

    if (this.map.isStyleLoaded()) {
      this.initLayers()
    } else {
      this.map.once('style.load', () => this.initLayers())
    }

    this._onTagFieldsChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        civil: Record<string, boolean>
        mil: Record<string, boolean>
        always: Record<string, boolean>
      }
      if (detail) this._tagFields = { ...detail, always: detail.always ?? {} }
      this._clearCallsignMarkers()
      this._updateCallsignMarkers()
    }
    window.addEventListener('adsb:tagFieldsChanged', this._onTagFieldsChanged)

    // Silhouettes are rasterised the first time the map asks for one by name,
    // and again after a style reload drops the map's images. Names belonging to
    // anything else are left for their owners. MapLibre 6 asks this resolver
    // *before* laying out the icons; its `styleimagemissing` event fires only
    // afterwards, too late for that layout (every icon then logged "could not
    // be loaded" and appeared a frame late).
    this._resolveMissingImage = (imageId: string) => {
      // onRemove clears the resolver, so the map is always there when it runs.
      if (!imageId.startsWith(SILHOUETTE_IMAGE_PREFIX)) return
      if (this.map.hasImage(imageId)) return
      const image = createSilhouetteImageData(imageId)
      if (image) this.map.addImage(imageId, image, { pixelRatio: SILHOUETTE_PIXEL_RATIO })
    }
    this.map.setMissingStyleImageResolver(this._resolveMissingImage)

    // A hidden tab still polls (browsers only slow its timers to once a
    // minute), and online every poll can cost a call from the feed's daily
    // limit. Nobody is looking at a hidden map, so stop asking until the tab is
    // shown again. Overhead alerts poll separately and the server's squawk
    // watcher takes over, so neither depends on this.
    this._onPageVisibilityChange = () => {
      if (document.hidden) {
        this._stopFetching()
      } else if (this.visible && !this._resumePollingTimer) {
        this._startPolling()
      }
    }
    document.addEventListener('visibilitychange', this._onPageVisibilityChange)

    return this.container
  }

  onRemove(): void {
    this._stopPolling()
    if (this._replayTimer) clearInterval(this._replayTimer)
    this._replayTimer = null
    this._replayPlayer?.reset()
    this._replayPlayer = null
    // Back to the stylesheet's filter, for whatever uses this map next.
    if (this.map) this.map.getCanvas().style.filter = ''
    // Don't deactivate — keep the onUntrack callback so untracking from another
    // section clears adsbTracking in localStorage. _handleUntrack guards all map ops.
    if (this._onTagFieldsChanged) {
      window.removeEventListener('adsb:tagFieldsChanged', this._onTagFieldsChanged)
      this._onTagFieldsChanged = null
    }
    if (this._onPageVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onPageVisibilityChange)
      this._onPageVisibilityChange = null
    }
    if (this._resolveMissingImage) {
      this.map?.setMissingStyleImageResolver(null)
      this._resolveMissingImage = null
    }
    if (this.container && this.container.parentNode)
      this.container.parentNode.removeChild(this.container)
    ;(this.map as unknown) = undefined
  }

  // ---- Altitude helper ----

  private _parseAlt(alt_baro: number | string | null): number {
    return parseAlt(alt_baro)
  }

  private _formatAltBadge(alt: number): string {
    if (alt >= 18000) return 'FL' + String(Math.round(alt / 100)).padStart(3, '0')
    return String(Math.round(alt)) + 'ft'
  }

  // ---- Icon style (expressions live in adsbIconStyle.ts) ----

  /** Register the sprite images for the current silhouette palette (every style load). */
  _registerIcons(): void {
    registerAdsbIcons(this.map, this._silhouettePalette)
  }

  /** Dim the dark map beneath aircraft for the current palette (see {@link applyMapDimming}). */
  private _applyMapDimming(): void {
    applyMapDimming(this.map, this._silhouettePalette)
  }

  /**
   * Switch between arrows inside labels and silhouettes beside them, and
   * redraw everything that depends on it: the icon layer's expressions and
   * visibility, every label (their glyph wells and offsets change), and any
   * open selected or hover tag.
   */
  setIconStyle(style: AircraftIconStyle): void {
    if (style === this._iconStyle) return
    this._iconStyle = style
    if (!this.map) return
    if (this.map.getLayer('adsb-icons')) {
      this.map.setLayoutProperty(
        'adsb-icons',
        'icon-image',
        iconImageExpression(this._iconStyle, this._selectedHex, this._silhouettePalette),
      )
      this.map.setLayoutProperty('adsb-icons', 'icon-size', iconSizeExpression(this._iconStyle))
      this.map.setLayoutProperty('adsb-icons', 'icon-rotate', iconRotateExpression(this._iconStyle))
    }
    this._applyTypeFilter()
    this._hideHoverTagNow()
    this._clearCallsignMarkers()
    this._updateCallsignMarkers()
    if (this._tagHex) this._rebuildTagForHex(this._tagHex)
  }

  /**
   * Turn altitude colouring on or off, and repaint what it drives: every
   * aircraft, the labels (arrows sit in them), any open tag, and the trail.
   */
  setAltitudeColouring(enabled: boolean): void {
    if (enabled === this._altitudeColouring) return
    this._altitudeColouring = enabled
    if (!this.map) return
    for (const feature of this._geojson.features) {
      const { t, category, military, squawkEmerg, alt_baro } = feature.properties
      Object.assign(
        feature.properties,
        silhouetteProperties(t, category, military, !!squawkEmerg, alt_baro, enabled),
      )
    }
    ;(this.map.getSource('adsb-live') as maplibregl.GeoJSONSource)?.setData(
      this._geojson as GeoJSON.GeoJSON,
    )
    this._clearCallsignMarkers()
    this._updateCallsignMarkers()
    if (this._tagHex) this._rebuildTagForHex(this._tagHex)
    this._rebuildTrails()
  }

  // ---- Map layer initialisation ----

  initLayers(): void {
    const layerVisibility = this.visible ? 'visible' : 'none'
    this._silhouettePalette = isBrightBasemap() ? 'light' : 'dark'
    ;['adsb-icons', 'adsb-hit', 'adsb-bracket', ...TRAIL_LAYER_IDS, MAP_DIM_LAYER_ID].forEach(
      (id) => {
        if (this.map.getLayer(id)) this.map.removeLayer(id)
      },
    )
    addMapDimLayer(this.map, MAP_DIM_LAYER_ID)
    this._applyMapDimming()

    if (this._hoverHideTimer) {
      clearTimeout(this._hoverHideTimer)
      this._hoverHideTimer = null
    }
    for (const t of Object.values(this._parkedTimers)) clearTimeout(t)
    this._parkedTimers = {}

    this._clearCallsignMarkers()
    this._hideHoverTagNow()
    this._tags.removeSelected()
    this._tagHex = null
    this._hideStatusBar()

    this._selectedHex = null
    this._isolatedHex = null
    this._followEnabled = false
    ;['adsb-live', 'adsb-trails-source', 'adsb-trail-line-source'].forEach((id) => {
      if (this.map.getSource(id)) this.map.removeSource(id)
    })

    const _savedGeojson = this._geojson
    const _savedLastPositions = this._lastPositions
    const _savedInterpolated = this._interpolatedFeatures
    const _savedPrevAlt = this._prevAlt
    const _savedHasDeparted = this._hasDeparted
    const _savedSeenOnGround = this._seenOnGround
    const _savedLandedAt = this._landedAt
    this._geojson = { type: 'FeatureCollection', features: [] }
    this._lastPositions = {}
    this._interpolatedFeatures = []
    this._prevAlt = {}
    this._hasDeparted = {}
    this._seenOnGround = {}
    this._landedAt = {}

    this._aircraftTrails.addLayers(this.map)

    this._registerIcons()

    this.map.addSource('adsb-live', { type: 'geojson', data: this._geojson as GeoJSON.GeoJSON })

    this.map.addLayer({
      id: 'adsb-bracket',
      type: 'symbol',
      source: 'adsb-live',
      filter: ['==', ['get', 'hex'], ''] as maplibregl.FilterSpecification,
      layout: { visibility: 'none' },
      paint: {},
    })

    this.map.addLayer({
      id: 'adsb-icons',
      type: 'symbol',
      source: 'adsb-live',
      filter: [
        'all',
        ['!', ['match', ['get', 'category'], ['A0', 'B0', 'C0'], true, false]],
        ['any', ['>', ['get', 'alt_baro'], 0], ['>=', ['zoom'], 10]],
      ] as maplibregl.FilterSpecification,
      layout: {
        visibility: layerVisibility,
        'icon-image': iconImageExpression(
          this._iconStyle,
          this._selectedHex,
          this._silhouettePalette,
        ),
        'icon-size': iconSizeExpression(this._iconStyle),
        'icon-rotate': iconRotateExpression(this._iconStyle),
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': [
          'case',
          ['==', ['get', 'stale'], 1],
          0.3,
          1,
        ] as maplibregl.ExpressionSpecification,
        'icon-opacity-transition': { duration: 0 },
      } as Record<string, unknown>,
    })

    // Transparent hit-test layer on top of adsb-icons so hover/click events fire
    // even when adsb-icons is hidden (labelsVisible mode hides the symbol layer).
    this.map.addLayer({
      id: 'adsb-hit',
      type: 'circle',
      source: 'adsb-live',
      layout: { visibility: layerVisibility },
      paint: { 'circle-radius': 14, 'circle-opacity': 0, 'circle-stroke-width': 0 },
    })

    this._geojson = _savedGeojson
    this._lastPositions = _savedLastPositions
    this._interpolatedFeatures = _savedInterpolated
    this._prevAlt = _savedPrevAlt
    this._hasDeparted = _savedHasDeparted
    this._seenOnGround = _savedSeenOnGround
    this._landedAt = _savedLandedAt
    try {
      const renderData =
        this._interpolatedFeatures && this._interpolatedFeatures.length
          ? { type: 'FeatureCollection' as const, features: this._interpolatedFeatures }
          : this._geojson
      ;(this.map.getSource('adsb-live') as maplibregl.GeoJSONSource)?.setData(
        renderData as GeoJSON.GeoJSON,
      )
    } catch (e) {}

    if (!this._eventsAdded) {
      this._eventsAdded = true
      let _clickHandled = false

      const handleAircraftClick = (e: maplibregl.MapLayerMouseEvent) => {
        if (_clickHandled) return
        if (!e.features || !e.features.length) return
        _clickHandled = true
        const hex = (e.features[0].properties as AircraftProperties).hex
        this._selectedHex = hex
        this._isolatedHex = hex
        this._hideHoverTag()
        this._applySelection()
        this._emitOpenInPanel(hex)
      }

      this.map.on('click', 'adsb-hit', handleAircraftClick)
      this.map.on('click', 'adsb-icons', handleAircraftClick)

      this.map.on('click', (e: maplibregl.MapMouseEvent) => {
        if (_clickHandled) {
          _clickHandled = false
          return
        }
        if (this._tagClickHandled) {
          this._tagClickHandled = false
          return
        }
        if (this._followEnabled) return
        if (this._selectedHex) {
          const hits = this.map.queryRenderedFeatures(e.point, {
            layers: ['adsb-hit', 'adsb-icons'],
          })
          if (!hits.length) {
            this._selectedHex = null
            this._isolatedHex = null
            this._applySelection()
          }
        }
      })

      const handleHoverEnter = (e: maplibregl.MapLayerMouseEvent) => {
        this.map.getCanvas().style.cursor = 'pointer'
        if (!e.features || !e.features.length) return
        const hex = (e.features[0].properties as AircraftProperties).hex
        const hoveredFeature = this._geojson.features.find((f) => f.properties.hex === hex)
        if (hoveredFeature) this._showHoverTag(hoveredFeature)
        // Show trail on hover (overrides selected trail temporarily)
        if (hex) {
          this._trailHex = hex
          this._rebuildTrails()
        }
      }
      const handleHoverLeave = () => {
        this.map.getCanvas().style.cursor = ''
        this._hideHoverTag()
        // Restore selected aircraft trail on hover-leave, or clear if none selected
        this._trailHex = this._selectedHex ?? null
        this._rebuildTrails()
      }

      this.map.on('mouseenter', 'adsb-hit', handleHoverEnter)
      this.map.on('mouseleave', 'adsb-hit', handleHoverLeave)
      this.map.on('mouseenter', 'adsb-icons', handleHoverEnter)
      this.map.on('mouseleave', 'adsb-icons', handleHoverLeave)

      // `mouseenter` fires only on entering the layer, so sliding straight from
      // one aircraft onto an overlapping neighbour would keep the first one's
      // tag. Arrow mode never needed this (each label has its own hover); in
      // silhouette mode the hover tag is the only label, so follow the pointer.
      const handleSilhouetteHoverMove = (e: maplibregl.MapLayerMouseEvent) => {
        if (this._iconStyle !== 'silhouette') return
        const hoveredHex = (e.features?.[0]?.properties as AircraftProperties | undefined)?.hex
        // The hover trail follows the hovered aircraft, so it says which one
        // the pointer was last over — including the selected one, which gets
        // no hover tag of its own.
        if (!hoveredHex || hoveredHex === this._trailHex) return
        if (hoveredHex === this._selectedHex) this._hideHoverTagNow()
        handleHoverEnter(e)
      }
      this.map.on('mousemove', 'adsb-icons', handleSilhouetteHoverMove)
      this.map.on('mousemove', 'adsb-hit', handleSilhouetteHoverMove)

      const handleTrailHoverEnter = (e: maplibregl.MapLayerMouseEvent) => {
        if (!e.features || !e.features.length) return
        const hex = (e.features[0].properties as { hex?: string }).hex
        if (!hex) return
        this.map.getCanvas().style.cursor = 'pointer'
        const hoveredFeature = this._geojson.features.find((f) => f.properties.hex === hex)
        if (hoveredFeature) this._showHoverTag(hoveredFeature)
        this._trailHex = hex
        this._rebuildTrails()
      }
      const handleTrailHoverLeave = () => {
        this.map.getCanvas().style.cursor = ''
        this._hideHoverTag()
        this._trailHex = this._selectedHex ?? null
        this._rebuildTrails()
      }

      this.map.on('mouseenter', 'adsb-trail-line', handleTrailHoverEnter)
      this.map.on('mouseleave', 'adsb-trail-line', handleTrailHoverLeave)
      this.map.on('mouseenter', 'adsb-trail-dots', handleTrailHoverEnter)
      this.map.on('mouseleave', 'adsb-trail-dots', handleTrailHoverLeave)

      this.map.on('zoomend', () => {
        this._updateCallsignMarkers()
        // Silhouettes grow past a zoom threshold, so the selected tag moves out
        // to stay clear of the larger icon.
        if (this._iconStyle === 'silhouette' && this._tagHex) this._rebuildTagForHex(this._tagHex)
      })
    }

    this._raiseLayers()
    this._applyTypeFilter()
    if (this._geojson.features.length) this._interpolate()
    if (this.visible && !this._pollInterval) this._startPolling()
  }

  // ---- ADS-B category label ----

  private _categoryLabel(code: string): string | null {
    const labels: Record<string, string> = {
      A0: 'No category info',
      A1: 'Light aircraft',
      A2: 'Small aircraft',
      A3: 'Large aircraft',
      A4: 'High vortex',
      A5: 'Heavy aircraft',
      A6: 'High performance',
      A7: 'Rotorcraft',
      B0: 'No category info',
      B1: 'Glider / sailplane',
      B2: 'Lighter-than-air',
      B3: 'Parachutist',
      B4: 'Ultralight',
      B6: 'UAV / drone',
      B7: 'Space vehicle',
      C1: 'Emergency surface vehicle',
      C2: 'Service surface vehicle',
      C3: 'Fixed obstruction / tower',
      C4: 'Cluster obstacle',
      C5: 'Line obstacle',
      C6: 'No category info',
    }
    if (!code) return null
    const desc = labels[code.toUpperCase()]
    return desc ? `${code.toUpperCase()} – ${desc}` : code.toUpperCase()
  }

  // ---- Data tags (built and placed by AircraftTags) ----

  private _buildTagHTML(props: AircraftProperties, forceLeftFacing?: boolean): string {
    return this._tags.buildTagHTML(props, forceLeftFacing)
  }

  private _buildTrackingFields(props: AircraftProperties): TrackingField[] {
    const alt = props.alt_baro ?? 0
    const vrt = props.baro_rate ?? 0
    const altStr =
      alt === 0
        ? 'GND'
        : alt >= 18000
          ? 'FL' + String(Math.round(alt / 100)).padStart(3, '0')
          : alt.toLocaleString() + ' ft'
    const vrtArrow = vrt > 200 ? ' ↑' : vrt < -200 ? ' ↓' : ''
    const isEmergency = !!(props.emergency && props.emergency !== 'none')
    const isMil = !!props.military
    const tfields = isMil ? this._tagFields.mil : this._tagFields.civil
    const fields: TrackingField[] = []
    if (props.r) fields.push({ label: 'REG', value: props.r })
    if (tfields.aircraftType && props.t) fields.push({ label: 'TYPE', value: props.t })
    fields.push({ label: 'ALT', value: altStr + vrtArrow })
    fields.push({ label: 'GS', value: Math.round(props.gs ?? 0) + ' kt' })
    fields.push({ label: 'HDG', value: Math.round(props.track ?? 0) + '°' })
    if (props.squawk) fields.push({ label: 'SQUAWK', value: props.squawk })
    if (isEmergency)
      fields.push({ label: 'EMRG', value: props.emergency.toUpperCase(), emrg: true })
    if (props.military) fields.push({ label: 'CLASS', value: 'MILITARY' })
    const catLabel = this._categoryLabel(props.category)
    if (catLabel) fields.push({ label: 'CATEGORY', value: catLabel })
    return fields
  }

  // ---- Status bar (Tracking store) ----

  private _showStatusBar(props: AircraftProperties): void {
    const raw = (props.flight || '').trim() || (props.r || '').trim() || (props.hex || '').trim()
    const callsign = raw || 'UNKNOWN'
    const isEmergency = !!(props.emergency && props.emergency !== 'none')
    this._trackingStore.register({
      id: 'air',
      name: isEmergency ? `⚠ ${callsign}` : callsign,
      domain: 'air',
      fields: this._buildTrackingFields(props),
      onUntrack: () => this._handleUntrack(),
    })
  }

  private _hideStatusBar(): void {
    this._trackingStore.unregister('air')
  }

  private _updateStatusBar(): void {
    if (!this._selectedHex) return
    const aircraftFeature = this._geojson.features.find(
      (f) => f.properties.hex === this._selectedHex,
    )
    if (aircraftFeature)
      this._trackingStore.updateFields('air', this._buildTrackingFields(aircraftFeature.properties))
  }

  private _handleUntrack(): void {
    this._followEnabled = false
    if (this._tagHex) {
      if (this._trackingNotifIds && this._trackingNotifIds[this._tagHex]) {
        this._notificationsStore.update({
          id: this._trackingNotifIds[this._tagHex],
          type: 'untrack',
          action: null,
        })
        delete this._trackingNotifIds[this._tagHex]
      }
      this._notifEnabled.delete(this._tagHex)
    }
    this._tags.removeSelected()
    this._tagHex = null
    this._selectedHex = null
    this._isolatedHex = null
    this._trailHex = null
    this._saveTrackingState()
    this._hideStatusBar()
    this._applySelection()
    const is3D = this._is3DActive()
    if (!is3D && this.map) this.map.easeTo({ pitch: 0, bearing: 0, duration: 600 })
  }

  // ---- Programmatic follow (search list track button + tag override) ----

  /**
   * Start following the aircraft with the given hex, switching away from any
   * currently-followed aircraft: pans/zooms to the aircraft, shows its status bar,
   * enables its notification, and builds the tracking tag marker. A no-op tag
   * rebuild is left to callers.
   */
  private _startFollowingHex(hex: string): void {
    if (this._tagHex && this._trackingNotifIds && this._trackingNotifIds[this._tagHex]) {
      this._notificationsStore.dismiss(this._trackingNotifIds[this._tagHex])
      delete this._trackingNotifIds[this._tagHex]
    }
    if (this._tagHex) this._notifEnabled.delete(this._tagHex)
    this._selectedHex = hex
    this._hideHoverTagNow()
    this._applySelection()
    this._followEnabled = true
    this._notifEnabled.add(hex)
    const aircraftFeature = this._geojson.features.find((f) => f.properties.hex === hex)
    if (aircraftFeature) {
      const cs =
        (aircraftFeature.properties.flight || '').trim() ||
        (aircraftFeature.properties.r || '').trim() ||
        hex
      if (!this._trackingNotifIds) this._trackingNotifIds = {}
      if (this._trackingNotifIds[hex]) this._notificationsStore.dismiss(this._trackingNotifIds[hex])
      this._trackingNotifIds[hex] = this._notificationsStore.add({ type: 'track', title: cs })
      this._showStatusBar(aircraftFeature.properties)
      const is3D = this._is3DActive()
      /* v8 ignore start -- defensive: aircraftFeature is in the collection so
       _interpolatedCoords always resolves; the || fallback never runs */
      const coords = this._interpolatedCoords(hex) || aircraftFeature.geometry.coordinates
      /* v8 ignore stop */
      this.map.easeTo({
        center: coords,
        zoom: 16,
        ...(is3D ? { pitch: 45 } : {}),
        duration: 600,
      })
      this._tags.placeSelected(aircraftFeature.properties, coords)
    }
    this._saveTrackingState()
  }

  /**
   * Toggle following the aircraft with the given hex from outside the map tag UI
   * (the search list's track button). Following the currently-followed aircraft
   * untracks it; otherwise it switches to following the given aircraft.
   */
  toggleFollowByHex(hex: string): void {
    if (!this.map || !hex) return
    if (this._followEnabled && this._selectedHex === hex) {
      this._handleUntrack()
      return
    }
    this._startFollowingHex(hex)
  }

  /** True when the given aircraft is the one currently being followed. */
  isFollowingHex(hex: string): boolean {
    return this._followEnabled && this._selectedHex === hex
  }

  /** Wire the tracked tag's UNTRACK button (see {@link AircraftTags.wireTagButton}). */
  private _wireTagButton(tagElement: HTMLElement): void {
    this._tags.wireTagButton(tagElement)
  }

  /** Build the pinned tag again for `hex`, if it is the tagged aircraft still on the map. */
  _rebuildTagForHex(hex: string): void {
    if (!hex || hex !== this._tagHex) return
    const taggedFeature = this._geojson.features.find((f) => f.properties.hex === hex)
    if (!taggedFeature) return
    /* v8 ignore start -- defensive: taggedFeature is in the collection so
       _interpolatedCoords always resolves; the || fallback never runs */
    const coords = this._interpolatedCoords(hex) || taggedFeature.geometry.coordinates
    /* v8 ignore stop */
    this._tags.placeSelected(taggedFeature.properties, coords)
  }

  // ---- Tag show/hide ----

  private _showSelectedTag(feature: AircraftGeoFeature | null): void {
    this._hideSelectedTag()
    this._hideStatusBar()
    if (!feature || !this.map) return
    this._followEnabled = false
    const coords = this._interpolatedCoords(feature.properties.hex) || feature.geometry.coordinates
    const tagElement = this._tags.placeSelected(feature.properties, coords)
    if (this._allHidden && !this._selectedHex) tagElement.style.visibility = 'hidden'
    this._tagHex = feature.properties.hex
    this._showStatusBar(feature.properties)
  }

  private _hideSelectedTag(): void {
    this._tags.removeSelected()
    if (this._tagHex && this._followEnabled) this._notifEnabled.delete(this._tagHex)
    this._tagHex = null
    this._saveTrackingState()
  }

  private _showHoverTag(
    feature: AircraftGeoFeature,
    fromLabel = false,
    labelElement: HTMLElement | null = null,
    labelDirection?: 'left' | 'right',
  ): void {
    this._tags.showHover(feature, fromLabel, labelElement, labelDirection)
  }

  private _hideHoverTag(): void {
    this._tags.hideHover()
  }

  private _hideHoverTagNow(): void {
    this._tags.hideHoverNow()
  }

  // ---- Callsign label markers ----

  /** Where a label or tag sits off its aircraft (see {@link AircraftTags.labelOffset}). */
  private _labelOffset(props: AircraftProperties, leftFacing: boolean): [number, number] {
    return this._tags.labelOffset(props, leftFacing)
  }

  /** An arrow's colour (see {@link CallsignLabels.arrowColour}). */
  private _arrowColour(
    props: AircraftProperties,
    isEmergency: boolean,
    isMilitary: boolean,
  ): string {
    return this._labels.arrowColour(props, isEmergency, isMilitary)
  }

  /** The glyph well markup a tag leads with (see {@link CallsignLabels.arrowSvg}). */
  private _makeArrowSvg(color: string, track: number, category?: string, type?: string): string {
    return this._labels.arrowSvg(color, track, category, type)
  }

  private _buildCallsignLabelEl(props: AircraftProperties): HTMLElement {
    return this._labels.buildLabelEl(props)
  }

  // Labels are permanently on (see the constructor). This only (re)asserts label
  // rendering — e.g. after the ADS-B layer becomes visible again — and never hides
  // them, so an inbound `false` from any remaining upstream caller is ignored.
  setLabelsVisible(_v: boolean): void {
    this.labelsVisible = true
    this._updateCallsignMarkers()
    if (this.map?.getLayer('adsb-icons'))
      this.map.setLayoutProperty('adsb-icons', 'visibility', iconLayerVisibility(this._iconStyle))
  }

  private _updateCallsignMarkers(): void {
    this._labels.update()
  }

  private _clearCallsignMarkers(): void {
    this._labels.clear()
  }

  // ---- Selection helpers ----

  // Tell the side-panel SEARCH list (AirFilter) to open this aircraft's
  // accordion. Emitted from every map gesture that selects an aircraft — the
  // icon/arrow, the hover tag, and the callsign label — so a click on any of the
  // aircraft's on-map data reveals it in the panel. MapSidebar opens the panel on
  // the search tab in response.
  private _emitOpenInPanel(hex: string): void {
    document.dispatchEvent(new CustomEvent('air-open-aircraft', { detail: { hex } }))
  }

  _applySelection(): void {
    if (!this.map) return
    // Persist the isolation so it survives leaving and returning to the Air
    // section. Empty when nothing is isolated, so it only restores when active.
    this._airStore.mapIsolatedHex = this._isolatedHex ?? ''
    this._applyTypeFilter()
    this._updateCallsignMarkers()
    if (this._selectedHex) {
      const selectedFeature = this._geojson.features.find(
        (f) => f.properties.hex === this._selectedHex,
      )
      this._showSelectedTag(selectedFeature || null)
      this._trailHex = this._selectedHex
    } else {
      this._hideSelectedTag()
      this._hideStatusBar()
      this._trailHex = null
    }
    this._rebuildTrails()
  }

  // Delegates kept for the spec, which calls and spies on them through priv();
  // the control's own redraws go through _rebuildTrails so those spies see them.
  private _rebuildTrails(): void {
    this._aircraftTrails.rebuild()
  }

  private _trailColour(altitudeFeet: number, isEmergency: 0 | 1, isMilitary: 0 | 1): string {
    return this._aircraftTrails.colour(altitudeFeet, isEmergency, isMilitary)
  }

  // ---- Position hold / stale removal ----

  private _interpolate(): void {
    if (!this.map) return
    if (!this._geojson.features.length) return
    const now = this._now()

    this._geojson.features = this._geojson.features.filter((f) => {
      const pos = this._lastPositions[f.properties.hex]
      if (!pos) return true
      if (isGone(pos, this._feedObservedAt, now)) {
        const hex = f.properties.hex
        if (hex && this._callsignMarkers[hex]) {
          this._callsignMarkers[hex].remove()
          delete this._callsignMarkers[hex]
        }
        delete this._lastPositions[hex]
        return false
      }
      return true
    })

    this._interpolatedFeatures = this._geojson.features.map((f) => {
      const hex = f.properties.hex
      const pos = this._lastPositions[hex]
      const coords = pos ? displayedPosition(pos, now) : f.geometry.coordinates
      const stale = pos && isStale(pos, this._feedObservedAt, now, this._snapshotLifetimeMs) ? 1 : 0
      return {
        ...f,
        geometry: { type: 'Point' as const, coordinates: coords },
        properties: { ...f.properties, stale },
      }
    })

    try {
      if (this.map && this.map.getSource('adsb-live')) {
        ;(this.map.getSource('adsb-live') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: this._interpolatedFeatures,
        } as GeoJSON.GeoJSON)
      }
    } catch (e) {}

    this._aircraftTrails.refreshLineHead()

    if (this._tagMarker && this._tagHex) {
      const interpolatedFeature = this._interpolatedFeatures.find(
        (f) => f.properties.hex === this._tagHex,
      )
      if (interpolatedFeature) {
        this._tagMarker.setLngLat(interpolatedFeature.geometry.coordinates)
        if (this._followEnabled) {
          const followPitch = this._getTargetPitch()
          this.map.easeTo({
            center: interpolatedFeature.geometry.coordinates,
            pitch: followPitch,
            duration: 150,
            easing: (t) => t,
          })
        }
      }
    }
    for (const f of this._interpolatedFeatures) {
      const hex = f.properties.hex
      if (hex && this._callsignMarkers[hex])
        this._callsignMarkers[hex].setLngLat(f.geometry.coordinates)
      if (hex && hex === this._hoverHex && this._tags.hoverMarker)
        this._tags.hoverMarker.setLngLat(f.geometry.coordinates)
    }
  }

  _interpolatedCoords(hex: string): [number, number] | null {
    if (this._interpolatedFeatures) {
      const interpolatedFeature = this._interpolatedFeatures.find((f) => f.properties.hex === hex)
      if (interpolatedFeature) return interpolatedFeature.geometry.coordinates
    }
    const aircraftFeature = this._geojson.features.find((f) => f.properties.hex === hex)
    return aircraftFeature ? aircraftFeature.geometry.coordinates : null
  }

  // ---- API fetch ----

  private async _fetch(): Promise<void> {
    if (!this.map || this._isFetching) return
    this._isFetching = true
    this._fetchAbort = new AbortController()

    // Always the map centre. Online, that is the area the operator is looking
    // at; off grid the backend swaps in the selected receiver's location, since
    // the receiver only hears aircraft around itself.
    const { lat, lng: lon } = this.map.getCenter()

    try {
      const url = `${origin}/api/air/adsb/point/${lat.toFixed(4)}/${lon.toFixed(4)}/250`
      const resp = await fetch(url, { signal: this._fetchAbort.signal })
      if (!this.map) return
      if (resp.status === 204) {
        // Nothing new to send (X-Unavailable-Reason says why) — not a failure:
        // keep the aircraft we have; they dim and age out as usual.
        this._fetchFailCount = 0
        const retryAfterMs = durationHeaderMs(resp.headers.get('Retry-After')) * 1000
        if (resp.headers.get('X-Unavailable-Reason') === 'daily-limit' && retryAfterMs > 0) {
          this._pausePollingFor(retryAfterMs)
        }
        return
      }
      if (!resp.ok) {
        if (resp.status === 429) {
          this._isFetching = false
          this._stopFetching()
          setTimeout(() => {
            if (this.visible) this._startPolling()
          }, 30000)
          return
        }
        this._fetchFailCount++
        if (this._fetchFailCount >= 3) {
          this._fetchFailCount = 0
          this._geojson = { type: 'FeatureCollection', features: [] }
          this._lastPositions = {}
          this._clearCallsignMarkers()
          try {
            ;(this.map.getSource('adsb-live') as maplibregl.GeoJSONSource)?.setData(
              this._geojson as GeoJSON.GeoJSON,
            )
          } catch (e) {}
        }
        this._isFetching = false
        return
      }
      this._fetchFailCount = 0
      // Taken before parsing, and the server's snapshot age with it: every
      // report below is dated by when it was observed, not when it arrived.
      const receivedAt = Date.now()
      const snapshotAge = durationHeaderMs(resp.headers.get('X-Snapshot-Age-Ms'))
      this._feedObservedAt = Math.max(this._feedObservedAt, receivedAt - snapshotAge)
      this._snapshotLifetimeMs = durationHeaderMs(resp.headers.get('X-Snapshot-Lifetime-Ms'))
      const data = await resp.json()
      if (!this.map) return
      const aircraft = (data.ac || []) as AircraftApiEntry[]
      this._ingestSnapshot(aircraft, receivedAt, snapshotAge)
      this._fetchFailCount = 0
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      this._fetchFailCount++
      if (this._fetchFailCount >= 3) {
        this._fetchFailCount = 0
        this._isFetching = false
        this._stopFetching()
        setTimeout(() => {
          if (this.visible) this._startPolling()
        }, 30000)
        return
      }
    } finally {
      this._fetchAbort = null
      this._isFetching = false
    }
  }

  /**
   * Draw one snapshot of aircraft — the live feed's, or a replayed moment's
   * (`_drawReplayFrame`), which reach the map through this one path so every
   * feature (filters, tags, trails, selection, tracking panel) behaves the same.
   *
   * @param receivedAt  When the snapshot arrived (replay: the replayed moment).
   * @param snapshotAge How old the server's snapshot already was on arrival.
   */
  private _ingestSnapshot(
    aircraft: AircraftApiEntry[],
    receivedAt: number,
    snapshotAge: number,
  ): void {
    const seen = new Set<string>()

    const existingByHex = new Map<string, AircraftGeoFeature>()
    for (const f of this._geojson.features) {
      if (f.properties.hex) existingByHex.set(f.properties.hex, f)
    }

    const newFeatures: AircraftGeoFeature[] = []

    for (const a of aircraft.filter(
      (a) =>
        a.lat != null &&
        a.lon != null &&
        !['A0', 'B0', 'C0'].includes((a.category || '').toUpperCase()),
    )) {
      const alt = this._parseAlt(a.alt_baro ?? null)
      const hex = a.hex || ''
      seen.add(hex)

      if (hex) {
        const report = { lon: a.lon!, lat: a.lat!, gs: a.gs, track: a.track }
        const reportObservedAt = observedAt(receivedAt, snapshotAge, a.seen_pos)
        const existing = this._lastPositions[hex]
        if (existing) {
          const next = reanchor(existing, report, reportObservedAt, this._now())
          // Nothing newer than what is held (a cached snapshot served again):
          // keep the aircraft as it is — its age, position, trail and details.
          if (!next) continue
          this._lastPositions[hex] = next
        } else {
          this._lastPositions[hex] = startTracking(report, reportObservedAt)
        }
      }

      if (hex) this._aircraftTrails.record(hex, { lon: a.lon!, lat: a.lat!, alt })

      if (hex) {
        // Landing/departure *notifications* are handled by the app-level
        // AircraftEventDetector (see useAirAlertsService) so they fire from
        // any section. The control keeps a minimal landing check purely to
        // drive its own post-landing render cleanup (the parked-aircraft
        // removal timer below) for opted-in aircraft.
        const prevAlt = this._prevAlt[hex]
        const justLanded = prevAlt !== undefined && prevAlt > 0 && alt === 0
        if (justLanded) this._landedAt[hex] = this._now()
        this._prevAlt[hex] = alt

        if (justLanded && this._notifEnabled.has(hex)) {
          if (this._parkedTimers[hex]) clearTimeout(this._parkedTimers[hex])
          this._parkedTimers[hex] = setTimeout(() => {
            delete this._parkedTimers[hex]
            delete this._prevAlt[hex]
            delete this._hasDeparted[hex]
            this._aircraftTrails.forget(hex)
            delete this._lastPositions[hex]
            this._geojson = {
              type: 'FeatureCollection',
              features: this._geojson.features.filter((f) => f.properties.hex !== hex),
            }
            if (this._interpolatedFeatures)
              this._interpolatedFeatures = this._interpolatedFeatures.filter(
                (f) => f.properties.hex !== hex,
              )
            if (this._callsignMarkers[hex]) {
              this._callsignMarkers[hex].remove()
              delete this._callsignMarkers[hex]
            }
            if (this._selectedHex === hex) {
              this._selectedHex = null
              this._isolatedHex = null
              this._followEnabled = false
              // The isolated aircraft is gone — drop the persisted isolation so
              // it isn't re-applied to a vanished hex on the next visit.
              this._airStore.mapIsolatedHex = ''
              this._hideSelectedTag()
              this._hideStatusBar()
            }
            if (this.map) {
              this._rebuildTrails()
              this._interpolate()
            }
          }, 60 * 1000)
        }
        if (alt > 0 && this._parkedTimers[hex]) {
          clearTimeout(this._parkedTimers[hex])
          delete this._parkedTimers[hex]
        }
      }

      const gs = a.gs ?? 0
      const military = isMilitary(hex, a.dbFlags)

      const coords = [a.lon!, a.lat!] as [number, number]

      newFeatures.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: coords },
        properties: {
          hex,
          flight: (a.flight || '').trim(),
          r: a.r || '',
          t: a.t || '',
          alt_baro: alt,
          alt_geom: a.alt_geom ?? null,
          gs,
          ias: a.ias ?? null,
          mach: a.mach ?? null,
          track: a.track ?? 0,
          baro_rate: a.baro_rate ?? 0,
          nav_altitude: a.nav_altitude_mcp ?? a.nav_altitude_fms ?? null,
          nav_heading: a.nav_heading ?? null,
          category: (a.category || '').toUpperCase(),
          emergency: a.emergency || '',
          squawk: a.squawk || '',
          squawkEmerg: this._emergencySquawks.has(a.squawk || '') ? 1 : 0,
          rssi: a.rssi ?? null,
          military,
          stale: 0,
          ...silhouetteProperties(
            a.t || '',
            a.category || '',
            military,
            this._emergencySquawks.has(a.squawk || ''),
            this._parseAlt(a.alt_baro ?? null),
            this._altitudeColouring,
          ),
        } as AircraftProperties,
      })
      existingByHex.delete(hex)
    }

    for (const [, f] of existingByHex) {
      if (this._lastPositions[f.properties.hex]) newFeatures.push(f)
    }

    this._geojson = { type: 'FeatureCollection', features: newFeatures }
    document.dispatchEvent(new CustomEvent('adsb-data-update'))

    for (const hex of Object.keys(this._prevAlt)) {
      if (!seen.has(hex) && !this._parkedTimers[hex] && !this._lastPositions[hex])
        delete this._prevAlt[hex]
    }
    for (const hex of Object.keys(this._hasDeparted)) {
      if (!seen.has(hex) && !this._lastPositions[hex]) delete this._hasDeparted[hex]
    }
    // Emergency-squawk alerts are raised by the server, which notices them
    // with or without this page open (docs/plans/adsb-server-alerts.md); the
    // map still highlights the aircraft (squawkEmerg above).

    this._lastFetchTime = Date.now()
    this._restoreTrackingState()
    this._restoreIsolationState()
    this._rebuildTrails()
    if (this._tagHex && this._tagMarker) {
      const taggedFeature = this._geojson.features.find((f) => f.properties.hex === this._tagHex)
      if (taggedFeature) {
        // A polled aircraft always has a track (the feed's, or 0), set above.
        if (isLeftFacing(taggedFeature.properties.track) !== this._tags.selectedLeftFacing) {
          // Turned to face the other way: the text flips sides, so the tag
          // must be placed again on the aircraft's other side.
          this._rebuildTagForHex(this._tagHex)
        } else {
          this._tags.refreshSelected(taggedFeature.properties)
        }
        this._updateStatusBar()
      } else {
        this._hideSelectedTag()
        this._hideStatusBar()
      }
    }
    this._updateCallsignMarkers()
    this._interpolate()
    this._raiseLayers()
  }

  // ---- Layer z-order ----

  private _raiseLayers(): void {
    if (!this.map) return
    try {
      if (this.map.getLayer(MAP_DIM_LAYER_ID)) this.map.moveLayer(MAP_DIM_LAYER_ID)
      // Airfields sit above the dimming but beneath every aircraft.
      for (const layerId of AIRFIELD_LAYER_ORDER) {
        if (this.map.getLayer(layerId)) this.map.moveLayer(layerId)
      }
      for (const layerId of TRAIL_LAYER_IDS) {
        if (this.map.getLayer(layerId)) this.map.moveLayer(layerId)
      }
      if (this.map.getLayer('adsb-bracket')) this.map.moveLayer('adsb-bracket')
      if (this.map.getLayer('adsb-icons')) this.map.moveLayer('adsb-icons')
      if (this.map.getLayer('adsb-hit')) this.map.moveLayer('adsb-hit')
    } catch (_) {}
  }

  // ---- Tracking state persistence ----

  // Delegates kept for the spec, which calls them through priv().
  private _saveTrackingState(): void {
    this._trackingPersistence.save()
  }

  private _restoreIsolationState(): void {
    this._trackingPersistence.restoreIsolation()
  }

  private _restoreTrackingState(): void {
    this._trackingPersistence.restoreTracking()
  }

  private _doRestoreTracking(): boolean {
    return this._trackingPersistence.applySaved()
  }

  /**
   * Follow a restored aircraft again: select it, save it as followed, re-arm its
   * alerts, pin its tag and status bar, and ease the map to it.
   */
  private _applyTrackingRestore(aircraftFeature: AircraftGeoFeature): void {
    const hex = aircraftFeature.properties.hex
    this._selectedHex = hex
    this._applySelection()
    this._followEnabled = true
    this._saveTrackingState()
    this._notifEnabled.add(hex)
    try {
      const persisted = this._notificationsStore.items.filter(
        (notification) => notification.type === 'tracking',
      )
      if (!this._trackingNotifIds) this._trackingNotifIds = {}
      for (const item of persisted) {
        this._trackingNotifIds[hex] = item.id
        this._notificationsStore.update({
          id: item.id,
          action: {
            label: 'DISABLE ALERTS',
            callback: () => {
              this._notifEnabled.delete(hex)
              if (this._trackingNotifIds) delete this._trackingNotifIds[hex]
              this._rebuildTagForHex(hex)
            },
          },
        })
      }
    } catch {}
    /* v8 ignore start -- defensive: aircraftFeature is in the collection so
         _interpolatedCoords always resolves; the || fallback never runs */
    const coords = this._interpolatedCoords(hex) || aircraftFeature.geometry.coordinates
    /* v8 ignore stop */
    this._tags.placeSelected(aircraftFeature.properties, coords)
    this._tagHex = hex
    this._showStatusBar(aircraftFeature.properties)
    const is3D = this._is3DActive()
    this.map.easeTo({
      center: aircraftFeature.geometry.coordinates,
      zoom: 16,
      ...(is3D ? { pitch: 45 } : {}),
      duration: 600,
    })
  }

  /**
   * Select the aircraft with this hex the way a click on its callsign label
   * does — selected tag, status bar and trail — then ease the map to it. Used by
   * the SEARCH list and alert clicks. Returns false when the aircraft is not in
   * the current feed (nothing is selected or moved).
   */
  selectByHex(hex: string): boolean {
    if (!this.map || !hex) return false
    const aircraftFeature = this._geojson.features.find((f) => f.properties.hex === hex)
    if (!aircraftFeature) return false
    this._selectedHex = hex
    this._hideHoverTagNow()
    this._applySelection()
    /* v8 ignore start -- defensive: aircraftFeature is in the collection so
       _interpolatedCoords always resolves; the || fallback never runs */
    const coords = this._interpolatedCoords(hex) || aircraftFeature.geometry.coordinates
    /* v8 ignore stop */
    this.map.easeTo({ center: coords, zoom: Math.max(this.map.getZoom(), 10), duration: 600 })
    return true
  }

  // ---- Polling control ----

  private _startPolling(): void {
    // In replay the feed is the recording (`_drawReplayFrame`), not the network;
    // only the interpolation (stopped while the layer was hidden) comes back.
    if (this._replayPlayer) {
      this._interpolateInterval ??= setInterval(() => this._interpolate(), 100)
      return
    }
    // Hidden: the visibilitychange listener starts polling when the tab returns.
    if (this._pollInterval || document.hidden) return
    if (Date.now() - this._lastFetchTime > ADSB_REFETCH_GUARD_MS) this._fetch()
    this._pollInterval = setInterval(() => this._fetch(), ADSB_POLL_INTERVAL_MS)
    if (!this._interpolateInterval) {
      this._interpolateInterval = setInterval(() => this._interpolate(), 100)
    }
  }

  private _stopPolling(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval)
      this._pollInterval = null
    }
    this._cancelResume()
    if (this._interpolateInterval) {
      clearInterval(this._interpolateInterval)
      this._interpolateInterval = null
    }
  }

  /**
   * Stop asking for aircraft until the online feed's daily limit resets: every
   * poll before then would only be told there is nothing new. Showing the
   * layer again (`_startPolling`) asks once, and pauses again if still spent.
   */
  private _pausePollingFor(milliseconds: number): void {
    this._stopFetching()
    this._cancelResume()
    this._resumePollingTimer = setTimeout(() => {
      this._resumePollingTimer = null
      if (this.visible) this._startPolling()
    }, milliseconds)
  }

  private _cancelResume(): void {
    if (this._resumePollingTimer) {
      clearTimeout(this._resumePollingTimer)
      this._resumePollingTimer = null
    }
  }

  private _stopFetching(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval)
      this._pollInterval = null
    }
  }

  // ---- Effective connectivity mode ----

  private _effectiveMode(): SourceMode {
    return readCachedSectionMode('air')
  }

  // ---- Public clear method (called by AirMap.vue on connectivity change) ----

  // ---- Replay ----

  /** The clock aircraft are aged and moved by: the wall clock live, the replayed moment in replay. */
  private _now(): number {
    return this._playback.now('air')
  }

  /** Whether the map is showing recorded aircraft instead of the live feed. */
  get isReplaying(): boolean {
    return this._replayPlayer !== null
  }

  /**
   * Swap the live feed for the recording. Polling stops (no online quota is
   * spent while replaying); the 100 ms interpolation keeps running, driven by
   * the replay clock, so recorded aircraft glide between frames as live ones do.
   */
  enterReplay(): void {
    if (this._replayPlayer) return
    this._stopPolling()
    this._fetchAbort?.abort()
    this._replayPlayer = createAirReplayPlayer()
    this._replaySeekVersion = -1
    this._resetFeedState()
    // A frame a second of wall time: at 60× that is a recorded minute, which
    // the interpolation fills in between.
    this._replayTimer = setInterval(() => void this._drawReplayFrame(), 1000)
    this._interpolateInterval ??= setInterval(() => this._interpolate(), 100)
    void this._drawReplayFrame()
  }

  /** Back to the live feed: the recorded picture is cleared, then polling resumes. */
  exitReplay(): void {
    if (!this._replayPlayer) return
    if (this._replayTimer) clearInterval(this._replayTimer)
    this._replayTimer = null
    this._replayPlayer.reset()
    this._replayPlayer = null
    this._resetFeedState()
    this._feedObservedAt = 0
    this._lastFetchTime = 0
    if (this.visible) this._startPolling()
  }

  /** Draw the replayed moment now (after a seek or step), rather than at the next tick. */
  refreshReplay(): void {
    if (this._replayPlayer) void this._drawReplayFrame()
  }

  private async _drawReplayFrame(): Promise<void> {
    const player = this._replayPlayer
    if (!player || !this.map || this._replayFrameInFlight) return
    this._replayFrameInFlight = true
    try {
      const section = this._playback.sections.air
      const replayedAt = section.cursorMs
      // A jump (seek, step, entering replay): start the picture afresh, or
      // every aircraft would be refused as "older than what is held" after a
      // jump back, and glide across the map after a jump forward.
      if (section.seekVersion !== this._replaySeekVersion) {
        this._replaySeekVersion = section.seekVersion
        this._resetFeedState()
      }
      const frame = await player.frameAt(replayedAt)
      // Replay ended, or another jump happened, while the chunk loaded.
      if (this._replayPlayer !== player || section.seekVersion !== this._replaySeekVersion) return
      this._feedObservedAt = replayedAt
      this._snapshotLifetimeMs = 0
      this._ingestSnapshot(
        frame.map((entity) => replayEntryFromFrame(entity, replayedAt)),
        replayedAt,
        0,
      )
    } finally {
      this._replayFrameInFlight = false
    }
  }

  /**
   * Forget every aircraft's position, trail and landing state, keeping what the
   * operator chose (selection, isolation, follow, filters): a selected aircraft
   * that is in the new picture stays selected.
   */
  private _resetFeedState(): void {
    for (const timer of Object.values(this._parkedTimers)) clearTimeout(timer)
    this._parkedTimers = {}
    this._clearCallsignMarkers()
    this._geojson = { type: 'FeatureCollection', features: [] }
    this._lastPositions = {}
    this._interpolatedFeatures = []
    this._prevAlt = {}
    this._hasDeparted = {}
    this._seenOnGround = {}
    this._landedAt = {}
    this._aircraftTrails.clear()
    try {
      ;(this.map?.getSource('adsb-live') as maplibregl.GeoJSONSource | undefined)?.setData(
        this._geojson as GeoJSON.GeoJSON,
      )
    } catch (e) {}
  }

  clearAircraft(): void {
    this._fetchAbort?.abort()
    this._fetchAbort = null
    this._isFetching = false
    this._stopPolling()
    if (this._hoverHideTimer) {
      clearTimeout(this._hoverHideTimer)
      this._hoverHideTimer = null
    }
    for (const t of Object.values(this._parkedTimers)) clearTimeout(t)
    this._parkedTimers = {}
    this._clearCallsignMarkers()
    this._hideHoverTagNow()
    this._tags.removeSelected()
    this._tagHex = null
    this._hideStatusBar()
    this._selectedHex = null
    this._isolatedHex = null
    this._followEnabled = false
    this._geojson = { type: 'FeatureCollection', features: [] }
    this._lastPositions = {}
    this._interpolatedFeatures = []
    this._prevAlt = {}
    this._hasDeparted = {}
    this._seenOnGround = {}
    this._landedAt = {}
    try {
      ;(this.map.getSource('adsb-live') as maplibregl.GeoJSONSource)?.setData(
        this._geojson as GeoJSON.GeoJSON,
      )
    } catch (e) {}
    this._aircraftTrails.clear()
  }

  /**
   * Switch the feed after the connectivity mode changes (or the style reloads).
   *
   * Both modes poll the same `/api/air/adsb/point` endpoint: the backend picks
   * the internet feed or the off-grid receiver from the effective mode. Off grid
   * used to clear the aircraft and stop polling outright, so the map stayed
   * empty while the decoder was serving aircraft. The aircraft from the old
   * feed are cleared either way, so none linger from the source just left.
   */
  handleConnectivityChange(): void {
    const mode = this._effectiveMode()
    // Replaying: the recording holds both sources, so nothing to switch now;
    // returning to live (`exitReplay`) starts polling under the new mode.
    if (this._replayPlayer) {
      this._lastFeedMode = mode
      return
    }
    if (mode === this._lastFeedMode) {
      if (this.visible && !this._pollInterval) this._startPolling()
      return
    }
    this._lastFeedMode = mode
    this.clearAircraft()
    if (this.visible) this._startPolling()
  }

  // ---- Visibility toggle ----

  toggle(): void {
    this.visible = !this.visible
    if (this.visible) {
      this._startPolling()
    } else {
      this._stopPolling()
      this._selectedHex = null
      this._followEnabled = false
      this._hideSelectedTag()
      this._hideHoverTag()
      this._hideStatusBar()
      for (const [hex, marker] of Object.entries(this._callsignMarkers)) {
        const aircraftFeature = this._geojson.features.find((f) => f.properties.hex === hex)
        if (!aircraftFeature) continue
        const cat = (aircraftFeature.properties.category || '').toUpperCase()
        const isGnd = ['C1', 'C2'].includes(cat)
        const isTower =
          ['C3', 'C4', 'C5'].includes(cat) ||
          (aircraftFeature.properties.t || '').toUpperCase() === 'TWR'
        if (!isGnd && !isTower) {
          marker.remove()
          delete this._callsignMarkers[hex]
        }
      }
    }
    // Trail layers: hide when control is toggled off; when toggled on, _rebuildTrails will manage visibility
    if (!this.visible) this._aircraftTrails.setVisibility(false)
    this._applyTypeFilter()
    if (this.button) {
      this.button.style.opacity = this.visible ? '1' : '0.3'
      this.button.style.color = this.visible ? '#c8ff00' : '#ffffff'
    }
    if (this._onAdsbLabelsSync) this._onAdsbLabelsSync(this.visible)
    this._airStore.setOverlay('adsb', this.visible)
  }
}
