import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import type { BasemapStore } from '@/stores/basemap'
import type { MapTheme } from '@/stores/theme'
import { currentMapTheme } from '@/utils/mapTheme'
import {
  CONTOUR_MAX_ZOOM,
  CONTOUR_MIN_ZOOM,
  TERRAIN_PMTILES_PATH,
  TERRAIN_PMTILES_URL,
  TERRAIN_TILE_SIZE,
  loadTerrainDem,
  type TerrainDem,
} from './terrainDem'

export const HILLSHADE_SOURCE = 'terrain-dem'
export const CONTOUR_SOURCE = 'terrain-contours'
export const HILLSHADE_LAYER = 'terrain-hillshade'
export const CONTOUR_MINOR_LAYER = 'terrain-contour-minor'
export const CONTOUR_INDEX_LAYER = 'terrain-contour-index'
export const CONTOUR_LABEL_LAYER = 'terrain-contour-label'

const LAYERS = [CONTOUR_LABEL_LAYER, CONTOUR_INDEX_LAYER, CONTOUR_MINOR_LAYER, HILLSHADE_LAYER]
const SOURCES = [CONTOUR_SOURCE, HILLSHADE_SOURCE]

// Where the overlay slots into the Fiord style: relief under the waterways,
// contour lines under the roads, elevation labels under the map's own text.
const HILLSHADE_BEFORE = 'waterway'
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
 * Contour ink per basemap. The lines sit on top of the hillshade, which darkens
 * slopes, so each palette has to hold against both the flat ground and the
 * shaded side of a hill: pale blue on the dark map, and a dark survey brown on
 * the light and colour maps (where the old pale blue all but vanished).
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
  colour: {
    minorColor: 'hsl(25, 45%, 24%)',
    minorOpacity: 0.6,
    indexColor: 'hsl(25, 55%, 16%)',
    indexOpacity: 0.9,
    labelColor: 'hsl(25, 55%, 14%)',
    labelHaloColor: 'hsla(45, 45%, 90%, 0.85)',
  },
}

/**
 * Hillshade + contour-line overlay driven entirely by a local DEM archive.
 * Shared by the Air, Sea and Land maps — like roads and place names, the
 * visibility lives on the cross-domain basemap store, so the choice follows
 * the operator from one map to the next. Sources and layers are only added
 * while the overlay is on, so a missing archive costs nothing until the user
 * asks for terrain — at which point the layer is marked unavailable on the
 * store (the rails disable their buttons) and the title says what to install.
 */
export class TerrainToggleControl extends SentinelControlBase {
  visible: boolean
  /** False once the DEM archive turned out to be missing. */
  available: boolean
  private _basemapStore: BasemapStore
  private _dem: TerrainDem | null = null

  constructor(basemapStore: BasemapStore) {
    super()
    this._basemapStore = basemapStore
    this.visible = basemapStore.layers.terrain
    this.available = basemapStore.terrainAvailable
  }

  get buttonLabel(): string {
    return 'T'
  }
  get buttonTitle(): string {
    return 'Toggle terrain relief and contour lines'
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

  private async _ensureLayers(): Promise<void> {
    try {
      this._dem ??= await loadTerrainDem()
    } catch (err) {
      this._markUnavailable(err)
      return
    }
    // Toggled off (or the control was removed) while the archive was opening.
    if (!this.visible || !this.map) return
    if (this.map.getSource(HILLSHADE_SOURCE)) return
    try {
      this._addLayers(this._dem)
    } catch (err) {
      // A style swap raced the archive open; the style.load re-init will retry.
      console.warn('terrain: deferring overlay until the style is ready', err)
    }
  }

  private _markUnavailable(err: unknown): void {
    console.warn(`terrain: DEM archive not available at ${TERRAIN_PMTILES_PATH}`, err)
    this.available = false
    this.visible = false
    this._basemapStore.setLayer('terrain', false)
    this._basemapStore.setTerrainAvailable(false)
    this.setButtonActive(false)
    this._disableButton()
  }

  private _disableButton(): void {
    this.button.title = `Terrain tiles not installed — add ${TERRAIN_PMTILES_PATH} (see README)`
    this.button.setAttribute('aria-label', this.button.title)
    this.button.disabled = true
    this.button.style.cursor = 'not-allowed'
  }

  private _addLayers(dem: TerrainDem): void {
    const map = this.map
    // Read at add time: a palette change reloads the style, which drops these
    // layers, and the map's style.load re-run of initLayers re-adds them here.
    const palette = CONTOUR_PALETTES[currentMapTheme()]
    const before = (id: string) => (map.getLayer(id) ? id : undefined)

    map.addSource(HILLSHADE_SOURCE, {
      type: 'raster-dem',
      url: TERRAIN_PMTILES_URL,
      encoding: 'terrarium',
      tileSize: TERRAIN_TILE_SIZE,
    })
    map.addLayer(
      {
        id: HILLSHADE_LAYER,
        type: 'hillshade',
        source: HILLSHADE_SOURCE,
        paint: {
          // Tuned to the Fiord palette: lifted blue-grey light, near-background
          // shadow, no accent — relief without washing the dark map out.
          'hillshade-exaggeration': 0.38,
          'hillshade-highlight-color': 'hsl(222, 28%, 52%)',
          'hillshade-shadow-color': 'hsl(228, 30%, 14%)',
          'hillshade-accent-color': 'hsla(0, 0%, 0%, 0)',
          'hillshade-illumination-direction': 335,
        },
      },
      before(HILLSHADE_BEFORE),
    )

    map.addSource(CONTOUR_SOURCE, {
      type: 'vector',
      tiles: [dem.contourTilesUrl],
      bounds: dem.bounds,
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
