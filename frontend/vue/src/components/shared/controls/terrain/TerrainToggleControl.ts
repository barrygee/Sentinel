import { SentinelControlBase } from '@/components/shared/map-kit/sentinel-control-base/SentinelControlBase'
import type { BasemapStore } from '@/stores/basemap'
import type { OfflineMapsStore } from '@/stores/offlineMaps'
import type { MapTheme } from '@/stores/theme'
import { currentMapTheme } from '@/utils/mapTheme'
import { getOfflineMapStatus } from '@/services/offlineMapsApi'
import { CONTOUR_MAX_ZOOM, CONTOUR_MIN_ZOOM, loadTerrainDem, type TerrainDem } from './terrainDem'

export const CONTOUR_SOURCE = 'terrain-contours'
export const CONTOUR_MINOR_LAYER = 'terrain-contour-minor'
export const CONTOUR_INDEX_LAYER = 'terrain-contour-index'
export const CONTOUR_LABEL_LAYER = 'terrain-contour-label'

const LAYERS = [CONTOUR_LABEL_LAYER, CONTOUR_INDEX_LAYER, CONTOUR_MINOR_LAYER]
const SOURCES = [CONTOUR_SOURCE]

// Where the overlay slots into the style: contour lines under the roads,
// elevation labels under the map's own text.
const CONTOUR_BEFORE = 'highway_path'
const LABEL_BEFORE = 'water_name'

interface ContourPalette {
  minorColor: string
  minorOpacity: number
  indexColor: string
  indexOpacity: number
  labelColor: string
  labelHaloColor: string
}

/**
 * Contour ink per basemap: pale blue on the dark map, and a survey brown on the
 * light (OpenStreetMap-coloured) map, where pale blue all but vanished.
 */
export const CONTOUR_PALETTES: Record<MapTheme, ContourPalette> = {
  dark: {
    minorColor: 'hsl(200, 45%, 72%)',
    minorOpacity: 0.45,
    indexColor: 'hsl(200, 55%, 80%)',
    indexOpacity: 0.8,
    labelColor: 'hsl(200, 55%, 84%)',
    labelHaloColor: 'hsl(232, 5%, 19%)',
  },
  light: {
    minorColor: 'hsl(25, 30%, 32%)',
    minorOpacity: 0.55,
    indexColor: 'hsl(25, 40%, 22%)',
    indexOpacity: 0.85,
    labelColor: 'hsl(25, 40%, 20%)',
    labelHaloColor: 'hsla(0, 0%, 100%, 0.85)',
  },
}

/**
 * Contour-line overlay (no hillshade — the shaded relief was dropped as visual
 * noise under the lines), its DEM served by the backend's offline-map
 * terrain resolver rather than a local archive opened in the browser (see
 * `terrainDem.ts`'s doc comment for the full resolver chain). Shared by the
 * Air, Sea and Land maps — like roads and place names, the visibility lives on
 * the cross-domain basemap store, so the choice follows the operator from one
 * map to the next. Sources and layers are only added while the overlay is on,
 * so a first-ever toggle costs one `/api/offline-map/status` round trip.
 *
 * Availability (M1): unavailable is a STATUS FACT (`status.terrain_available
 * === false`), never inferred from a fetch/configuration error — a transient
 * network failure leaves `available`/the persisted `terrain` layer preference
 * untouched and simply retries on the next `initLayers()` call (a toggle, a
 * style reload, or `refreshTiles()`), per the "don't punish a blip" rule.
 */
export class TerrainToggleControl extends SentinelControlBase {
  visible: boolean
  /** False only once the server has actually SAID no terrain source is configured. */
  available: boolean
  private _basemapStore: BasemapStore
  private _offlineMapsStore: OfflineMapsStore
  private _dem: TerrainDem | null = null
  /** `status.terrain_max_zoom`, fetched once and reused by every later toggle/style-reload. */
  private _maxZoom: number | null = null
  /** The tiers version the current `_dem` (if any) was built against. */
  private _tiersVersion: string | null = null

  constructor(basemapStore: BasemapStore, offlineMapsStore: OfflineMapsStore) {
    super()
    this._basemapStore = basemapStore
    this._offlineMapsStore = offlineMapsStore
    this.visible = basemapStore.layers.terrain
    this.available = basemapStore.terrainAvailable
  }

  get buttonLabel(): string {
    return 'T'
  }
  get buttonTitle(): string {
    return 'Toggle terrain contour lines'
  }

  protected onInit(): void {
    this.setButtonActive(this.visible)
    if (!this.available) this._disableButton()
    if (this.map.isStyleLoaded()) {
      this.initLayers()
    } else {
      this.map.once('style.load', () => this.initLayers())
    }
  }

  protected handleClick(): void {
    this.toggle()
  }

  toggle(): void {
    if (!this.available) return
    this.setVisible(!this.visible)
    this._basemapStore.setLayer('terrain', this.visible)
  }

  /**
   * Adopt a visibility decided elsewhere — Settings > Map Layers, or the same
   * layer being toggled on another domain's map. Unlike `toggle` this does not
   * write back to the store: the store is where the value came from.
   */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return
    this.visible = visible
    this.setButtonActive(visible)
    this.initLayers()
  }

  /** Bring the map in line with `visible`. Idempotent; re-run after a style swap. */
  initLayers(): void {
    if (!this.visible) {
      this._removeLayers()
      return
    }
    void this._ensureLayers()
  }

  /**
   * Called by `useOfflineTierRefresh` whenever `offlineMapsStore.tiersVersion`
   * changes (a region completed or was deleted) while this map is showing the
   * offline style. Two independent jobs:
   *  - if we are currently disabled, re-probe `/status` — a completed terrain
   *    region can turn `terrain_available` true without needing a reload
   *    (M1);
   *  - if we already have layers up, rebuild them against the new version so
   *    the contour tiles refetch instead of serving what MapLibre cached as
   *    "no tile here" while offline.
   */
  refreshTiles(): void {
    if (!this.available) {
      void this._recheckAvailability()
      return
    }
    const currentTiersVersion = this._offlineMapsStore.tiersVersion
    if (currentTiersVersion === this._tiersVersion) return
    this._tiersVersion = currentTiersVersion
    this._dem = null
    if (!this.visible || !this.map) return
    this._removeLayers()
    void this._ensureLayers()
  }

  private async _recheckAvailability(): Promise<void> {
    try {
      const status = await getOfflineMapStatus()
      if (!status.terrain_available) return
      this.available = true
      this._maxZoom = status.terrain_max_zoom
      this._enableButton()
      if (this.visible && this.map) void this._ensureLayers()
    } catch {
      // Still can't confirm — leave disabled and try again on the next
      // tiersVersion change or manual toggle (M3: a failed poll/probe must
      // not be treated as a final answer).
    }
  }

  private async _ensureLayers(): Promise<void> {
    if (this._maxZoom === null) {
      let status
      try {
        status = await getOfflineMapStatus()
      } catch (error) {
        // Transient — leave `available`/the persisted preference untouched
        // and retry on the next initLayers()/refreshTiles() call (M1/M3).
        console.warn('terrain: status fetch failed, will retry', error)
        return
      }
      if (!status.terrain_available) {
        this._markUnavailable('terrain: server reports no terrain source configured')
        return
      }
      this._maxZoom = status.terrain_max_zoom
      this._tiersVersion = this._offlineMapsStore.tiersVersion
    }
    try {
      this._dem ??= await loadTerrainDem(this._maxZoom, this._tiersVersion)
    } catch (error) {
      // Configuring the DemSource is local (no network of its own) and should
      // not normally fail, but treat it the same as a status-fetch hiccup
      // rather than a hard "unavailable" — see M1.
      console.warn('terrain: DEM configuration failed, will retry', error)
      this._dem = null
      return
    }
    // Toggled off (or the control was removed) while the status/DEM lookup was in flight.
    if (!this.visible || !this.map) return
    if (this.map.getSource(CONTOUR_SOURCE)) return
    try {
      this._addLayers(this._dem)
    } catch (error) {
      // A style swap raced the archive open; the style.load re-init will retry.
      console.warn('terrain: deferring overlay until the style is ready', error)
    }
  }

  private _markUnavailable(reason: string): void {
    console.warn(reason)
    this.available = false
    this.visible = false
    this._basemapStore.setLayer('terrain', false)
    this._basemapStore.setTerrainAvailable(false)
    this.setButtonActive(false)
    this._disableButton()
  }

  private _disableButton(): void {
    this.button.title = 'Terrain data not available on this server'
    this.button.setAttribute('aria-label', this.button.title)
    this.button.disabled = true
    this.button.style.cursor = 'not-allowed'
  }

  private _enableButton(): void {
    this.button.title = this.buttonTitle
    this.button.setAttribute('aria-label', this.buttonTitle)
    this.button.disabled = false
    this.button.style.cursor = ''
  }

  private _addLayers(dem: TerrainDem): void {
    const map = this.map
    // Read at add time: a palette change reloads the style, which drops these
    // layers, and the map's style.load re-run of initLayers re-adds them here.
    const palette = CONTOUR_PALETTES[currentMapTheme()]
    const before = (id: string) => (map.getLayer(id) ? id : undefined)

    map.addSource(CONTOUR_SOURCE, {
      type: 'vector',
      tiles: [dem.contourTilesUrl],
      minzoom: CONTOUR_MIN_ZOOM,
      maxzoom: CONTOUR_MAX_ZOOM,
    })
    map.addLayer(
      {
        id: CONTOUR_MINOR_LAYER,
        type: 'line',
        source: CONTOUR_SOURCE,
        'source-layer': 'contours',
        filter: ['!=', ['get', 'level'], 1],
        paint: {
          'line-color': palette.minorColor,
          'line-opacity': palette.minorOpacity,
          'line-width': 0.8,
        },
      },
      before(CONTOUR_BEFORE),
    )
    map.addLayer(
      {
        id: CONTOUR_INDEX_LAYER,
        type: 'line',
        source: CONTOUR_SOURCE,
        'source-layer': 'contours',
        filter: ['==', ['get', 'level'], 1],
        paint: {
          'line-color': palette.indexColor,
          'line-opacity': palette.indexOpacity,
          'line-width': 1.4,
        },
      },
      before(CONTOUR_BEFORE),
    )
    map.addLayer(
      {
        id: CONTOUR_LABEL_LAYER,
        type: 'symbol',
        source: CONTOUR_SOURCE,
        'source-layer': 'contours',
        filter: ['==', ['get', 'level'], 1],
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 320,
          'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ' m'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 9.5,
          'text-rotation-alignment': 'map',
          'text-letter-spacing': 0.06,
        },
        paint: {
          'text-color': palette.labelColor,
          'text-halo-color': palette.labelHaloColor,
          'text-halo-width': 1.2,
          'text-opacity': 1,
        },
      },
      before(LABEL_BEFORE),
    )
  }

  private _removeLayers(): void {
    const map = this.map
    for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id)
    for (const id of SOURCES) if (map.getSource(id)) map.removeSource(id)
  }
}
