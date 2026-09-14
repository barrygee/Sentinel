import maplibregl from 'maplibre-gl'
import { watch, type WatchStopHandle } from 'vue'
import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import { createBracket } from '@/components/air/controls/adsb/adsbSprites'
import { createVesselArrow, createVesselDot } from './vesselSprites'
import {
  appendMirrored,
  createAccentBadge,
  createDimBadge,
  createDirectionArrowShape,
  createFilledDotShape,
  createGlyphSvg,
  createGlyphWell,
  createLabelPill,
  createNameSegment,
} from '@/components/shared/map-label/mapLabelParts'
import { setMarkerAccessibleName } from '@/components/shared/map-label/mapMarkerAria'
import { buildCountMarker } from '@/components/shared/map-cluster/mapCluster'
import { planVesselLabels, vesselFacesLeft, type VesselCount } from './vesselLabelPlan'
import {
  SEA_COUNT_FILL,
  SEA_COUNT_RING,
  SEA_COUNT_TEXT,
  SEA_COUNT_ZOOM_STEP,
  SEA_GROUP_ALL_ABOVE_NM,
  SEA_WIDE_VIEW_COUNT_CELL_PX,
  SEA_INTERPOLATE_INTERVAL_MS,
  SEA_MIN_MOVING_KNOTS,
  SEA_MOVE_FETCH_DEBOUNCE_MS,
  SEA_VIEWPORT_PAD_FRACTION,
} from '@/constants/sea'
import {
  familyMatchesCategory,
  VESSEL_FAMILIES,
  vesselFamilyColor,
  vesselFamilyLabel,
} from '@/utils/aisShipType'
import type { SeaBbox, SeaTrackSample, SeaVessel, useSeaStore } from '@/stores/sea'

type SeaStore = ReturnType<typeof useSeaStore>

/** Fill behind a label's type chip — the sidebar's charcoal, as on the Land map. */
const VESSEL_BADGE_BACKGROUND = '#15171d'

/** A fix older than this is drawn dimmed: the vessel may well have moved on. */
const STALE_AFTER_MS = 10 * 60 * 1000

/** Dead-reckoning is capped at this many ms of elapsed time so a vessel whose
 *  fix is old does not sail off the edge of the map on the strength of it. */
const MAX_DEAD_RECKON_MS = 10 * 60 * 1000

const SOURCE_ID = 'sea-vessels'
const TRACK_SOURCE_ID = 'sea-vessel-track'
const LAYER_TRACK = 'sea-vessel-track-line'
const LAYER_ICONS = 'sea-vessel-icons'
const LAYER_BRACKET = 'sea-vessel-bracket'
const LAYER_HIT = 'sea-vessel-hit'

interface VesselFeatureProperties {
  mmsi: string
  name: string
  family: string
  rotate: number
  hasCourse: 0 | 1
  stale: 0 | 1
}
type VesselFeature = GeoJSON.Feature<GeoJSON.Point, VesselFeatureProperties>

/** Metres travelled per hour at one knot. */
const METRES_PER_NM = 1852

/**
 * Sea-map control that plots live AIS vessels from the Sea store.
 *
 * Vessels are drawn as a MapLibre symbol layer (a hull chevron tinted by
 * family, rotated to the heading — or a dot when the vessel reports no course),
 * dead-reckoned between polls from speed and course, with the operator's chosen
 * label fields drawn as Sentinel's shared pill markers once the map is zoomed
 * in enough to read them. A click selects a vessel: it gains the Air map's
 * bracket, its recent path is drawn, and the FILTER pane opens its row.
 *
 * The canvas is opaque to assistive tech, so the SeaFilter pane is the
 * accessible equivalent; this control only keeps a short hidden status line.
 */
export class AisVesselsControl extends SentinelControlBase {
  private readonly _seaStore: SeaStore
  private _features: VesselFeature[] = []
  private _labelMarkers = new Map<string, maplibregl.Marker>()
  private _labelSignatures = new Map<string, string>()
  private _countMarkers = new Map<string, maplibregl.Marker>()
  private _countSizes = new Map<string, number>()
  private _moveFetchTimer: ReturnType<typeof setTimeout> | null = null
  private _hoverMarker: maplibregl.Marker | null = null
  private _hoverMmsi: string | null = null
  private _interpolateTimer: ReturnType<typeof setInterval> | null = null
  private _stopWatchers: WatchStopHandle[] = []
  private _onMoveEnd: (() => void) | null = null
  private _onMapClick: ((event: maplibregl.MapMouseEvent) => void) | null = null
  private _a11yRegion: HTMLDivElement | null = null
  private _layersReady = false

  constructor(seaStore: SeaStore) {
    super()
    this._seaStore = seaStore
  }

  get buttonLabel(): string {
    // A small hull-and-wave glyph.
    return (
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 9.5h10l-1.5 3h-7z" /><path d="M8 3v6.5" /><path d="M8 3l3.5 4.5H8" />' +
      '<path d="M2 14c1 .8 2 .8 3 0s2-.8 3 0 2 .8 3 0 2-.8 3 0" /></svg>'
    )
  }

  get buttonTitle(): string {
    return 'Toggle live vessels'
  }

  /** Whether the vessels layer is shown — held on the store so the FILTER pane
   *  lists exactly what the map plots. */
  get visible(): boolean {
    return this._seaStore.overlayStates.vessels
  }

  protected onInit(): void {
    this.setButtonActive(this.visible)
    this._ensureA11yRegion()
    this.initLayers()
    this._publishViewport()
    this._seaStore.startPolling()

    this._onMoveEnd = () => {
      this._publishViewport()
      this._renderLabels()
      // Only what is on screen is held, so a pan needs the new view's vessels
      // now rather than at the next poll.
      if (this._moveFetchTimer) clearTimeout(this._moveFetchTimer)
      this._moveFetchTimer = setTimeout(() => {
        this._moveFetchTimer = null
        void this._seaStore.fetchVessels()
      }, SEA_MOVE_FETCH_DEBOUNCE_MS)
    }
    this.map.on('moveend', this._onMoveEnd)

    this._onMapClick = (event: maplibregl.MapMouseEvent) => {
      // Clicking empty sea clears the selection; clicks on a vessel are handled
      // by the layer listener below and stop here via the hit test.
      const hits = this.map.queryRenderedFeatures(event.point, { layers: [LAYER_HIT] })
      if (hits.length === 0) this.clearSelection()
    }
    this.map.on('click', this._onMapClick)
    this.map.on('click', LAYER_HIT, (event) => {
      const mmsi = String(event.features?.[0]?.properties?.mmsi ?? '')
      if (mmsi) this.selectByMmsi(mmsi, { openPane: true })
    })
    this.map.on('mouseenter', LAYER_HIT, (event) => {
      this.map.getCanvas().style.cursor = 'pointer'
      const mmsi = String(event.features?.[0]?.properties?.mmsi ?? '')
      if (mmsi) this._showHoverLabel(mmsi)
    })
    this.map.on('mouseleave', LAYER_HIT, () => {
      this.map.getCanvas().style.cursor = ''
      this._hideHoverLabel()
    })

    this._stopWatchers.push(
      watch(
        () => [this._seaStore.vessels, this._seaStore.seaFilterCategory] as const,
        () => this._rebuildFeatures(),
        { immediate: true },
      ),
      watch(
        () => this._seaStore.overlayStates,
        () => this._applyVisibility(),
        { immediate: true, deep: true },
      ),
      watch(
        () => this._seaStore.labelFields,
        () => this._renderLabels(),
        { deep: true },
      ),
      watch(
        () => this._seaStore.selectedMmsi,
        () => this._applySelection(),
      ),
      watch(
        () => this._seaStore.selectedTrack,
        (samples) => this._renderTrack(samples),
      ),
    )
    this._interpolateTimer = setInterval(() => this._interpolate(), SEA_INTERPOLATE_INTERVAL_MS)
  }

  protected handleClick(): void {
    this._seaStore.setOverlay('vessels', !this.visible)
    this.setButtonActive(this.visible)
  }

  /** Set the layer's visibility explicitly (from the default-layers config). */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return
    this._seaStore.setOverlay('vessels', visible)
    this.setButtonActive(this.visible)
  }

  /** Toggle the layer from the side menu. */
  toggle(): void {
    this.handleClick()
  }

  /**
   * (Re)create sources and layers. Safe to call after a style reload, which
   * drops every layer the control added.
   */
  initLayers(): void {
    this._registerIcons()
    if (!this.map.getSource(SOURCE_ID)) {
      this.map.addSource(SOURCE_ID, { type: 'geojson', data: this._collection() })
    }
    if (!this.map.getSource(TRACK_SOURCE_ID)) {
      this.map.addSource(TRACK_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
    }
    if (!this.map.getLayer(LAYER_TRACK)) {
      this.map.addLayer({
        id: LAYER_TRACK,
        type: 'line',
        source: TRACK_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-width': 3, 'line-opacity': 0.55, 'line-color': ['get', 'color'] },
      })
    }
    if (!this.map.getLayer(LAYER_ICONS)) {
      this.map.addLayer({
        id: LAYER_ICONS,
        type: 'symbol',
        source: SOURCE_ID,
        layout: {
          'icon-image': [
            'concat',
            ['case', ['==', ['get', 'hasCourse'], 1], 'sea-vessel-', 'sea-dot-'],
            ['get', 'family'],
          ] as maplibregl.ExpressionSpecification,
          'icon-size': 0.55,
          'icon-rotate': ['get', 'rotate'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-opacity': [
            'case',
            ['==', ['get', 'stale'], 1],
            0.35,
            1,
          ] as maplibregl.ExpressionSpecification,
        },
      })
    }
    if (!this.map.getLayer(LAYER_BRACKET)) {
      this.map.addLayer({
        id: LAYER_BRACKET,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['==', ['get', 'mmsi'], ''] as maplibregl.FilterSpecification,
        layout: {
          'icon-image': 'sea-bracket',
          'icon-size': 0.75,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      })
    }
    if (!this.map.getLayer(LAYER_HIT)) {
      // Transparent hit-test layer so hover/click have a generous target.
      this.map.addLayer({
        id: LAYER_HIT,
        type: 'circle',
        source: SOURCE_ID,
        paint: { 'circle-radius': 12, 'circle-opacity': 0, 'circle-stroke-width': 0 },
      })
    }
    this._layersReady = true
    this._applyVisibility()
    this._applySelection()
    this._renderTrack(this._seaStore.selectedTrack)
  }

  /** Select a vessel from the map or the FILTER pane. */
  selectByMmsi(mmsi: string, options: { openPane?: boolean; flyTo?: boolean } = {}): void {
    this._seaStore.setSelectedMmsi(mmsi)
    void this._seaStore.fetchTrack(mmsi)
    if (options.openPane) {
      document.dispatchEvent(new CustomEvent('sea-open-vessel', { detail: { mmsi } }))
    }
    if (options.flyTo) {
      const feature = this._features.find((candidate) => candidate.properties.mmsi === mmsi)
      if (feature) {
        this.map.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: Math.max(this.map.getZoom(), 11),
          duration: 600,
        })
      }
    }
  }

  /** Drop the selection: bracket and track go, the pane row stays as it was. */
  clearSelection(): void {
    if (!this._seaStore.selectedMmsi) return
    this._seaStore.setSelectedMmsi('')
    this._seaStore.setSelectedTrack([])
  }

  onRemove(): void {
    // MapLibre only removes a control it added, so onInit has always run here:
    // every handler and timer below exists (clearing a null timer is a no-op).
    this.map.off('moveend', this._onMoveEnd!)
    this.map.off('click', this._onMapClick!)
    this._onMoveEnd = null
    this._onMapClick = null
    clearInterval(this._interpolateTimer!)
    this._interpolateTimer = null
    clearTimeout(this._moveFetchTimer ?? undefined)
    this._moveFetchTimer = null
    for (const stop of this._stopWatchers) stop()
    this._stopWatchers = []
    this._seaStore.stopPolling()
    this._clearLabels()
    this._clearCounts()
    this._hideHoverLabel()
    this._a11yRegion?.remove()
    this._a11yRegion = null
    this._layersReady = false
    super.onRemove()
  }

  // ── data → features ─────────────────────────────────────────────────────────

  private _rebuildFeatures(): void {
    const category = this._seaStore.seaFilterCategory
    const now = Date.now()
    this._features = this._seaStore.vessels
      .filter((vessel) => familyMatchesCategory(vessel.family, category))
      .map((vessel) => this._featureFor(vessel, now))
    this._pushFeatures()
    this._renderLabels()
    this._renderA11y()
  }

  private _featureFor(vessel: SeaVessel, now: number): VesselFeature {
    const bearing = vessel.heading ?? vessel.cog
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: deadReckon(vessel, now) },
      properties: {
        mmsi: vessel.mmsi,
        name: vessel.name,
        family: vessel.family,
        rotate: bearing ?? 0,
        hasCourse: bearing === null ? 0 : 1,
        stale: now - vessel.lastPositionMs > STALE_AFTER_MS ? 1 : 0,
      },
    }
  }

  private _collection(): GeoJSON.FeatureCollection {
    return { type: 'FeatureCollection', features: this._features }
  }

  private _pushFeatures(): void {
    if (!this._layersReady) return
    const source = this.map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    source?.setData(this._collection())
  }

  /** Advance every moving vessel along its course since its last fix. */
  private _interpolate(): void {
    if (!this.visible || !this._layersReady) return
    // Never queue a push behind one the worker is still processing: the
    // previous data would be thrown away unrendered and the worker kept busy.
    const source = this.map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (!source || !source.loaded()) return
    const now = Date.now()
    const byMmsi = new Map(this._seaStore.vessels.map((vessel) => [vessel.mmsi, vessel]))
    let moved = false
    for (const feature of this._features) {
      const vessel = byMmsi.get(feature.properties.mmsi)
      if (!vessel || !isMoving(vessel)) continue
      feature.geometry.coordinates = deadReckon(vessel, now)
      moved = true
      const marker = this._labelMarkers.get(vessel.mmsi)
      marker?.setLngLat(feature.geometry.coordinates as [number, number])
    }
    if (moved) this._pushFeatures()
  }

  // ── visibility, selection, track ────────────────────────────────────────────

  private _applyVisibility(): void {
    if (!this._layersReady) return
    const shown = this.visible ? 'visible' : 'none'
    for (const layer of [LAYER_ICONS, LAYER_BRACKET, LAYER_HIT, LAYER_TRACK]) {
      this.map.setLayoutProperty(layer, 'visibility', shown)
    }
    this.setButtonActive(this.visible)
    this._renderLabels()
  }

  private _applySelection(): void {
    if (!this._layersReady) return
    const mmsi = this._seaStore.selectedMmsi
    this.map.setFilter(LAYER_BRACKET, ['==', ['get', 'mmsi'], mmsi])
    if (!mmsi) this._renderTrack([])
  }

  private _renderTrack(samples: SeaTrackSample[]): void {
    if (!this._layersReady) return
    const source = this.map.getSource(TRACK_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    const mmsi = this._seaStore.selectedMmsi
    const vessel = this._seaStore.vessels.find((candidate) => candidate.mmsi === mmsi)
    const features: GeoJSON.Feature[] = []
    if (mmsi && samples.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: samples.map((sample) => [sample.lon, sample.lat]),
        },
        properties: { color: vesselFamilyColor(vessel?.family) },
      })
    }
    source?.setData({ type: 'FeatureCollection', features })
  }

  // ── labels ──────────────────────────────────────────────────────────────────

  /**
   * Draw the pills and counts for everything on screen.
   *
   * Every vessel in view is either labelled or inside a count, so the bare
   * arrow layer only shows while labels are switched off on the rail. Planning
   * is screen-space (see vesselLabelPlan), so it re-runs after every move.
   */
  private _renderLabels(): void {
    if (!this._layersReady) return
    const labelsOn = this.visible && this._seaStore.overlayStates.vesselLabels
    this.map.setLayoutProperty(
      LAYER_ICONS,
      'visibility',
      this.visible && !labelsOn ? 'visible' : 'none',
    )
    if (!labelsOn) {
      this._clearLabels()
      this._clearCounts()
      return
    }
    const vesselsByMmsi = new Map(this._seaStore.vessels.map((vessel) => [vessel.mmsi, vessel]))
    const bounds = this.map.getBounds()
    const inView: SeaVessel[] = []
    const positions = new Map<string, { x: number; y: number }>()
    const coords = new Map<string, [number, number]>()
    for (const feature of this._features) {
      const at = feature.geometry.coordinates as [number, number]
      if (!bounds.contains(at)) continue
      const vessel = vesselsByMmsi.get(feature.properties.mmsi)
      /* v8 ignore start -- defensive: features are rebuilt from the vessel
         list synchronously, so every feature's vessel is present */
      if (!vessel) continue
      /* v8 ignore stop */
      inView.push(vessel)
      positions.set(vessel.mmsi, this.map.project(at))
      coords.set(vessel.mmsi, at)
    }
    const groupAll = this._viewWidthNm() > SEA_GROUP_ALL_ABOVE_NM
    const plan = planVesselLabels(
      inView,
      positions,
      this._seaStore.labelFields,
      this._seaStore.selectedMmsi,
      { groupAll, cellPx: groupAll ? SEA_WIDE_VIEW_COUNT_CELL_PX : undefined },
    )

    // With labels on, every vessel is a pill or inside a count: no bare arrows.
    this.map.setLayoutProperty(LAYER_ICONS, 'visibility', 'none')

    const seen = new Set<string>()
    for (const vessel of plan.labelled) {
      seen.add(vessel.mmsi)
      this._syncLabel(vessel, coords.get(vessel.mmsi)!)
    }
    for (const [mmsi, marker] of this._labelMarkers) {
      if (!seen.has(mmsi)) {
        marker.remove()
        this._labelMarkers.delete(mmsi)
        this._labelSignatures.delete(mmsi)
      }
    }

    const seenCounts = new Set<string>()
    for (const count of plan.counts) {
      seenCounts.add(count.key)
      this._syncCount(count)
    }
    for (const [key, marker] of this._countMarkers) {
      if (!seenCounts.has(key)) {
        marker.remove()
        this._countMarkers.delete(key)
        this._countSizes.delete(key)
      }
    }
  }

  /** How wide the current view is, in nautical miles, along its centre line. */
  private _viewWidthNm(): number {
    const bounds = this.map.getBounds()
    const centreLat = (bounds.getNorth() + bounds.getSouth()) / 2
    const spanDeg = Math.min(360, bounds.getEast() - bounds.getWest())
    // One degree of longitude is 60 NM at the equator, shrinking with latitude.
    return spanDeg * 60 * Math.cos((centreLat * Math.PI) / 180)
  }

  /** Place (or move) the count standing for a huddle of vessels; a click
   *  zooms in on it so the vessels it stands for open into pills. */
  private _syncCount(count: VesselCount): void {
    const existing = this._countMarkers.get(count.key)
    if (existing && this._countSizes.get(count.key) === count.members.length) {
      existing.setLngLat(count.lngLat)
      return
    }
    existing?.remove()
    const element = buildCountMarker({
      count: count.members.length,
      ariaLabel: `${count.members.length} vessels here — zoom in to see them`,
      className: 'sea-count-marker',
      countClassName: 'sea-count-count',
      ringColor: SEA_COUNT_RING,
      fillColor: SEA_COUNT_FILL,
      textColor: SEA_COUNT_TEXT,
    })
    element.addEventListener('click', (domEvent: Event) => {
      domEvent.stopPropagation()
      this.map.easeTo({
        center: count.lngLat,
        zoom: this.map.getZoom() + SEA_COUNT_ZOOM_STEP,
        duration: 300,
      })
    })
    const marker = new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat(count.lngLat)
      .addTo(this.map)
    setMarkerAccessibleName(marker, `${count.members.length} vessels here — zoom in to see them`)
    this._countMarkers.set(count.key, marker)
    this._countSizes.set(count.key, count.members.length)
  }

  private _clearCounts(): void {
    for (const marker of this._countMarkers.values()) marker.remove()
    this._countMarkers.clear()
    this._countSizes.clear()
  }

  private _syncLabel(vessel: SeaVessel, coords: [number, number]): void {
    const signature = this._labelSignature(vessel)
    const existing = this._labelMarkers.get(vessel.mmsi)
    if (existing && this._labelSignatures.get(vessel.mmsi) === signature) {
      existing.setLngLat(coords)
      return
    }
    existing?.remove()
    const leftFacing = this._isLeftFacing(vessel)
    const marker = new maplibregl.Marker({
      element: this._buildLabelElement(vessel),
      anchor: leftFacing ? 'right' : 'left',
      // Pull the pill back by half the glyph well so the well sits centred on
      // the vessel's position — the same geometry as the Air map's labels.
      offset: leftFacing ? [13, 0] : [-13, 0],
    })
      .setLngLat(coords)
      .addTo(this.map)
    setMarkerAccessibleName(marker, `Vessel ${vessel.name}, ${vesselFamilyLabel(vessel.family)}`)
    this._labelMarkers.set(vessel.mmsi, marker)
    this._labelSignatures.set(vessel.mmsi, signature)
  }

  private _labelSignature(vessel: SeaVessel): string {
    const fields = this._seaStore.labelFields
    const shown = (enabled: boolean, value: unknown) => (enabled ? value : null)
    return JSON.stringify([
      this._isLeftFacing(vessel),
      vessel.family,
      vessel.heading ?? vessel.cog,
      fields,
      shown(fields.name, vessel.name),
      shown(fields.type, vessel.typeLabel),
      shown(fields.mmsi, vessel.mmsi),
      shown(fields.destination, vessel.destination),
      shown(fields.speed, vessel.sog),
      shown(fields.course, vessel.cog),
    ])
  }

  private _isLeftFacing(vessel: SeaVessel): boolean {
    return vesselFacesLeft(vessel)
  }

  /** The shared Sentinel pill, in the vessel's family colour, with whichever
   *  fields the operator has enabled. */
  private _buildLabelElement(vessel: SeaVessel): HTMLDivElement {
    const fields = this._seaStore.labelFields
    const color = vesselFamilyColor(vessel.family)
    const leftFacing = this._isLeftFacing(vessel)
    const bearing = vessel.heading ?? vessel.cog
    const pill = createLabelPill()
    pill.style.pointerEvents = 'auto'
    pill.style.cursor = 'pointer'
    pill.dataset.mmsi = vessel.mmsi
    pill.setAttribute('aria-label', `Vessel ${vessel.name}, ${vesselFamilyLabel(vessel.family)}`)
    const glyph =
      bearing === null
        ? createGlyphSvg(createFilledDotShape(color))
        : createGlyphSvg(createDirectionArrowShape(color), bearing)
    appendMirrored(
      pill,
      [
        createGlyphWell(glyph, VESSEL_BADGE_BACKGROUND),
        fields.name ? createNameSegment(vessel.name, leftFacing ? 'left' : 'right') : null,
        fields.type && vessel.typeLabel
          ? createAccentBadge(vessel.typeLabel, VESSEL_BADGE_BACKGROUND, color)
          : null,
        fields.mmsi ? createDimBadge('MMSI', vessel.mmsi, color) : null,
        fields.destination && vessel.destination
          ? createDimBadge('DEST', escapeHtml(vessel.destination), color)
          : null,
        fields.speed && vessel.sog !== null
          ? createDimBadge('SPD', `${vessel.sog.toFixed(1)}KN`, color)
          : null,
        fields.course && vessel.cog !== null
          ? createDimBadge('CRS', `${Math.round(vessel.cog)}°`, color)
          : null,
      ],
      leftFacing,
    )
    pill.addEventListener('click', (domEvent: Event) => {
      domEvent.stopPropagation()
      this.selectByMmsi(vessel.mmsi, { openPane: true })
    })
    return pill
  }

  private _clearLabels(): void {
    for (const marker of this._labelMarkers.values()) marker.remove()
    this._labelMarkers.clear()
    this._labelSignatures.clear()
  }

  /** A transient label for a hovered vessel that has none drawn (low zoom, or
   *  labels switched off), so a chevron can always be identified. */
  private _showHoverLabel(mmsi: string): void {
    if (this._hoverMmsi === mmsi) return
    this._hideHoverLabel()
    if (this._labelMarkers.has(mmsi)) return
    const vessel = this._seaStore.vessels.find((candidate) => candidate.mmsi === mmsi)
    const feature = this._features.find((candidate) => candidate.properties.mmsi === mmsi)
    if (!vessel || !feature) return
    const leftFacing = this._isLeftFacing(vessel)
    const element = this._buildLabelElement(vessel)
    element.style.pointerEvents = 'none'
    this._hoverMarker = new maplibregl.Marker({
      element,
      anchor: leftFacing ? 'right' : 'left',
      // Pull the pill back by half the glyph well so the well sits centred on
      // the vessel's position — the same geometry as the Air map's labels.
      offset: leftFacing ? [13, 0] : [-13, 0],
    })
      .setLngLat(feature.geometry.coordinates as [number, number])
      .addTo(this.map)
    this._hoverMmsi = mmsi
  }

  private _hideHoverLabel(): void {
    this._hoverMarker?.remove()
    this._hoverMarker = null
    this._hoverMmsi = null
  }

  // ── viewport ────────────────────────────────────────────────────────────────

  /** Hand the (padded) viewport to the store so the next poll asks for only it. */
  private _publishViewport(): void {
    const bounds = this.map.getBounds()
    const south = bounds.getSouth()
    const north = bounds.getNorth()
    const west = bounds.getWest()
    const east = bounds.getEast()
    const latPad = (north - south) * SEA_VIEWPORT_PAD_FRACTION
    const lonPad = (east - west) * SEA_VIEWPORT_PAD_FRACTION
    // A view wider than the world is simply worldwide.
    if (east - west + 2 * lonPad >= 360) {
      this._seaStore.setViewportBbox(null)
      return
    }
    const bbox: SeaBbox = [
      Math.max(-90, south - latPad),
      wrapLongitude(west - lonPad),
      Math.min(90, north + latPad),
      wrapLongitude(east + lonPad),
    ]
    this._seaStore.setViewportBbox(bbox)
  }

  // ── icons ───────────────────────────────────────────────────────────────────

  private _registerIcons(): void {
    const addOrUpdate = (name: string, data: ImageData) => {
      if (this.map.hasImage(name)) this.map.updateImage(name, data)
      else this.map.addImage(name, data, { pixelRatio: 2, sdf: false })
    }
    for (const family of VESSEL_FAMILIES) {
      const color = vesselFamilyColor(family)
      addOrUpdate(`sea-vessel-${family}`, createVesselArrow(color, 1))
      addOrUpdate(`sea-dot-${family}`, createVesselDot(color, 1))
    }
    addOrUpdate('sea-bracket', createBracket('#ffffff'))
  }

  // ── accessibility ───────────────────────────────────────────────────────────

  private _ensureA11yRegion(): void {
    const region = document.createElement('div')
    region.setAttribute('role', 'status')
    region.setAttribute('aria-label', 'Live vessels')
    // Visually hidden but available to assistive tech. The full per-vessel
    // detail is the FILTER pane's list — this line only states the count.
    region.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'
    this.map.getContainer().appendChild(region)
    this._a11yRegion = region
  }

  private _renderA11y(): void {
    if (!this._a11yRegion) return
    const count = this._features.length
    this._a11yRegion.textContent =
      count === 0
        ? 'No vessels plotted. Vessel details are listed in the Filter panel.'
        : `${count} vessel${count === 1 ? '' : 's'} plotted. Vessel details are listed in the Filter panel.`
  }
}

/** Whether a vessel is moving enough for dead reckoning to be meaningful. */
export function isMoving(vessel: SeaVessel): boolean {
  return vessel.sog !== null && vessel.sog >= SEA_MIN_MOVING_KNOTS && vessel.cog !== null
}

/**
 * Where a vessel should be drawn `now`, projected along its course over
 * ground from its last fix. Vessels with no useful speed/course, or a fix too
 * old to trust, stay put.
 */
export function deadReckon(vessel: SeaVessel, now: number): [number, number] {
  if (!isMoving(vessel)) return [vessel.lon, vessel.lat]
  const elapsedMs = Math.min(Math.max(0, now - vessel.lastPositionMs), MAX_DEAD_RECKON_MS)
  const distanceM = (vessel.sog! / 3600) * (elapsedMs / 1000) * METRES_PER_NM
  const bearingRad = (vessel.cog! * Math.PI) / 180
  const latRad = (vessel.lat * Math.PI) / 180
  const deltaLat = (distanceM * Math.cos(bearingRad)) / 111_320
  const deltaLon = (distanceM * Math.sin(bearingRad)) / (111_320 * Math.max(0.01, Math.cos(latRad)))
  return [wrapLongitude(vessel.lon + deltaLon), Math.max(-90, Math.min(90, vessel.lat + deltaLat))]
}

/** Normalise a longitude into [-180, 180]. */
export function wrapLongitude(lon: number): number {
  let wrapped = lon
  while (wrapped > 180) wrapped -= 360
  while (wrapped < -180) wrapped += 360
  return wrapped
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}
