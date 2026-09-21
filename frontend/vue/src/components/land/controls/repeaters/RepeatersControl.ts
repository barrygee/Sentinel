import * as maplibregl from 'maplibre-gl'
import { watch, type WatchStopHandle } from 'vue'
import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import { APRS_BADGE_BACKGROUND, APRS_COUNT_FILL, REPEATER_COUNT_RING } from '@/constants/aprs'
import {
  formatMhz,
  formatRepeaterAccess,
  formatRepeaterModes,
  repeaterBandColor,
  repeaterSearchKey,
  stationBands,
  stationOffAir,
} from '@/constants/repeaters'
import {
  buildCountMarker,
  groupByGridCell,
  COUNT_MARKER_SIZE_PX,
} from '@/components/shared/map-cluster/mapCluster'
import {
  appendMirrored,
  createAccentBadge,
  createDimBadge,
  createGlyphWell,
  createLabelPill,
  createNameSegment,
  MAP_LABEL_SIZE_PX,
} from '@/components/shared/map-label/mapLabelParts'
import { setMarkerAccessibleName } from '@/components/shared/map-label/mapMarkerAria'
import { escapeHtml } from '@/utils/escapeHtml'
import type { useLandStore } from '@/stores/land'
import type { useRepeatersStore } from '@/stores/repeaters'
import type { RepeaterChannel, RepeaterStation } from '@/types/repeaters'

type LandStore = ReturnType<typeof useLandStore>
type RepeatersStore = ReturnType<typeof useRepeatersStore>
type LngLat = [number, number]

/** Zoom below which repeaters are only ever drawn as per-area counts — the
 *  whole-UK view holds ~1,300 sites and has no room for a callsign each. */
const LABEL_REVEAL_ZOOM = 9

/** Grid cell (screen px) for grouping when the view is too far out for
 *  labels — one and a half count markers, so neighbouring counts sit clear. */
const COUNT_GROUP_RADIUS_PX = COUNT_MARKER_SIZE_PX * 1.5

/** Grid cell once labels show. A label is the glyph well, a callsign and a
 *  badge per band — ~150 px for a dual-band site — so sites sharing a cell
 *  this size would overprint each other's text. */
const LABEL_GROUP_RADIUS_PX = 150

/** Extra cell width per optional data badge the operator has switched on
 *  (Settings › LAND › Repeater Label Fields) — a "MODE FM · FUSION" or "OUT
 *  145.7250" badge is roughly this wide, so the grouping keeps pace with the
 *  label instead of letting longer labels overprint. */
const LABEL_GROUP_RADIUS_PER_FIELD_PX = 90

/** How far a count marker's click zooms in. */
const CLUSTER_CLICK_ZOOM_STEP = 2

/** Zoom from which every site is drawn as its own label, whatever shares its
 *  grouping cell. Grid grouping is purely screen-space, and 500-odd directory
 *  entries share a mast (or a locator-rounded position) with another, so a
 *  count over those would never split however far the map zoomed. From here
 *  labels that would overprint are stacked vertically instead — a cell is
 *  ~3 km at this zoom, so a stack is one hilltop, not a whole town. */
const STACK_REVEAL_ZOOM = 12

/** Vertical pitch between stacked labels — the pill plus a hairline gap. */
const STACK_PITCH_PX = MAP_LABEL_SIZE_PX + 4

/** Deepest the map goes when revealing one station from the pane — the
 *  stacking zoom, since past it every site already stands alone. */
const REVEAL_MAX_ZOOM = STACK_REVEAL_ZOOM

/** Margin (CSS px) around the visible map when deciding which sites get
 *  markers, so one just off-screen doesn't pop as the map is nudged. */
const VIEWPORT_PADDING_PX = 120

/**
 * Document event a marker click fires so the sidebar opens on the FILTER
 * tab (App.vue) with the station's row expanded (LandFilter).
 */
export const REPEATER_OPEN_EVENT = 'land-open-repeater'

/** Document event the FILTER pane fires (callsign click) to fly the map to a station. */
export const REPEATER_LOCATE_EVENT = 'land-locate-repeater'

/** The tower glyph in the label's leading well, and on the rail button. */
const REPEATER_GLYPH_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#ffffff" stroke-width="1.4" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block">' +
  '<path d="M8 6.5v8M5.2 14.5l2.8-8 2.8 8M6.2 11.6h3.6" />' +
  '<circle cx="8" cy="4.6" r="1.4" /><path d="M4.6 2.6a4.6 4.6 0 0 1 6.8 0" />' +
  '<path d="M5.9 3.9a2.8 2.8 0 0 1 4.2 0" /></svg>'

/**
 * Land-map control that plots the UK amateur-radio repeater directory
 * (ukrepeater.net / RSGB ETCC).
 *
 * Each site is the shared Sentinel label pill the Air and Sea maps draw —
 * the tower glyph in the leading well, the callsign, then one colour-coded
 * badge per band — grouped into APRS-style count markers below
 * `LABEL_REVEAL_ZOOM`, drawn individually above it, and from
 * `STACK_REVEAL_ZOOM` stacked wherever sites share a mast, all scoped to the
 * current viewport. Clicking a label opens the site's row in the FILTER
 * pane, which holds every channel's details; nothing opens on the map.
 *
 * Visibility lives on the Land store (`repeatersLayerVisible`) and the
 * band/mode filters on the repeaters store, both persisted to the app
 * config, so Settings, the pane's chips and this control agree.
 */
export class RepeatersControl extends SentinelControlBase {
  private readonly _landStore: LandStore
  private readonly _repeatersStore: RepeatersStore
  private _markers = new Map<string, maplibregl.Marker>()
  private _markerSignatures = new Map<string, string>()
  private _clusterMarkers = new Map<string, maplibregl.Marker>()
  private _clusterCounts = new Map<string, number>()
  private _onMapMoveEnd: (() => void) | null = null
  private _stopWatch: WatchStopHandle | null = null
  private _a11yRegion: HTMLDivElement | null = null

  /** Bound once so add/removeEventListener share a reference. */
  private readonly _onLocate = (event: Event): void => {
    const { callsign } = (event as CustomEvent<{ callsign: string }>).detail
    this._revealStation(callsign)
  }

  /**
   * Fly to a station at a zoom where it stands alone. A site can still sit
   * inside a count marker at the label zoom, so the zoom is worked out from
   * its nearest plotted neighbour: screen distances scale with 2^zoom, so the
   * level at which that neighbour clears the grouping cell (with a cell of
   * margin, since grid cells group by boundary rather than by distance) is
   * computed directly — capped at `REVEAL_MAX_ZOOM`, where sites sharing a
   * mast are stacked rather than counted, so it never needs to go deeper.
   */
  private _revealStation(callsign: string): void {
    const station = this._repeatersStore.stationByCallsign(callsign)
    if (!station) return
    const center: LngLat = [station.longitude, station.latitude]
    const currentZoom = this.map.getZoom()
    const origin = this.map.project(center)
    let nearestPx = Number.POSITIVE_INFINITY
    for (const other of this._repeatersStore.filteredStations) {
      if (other.callsign === callsign) continue
      const point = this.map.project([other.longitude, other.latitude])
      nearestPx = Math.min(nearestPx, Math.hypot(point.x - origin.x, point.y - origin.y))
    }
    const clearancePx = this._labelGroupRadiusPx() * 2
    const zoomToClear =
      nearestPx > 0 && Number.isFinite(nearestPx)
        ? currentZoom + Math.log2(clearancePx / nearestPx)
        : REVEAL_MAX_ZOOM
    const zoom = Math.min(
      REVEAL_MAX_ZOOM,
      Math.max(currentZoom, LABEL_REVEAL_ZOOM, Math.ceil(zoomToClear)),
    )
    this.map.flyTo({ center, zoom, duration: 600 })
  }

  constructor(landStore: LandStore, repeatersStore: RepeatersStore) {
    super()
    this._landStore = landStore
    this._repeatersStore = repeatersStore
  }

  get buttonLabel(): string {
    return REPEATER_GLYPH_SVG.replace('stroke="#ffffff"', 'stroke="currentColor"')
  }

  get buttonTitle(): string {
    return 'Toggle amateur radio repeaters'
  }

  private get _visible(): boolean {
    return this._landStore.repeatersLayerVisible
  }

  protected onInit(): void {
    this._ensureA11yRegion()
    this._onMapMoveEnd = () => this._render()
    this.map.on('moveend', this._onMapMoveEnd)
    document.addEventListener(REPEATER_LOCATE_EVENT, this._onLocate)
    // Re-render on a new station set, a visibility flip, or the operator
    // switching label fields in Settings — the store is watched directly.
    this._stopWatch = watch(
      () =>
        [
          this._repeatersStore.filteredStations,
          this._visible,
          this._repeatersStore.labelFields,
        ] as const,
      () => {
        // The store flag is the truth: whoever flips it (the sidebar tabs,
        // Settings, a config upload), the button, the directory load and the
        // markers follow here. `load()` is a one-shot, so re-running is free.
        this.setButtonActive(this._visible)
        if (this._visible) void this._repeatersStore.load()
        this._render()
      },
      { immediate: true, deep: true },
    )
  }

  protected handleClick(): void {
    this.setVisible(!this._visible)
  }

  /** Set visibility to a specific value (e.g. from `land.defaultLayers`), a
   *  no-op if already in that state. */
  setVisible(visible: boolean): void {
    if (this._visible === visible) return
    this._landStore.setRepeatersLayerVisible(visible)
  }

  onRemove(): void {
    /* v8 ignore start -- defensive: onInit always assigns the handler, and
       MapLibre never removes a control it did not add */
    if (this._onMapMoveEnd) this.map.off('moveend', this._onMapMoveEnd)
    /* v8 ignore stop */
    this._onMapMoveEnd = null
    this._stopWatch?.()
    this._stopWatch = null
    document.removeEventListener(REPEATER_LOCATE_EVENT, this._onLocate)
    this._clearMarkers()
    this._a11yRegion?.remove()
    this._a11yRegion = null
    super.onRemove()
  }

  // ── data ─────────────────────────────────────────────────────────────────

  /** Filtered stations within the viewport (plus a screen-space margin). */
  private _visibleStations(): RepeaterStation[] {
    const bounds = this.map.getBounds()
    const sw = this.map.project(bounds.getSouthWest())
    const ne = this.map.project(bounds.getNorthEast())
    const minX = Math.min(sw.x, ne.x) - VIEWPORT_PADDING_PX
    const maxX = Math.max(sw.x, ne.x) + VIEWPORT_PADDING_PX
    const minY = Math.min(sw.y, ne.y) - VIEWPORT_PADDING_PX
    const maxY = Math.max(sw.y, ne.y) + VIEWPORT_PADDING_PX
    return this._repeatersStore.filteredStations.filter((station) => {
      const point = this.map.project([station.longitude, station.latitude])
      return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
    })
  }

  // ── rendering ────────────────────────────────────────────────────────────

  private _render(): void {
    const bounds = this.map.getBounds()
    this._repeatersStore.setViewportBounds({
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    })
    const stations = this._visible ? this._visibleStations() : []
    this._syncMarkers(stations)
    this._renderA11yTable(stations)
  }

  private _syncMarkers(stations: RepeaterStation[]): void {
    const seen = new Set<string>()
    const seenClusters = new Set<string>()

    const zoom = this.map.getZoom()
    const labelsShowing = zoom >= LABEL_REVEAL_ZOOM
    const stacksShowing = zoom >= STACK_REVEAL_ZOOM
    const groupRadiusPx = labelsShowing ? this._labelGroupRadiusPx() : COUNT_GROUP_RADIUS_PX
    for (const cluster of this._groupStations(stations, groupRadiusPx)) {
      const loneStation = cluster.stations.length === 1 ? cluster.stations[0] : undefined
      if (labelsShowing && loneStation) {
        seen.add(loneStation.callsign)
        this._syncStationMarker(loneStation, 0)
      } else if (stacksShowing) {
        for (const { station, offsetY } of this._stackStations(cluster.stations)) {
          seen.add(station.callsign)
          this._syncStationMarker(station, offsetY)
        }
      } else {
        seenClusters.add(cluster.key)
        this._syncClusterMarker(cluster)
      }
    }

    for (const [callsign, marker] of this._markers) {
      if (!seen.has(callsign)) {
        marker.remove()
        this._markers.delete(callsign)
        this._markerSignatures.delete(callsign)
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

  /** The label grouping cell, widened for every optional badge switched on. */
  private _labelGroupRadiusPx(): number {
    const { symbol, callsign, band, ...optional } = this._repeatersStore.labelFields
    void symbol
    void callsign
    void band
    const extraBadges = Object.values(optional).filter(Boolean).length
    return LABEL_GROUP_RADIUS_PX + extraBadges * LABEL_GROUP_RADIUS_PER_FIELD_PX
  }

  private _groupStations(stations: RepeaterStation[], groupRadiusPx: number): StationCluster[] {
    const positions = new Map<string, { x: number; y: number }>()
    for (const station of stations) {
      positions.set(station.callsign, this.map.project([station.longitude, station.latitude]))
    }
    // Grid cells, not single-linkage: repeaters ring every city, and a chain
    // of them would otherwise collapse a whole region into one count.
    return groupByGridCell(
      stations.map((station) => ({ key: station.callsign, station })),
      positions,
      groupRadiusPx,
    ).map((cluster) => ({
      key: cluster.key,
      stations: cluster.members.map((member) => member.station),
      coordinates:
        cluster.members.length === 1
          ? ([
              cluster.members[0]!.station.longitude,
              cluster.members[0]!.station.latitude,
            ] as LngLat)
          : (this.map.unproject([cluster.position.x, cluster.position.y]).toArray() as LngLat),
    }))
  }

  /**
   * Lay a grouping cell's sites out as a stack: each label sits at its own
   * position unless that would overprint the one above, in which case it is
   * pushed down to the next free pitch. Sites sharing a mast therefore read
   * as a column of pills from the mast downward, while two that are merely in
   * the same cell keep their own spots. Ordered by screen row, then callsign,
   * so the column is stable between renders.
   */
  private _stackStations(
    stations: RepeaterStation[],
  ): { station: RepeaterStation; offsetY: number }[] {
    const rows = stations
      .map((station) => ({
        station,
        screenY: this.map.project([station.longitude, station.latitude]).y,
      }))
      .sort(
        (left, right) =>
          left.screenY - right.screenY ||
          left.station.callsign.localeCompare(right.station.callsign),
      )
    let nextFreeY = Number.NEGATIVE_INFINITY
    return rows.map(({ station, screenY }) => {
      const placedY = Math.max(screenY, nextFreeY)
      nextFreeY = placedY + STACK_PITCH_PX
      return { station, offsetY: placedY - screenY }
    })
  }

  private _syncStationMarker(station: RepeaterStation, offsetY: number): void {
    // Pull the pill back by half the glyph well so the well sits centred on
    // the site's position — the same geometry as the Air and Sea labels — and
    // down by its place in a stack, if any.
    const offset: [number, number] = [-MAP_LABEL_SIZE_PX / 2, offsetY]
    // The field choice is part of the identity: a change must rebuild the pill.
    const signature = JSON.stringify([station, this._repeatersStore.labelFields])
    const existing = this._markers.get(station.callsign)
    if (existing && this._markerSignatures.get(station.callsign) === signature) {
      existing.setLngLat([station.longitude, station.latitude]).setOffset(offset)
      return
    }
    existing?.remove()
    const marker = new maplibregl.Marker({
      element: this._buildLabelElement(station),
      anchor: 'left',
      offset,
    })
      .setLngLat([station.longitude, station.latitude])
      .addTo(this.map)
    setMarkerAccessibleName(marker, stationAccessibleName(station))
    this._markers.set(station.callsign, marker)
    this._markerSignatures.set(station.callsign, signature)
  }

  private _syncClusterMarker(cluster: StationCluster): void {
    const existing = this._clusterMarkers.get(cluster.key)
    if (existing && this._clusterCounts.get(cluster.key) === cluster.stations.length) {
      existing.setLngLat(cluster.coordinates)
      return
    }
    existing?.remove()
    const ariaLabel = `${cluster.stations.length} repeaters here — zoom in to see them`
    const element = buildCountMarker({
      count: cluster.stations.length,
      ariaLabel,
      className: 'repeater-cluster-marker',
      countClassName: 'repeater-cluster-count',
      ringColor: REPEATER_COUNT_RING,
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
    setMarkerAccessibleName(marker, ariaLabel)
    this._clusterMarkers.set(cluster.key, marker)
    this._clusterCounts.set(cluster.key, cluster.stations.length)
  }

  /**
   * The shared Sentinel pill for one site, carrying whichever fields the
   * operator has enabled (Settings › LAND › Repeater Label Fields): tower
   * glyph in the well, the callsign, a badge per band in that band's colour,
   * then the dimmed data badges. Per-channel fields (output, input, tone,
   * channel, modes) list every channel's value, so a dual-band site reads
   * "OUT 145.6875 · 433.1750". A site whose every channel is off air is dimmed
   * rather than recoloured, so the band colours keep their one meaning.
   */
  private _buildLabelElement(station: RepeaterStation): HTMLDivElement {
    const fields = this._repeatersStore.labelFields
    const pill = createLabelPill()
    pill.style.pointerEvents = 'auto'
    if (stationOffAir(station)) pill.style.opacity = '0.4'
    pill.setAttribute('aria-label', stationAccessibleName(station))
    const perChannel = (format: (channel: RepeaterChannel) => string | null): string | null => {
      const values = station.channels
        .map(format)
        .filter((value): value is string => value !== null && value !== '')
      return values.length === 0 ? null : [...new Set(values)].join(' · ')
    }
    const dim = (label: string, value: string | null): HTMLSpanElement | null =>
      value === null ? null : createDimBadge(label, escapeHtml(value), '#ffffff')
    appendMirrored(
      pill,
      [
        fields.symbol ? createGlyphWell(REPEATER_GLYPH_SVG, APRS_BADGE_BACKGROUND) : null,
        fields.callsign
          ? createNameSegment(station.callsign, fields.symbol ? 'right' : 'standalone')
          : null,
        ...(fields.band
          ? stationBands(station).map((band) =>
              createAccentBadge(band, APRS_BADGE_BACKGROUND, repeaterBandColor(band)),
            )
          : []),
        fields.location ? dim('QTH', station.location) : null,
        fields.modes
          ? dim(
              'MODE',
              perChannel((channel) =>
                channel.modes.length === 0 ? null : formatRepeaterModes(channel.modes),
              ),
            )
          : null,
        fields.output
          ? dim(
              'OUT',
              perChannel((channel) => channel.txMhz.toFixed(4)),
            )
          : null,
        fields.input
          ? dim(
              'IN',
              perChannel((channel) => channel.rxMhz.toFixed(4)),
            )
          : null,
        fields.tone
          ? dim(
              'TONE',
              perChannel((channel) =>
                channel.ctcssHz === null && channel.dmrColourCode === null
                  ? null
                  : formatRepeaterAccess(channel),
              ),
            )
          : null,
        fields.channel
          ? dim(
              'CH',
              perChannel((channel) => channel.channel),
            )
          : null,
        fields.locator ? dim('LOC', station.locator) : null,
        fields.keeper ? dim('KPR', station.keeper) : null,
        fields.status
          ? dim(
              'STAT',
              perChannel((channel) => channel.status),
            )
          : null,
      ],
      false,
    )
    pill.addEventListener('click', (domEvent: Event) => {
      domEvent.stopPropagation()
      this.openInPane(station.callsign)
    })
    return pill
  }

  /** Expand the station's row in the FILTER pane and bring the pane forward. */
  openInPane(callsign: string): void {
    this._landStore.setSearchExpandedCallsign(repeaterSearchKey(callsign))
    document.dispatchEvent(new CustomEvent(REPEATER_OPEN_EVENT, { detail: { callsign } }))
  }

  // ── accessibility ───────────────────────────────────────────────────────

  private _ensureA11yRegion(): void {
    /* v8 ignore start -- defensive idempotency guard: onInit calls this exactly once */
    if (this._a11yRegion) return
    /* v8 ignore stop */
    const region = document.createElement('div')
    region.setAttribute('role', 'region')
    region.setAttribute('aria-label', 'Amateur radio repeaters')
    region.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'
    this.map.getContainer().appendChild(region)
    this._a11yRegion = region
  }

  private _renderA11yTable(stations: RepeaterStation[]): void {
    /* v8 ignore start -- defensive: _render only runs after onInit created the region */
    if (!this._a11yRegion) return
    /* v8 ignore stop */
    if (stations.length === 0) {
      this._a11yRegion.innerHTML = '<p>No amateur radio repeaters in view.</p>'
      return
    }
    const rows = stations
      .flatMap((station) =>
        station.channels.map((channel) => {
          const cells = [
            escapeHtml(station.callsign),
            escapeHtml(station.location ?? ''),
            escapeHtml(channel.band),
            formatMhz(channel.txMhz),
            formatMhz(channel.rxMhz),
            escapeHtml(formatRepeaterModes(channel.modes)),
            escapeHtml(formatRepeaterAccess(channel)),
            escapeHtml(channel.status),
          ]
          return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`
        }),
      )
      .join('')
    const headers = [
      'Callsign',
      'Location',
      'Band',
      'Output',
      'Input',
      'Modes',
      'CTCSS / CC',
      'Status',
    ]
    this._a11yRegion.innerHTML =
      '<table><caption>Amateur radio repeaters in view</caption><thead><tr>' +
      headers.map((header) => `<th scope="col">${header}</th>`).join('') +
      `</tr></thead><tbody>${rows}</tbody></table>`
  }

  private _clearMarkers(): void {
    for (const marker of this._markers.values()) marker.remove()
    this._markers.clear()
    this._markerSignatures.clear()
    for (const marker of this._clusterMarkers.values()) marker.remove()
    this._clusterMarkers.clear()
    this._clusterCounts.clear()
  }
}

/** A group of stations too close together on screen to draw apart. */
interface StationCluster {
  key: string
  stations: RepeaterStation[]
  coordinates: LngLat
}

/** Accessible name for a station's label: callsign, place, bands, off-air flag. */
export function stationAccessibleName(station: RepeaterStation): string {
  const parts = [
    `Repeater ${station.callsign}`,
    station.location ?? null,
    stationBands(station).join(', '),
    stationOffAir(station) ? 'not operational' : null,
  ]
  return parts.filter((part): part is string => Boolean(part)).join(', ')
}
