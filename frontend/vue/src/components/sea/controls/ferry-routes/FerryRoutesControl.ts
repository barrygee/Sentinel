import type maplibregl from 'maplibre-gl'
import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import type { useSeaStore } from '@/stores/sea'

type SeaStore = ReturnType<typeof useSeaStore>

/** The base-map vector source both styles share. */
const BASEMAP_SOURCE_ID = 'openmaptiles'
const LAYER_LINE = 'sea-ferry-routes-line'
const LAYER_LABEL = 'sea-ferry-routes-label'

/** Where the ferry routes live in the tiles — the two styles use different
 *  tile schemas, so the layers are described per schema. */
interface FerryTileSchema {
  /** Source layer carrying the route geometry. */
  lineSourceLayer: string
  /** Source layer carrying the route names (OpenMapTiles keeps them apart). */
  labelSourceLayer: string
  filter: maplibregl.FilterSpecification
}

/** Offline: Protomaps tiles (`roads` layer, `kind: ferry`). */
const PROTOMAPS_SCHEMA: FerryTileSchema = {
  lineSourceLayer: 'roads',
  labelSourceLayer: 'roads',
  filter: ['==', ['get', 'kind'], 'ferry'],
}

/** Online: OpenMapTiles-schema tiles (`transportation`, `class: ferry`). */
const OPENMAPTILES_SCHEMA: FerryTileSchema = {
  lineSourceLayer: 'transportation',
  labelSourceLayer: 'transportation_name',
  filter: ['==', ['get', 'class'], 'ferry'],
}

/** A base-style road layer present in both styles, used to tell them apart. */
const SCHEMA_PROBE_LAYER = 'highway_minor'

/** Chart blue-grey, kept well away from the vessel palette so a route never
 *  reads as a ship's track. */
const ROUTE_COLOR = 'hsl(200, 40%, 60%)'

/**
 * Sea-map control that draws the charted ferry routes — Heysham–Belfast,
 * Belfast–Cairnryan and the like — as dashed lines with their names.
 *
 * The geometry is already in the base map — the offline Protomaps tiles
 * carry ferry routes in `roads` as `kind: 'ferry'`, the online OpenMapTiles
 * tiles in `transportation` as `class: 'ferry'` — so nothing is fetched.
 * The base styles leave them out of the road layers; this control gives them
 * their own dashed layers, independent of the roads toggle.
 *
 * Visibility lives on the Sea store's overlay flags, so the rail button, the
 * default-layers config and this control can never disagree. The layers sit
 * beneath the vessel layers so a route never covers a ship or its label.
 */
export class FerryRoutesControl extends SentinelControlBase {
  private readonly _seaStore: SeaStore

  constructor(seaStore: SeaStore) {
    super()
    this._seaStore = seaStore
  }

  get buttonLabel(): string {
    // A dashed route between two ports.
    return (
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="3" cy="12" r="1.6" /><circle cx="13" cy="4" r="1.6" />' +
      '<path d="M4.5 10.5 11.5 5.5" stroke-dasharray="2 2" /></svg>'
    )
  }

  get buttonTitle(): string {
    return 'Toggle ferry routes'
  }

  get visible(): boolean {
    return this._seaStore.overlayStates.ferryRoutes
  }

  protected onInit(): void {
    this.initLayers()
  }

  protected handleClick(): void {
    this._seaStore.setOverlay('ferryRoutes', !this.visible)
    this.applyVisibility()
  }

  /** Toggle from the side menu. */
  toggle(): void {
    this.handleClick()
  }

  /**
   * (Re)create the layers over the base-map source. Safe to call after a
   * style reload — which is also when the schema may have changed, so it is
   * read fresh each time. The layers go in beneath the first vessel layer
   * when one exists, otherwise on top.
   */
  initLayers(): void {
    const schema = this._tileSchema()
    const beneath = this.map.getLayer('sea-vessel-track-line') ? 'sea-vessel-track-line' : undefined
    if (!this.map.getLayer(LAYER_LINE)) {
      this.map.addLayer(
        {
          id: LAYER_LINE,
          type: 'line',
          source: BASEMAP_SOURCE_ID,
          'source-layer': schema.lineSourceLayer,
          filter: schema.filter,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ROUTE_COLOR,
            'line-opacity': 0.85,
            'line-dasharray': [1, 3],
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 2],
          },
        },
        beneath,
      )
    }
    if (!this.map.getLayer(LAYER_LABEL)) {
      this.map.addLayer(
        {
          id: LAYER_LABEL,
          type: 'symbol',
          source: BASEMAP_SOURCE_ID,
          'source-layer': schema.labelSourceLayer,
          filter: schema.filter,
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 350,
            'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
            'text-font': ['Noto Sans Regular'],
            'text-max-angle': 30,
            'text-pitch-alignment': 'viewport',
            'text-rotation-alignment': 'map',
            'text-size': 10,
            'text-transform': 'uppercase',
          },
          paint: {
            'text-color': ROUTE_COLOR,
            'text-halo-color': 'hsl(232, 9%, 23%)',
            'text-halo-width': 2,
          },
        },
        beneath,
      )
    }
    this.applyVisibility()
  }

  /** Which tile schema the current style is drawn from, read off a road
   *  layer both styles define. Falls back to the offline schema so a bare
   *  style still gets valid layers. */
  private _tileSchema(): FerryTileSchema {
    const probe = this.map.getLayer(SCHEMA_PROBE_LAYER) as { sourceLayer?: string } | undefined
    return probe?.sourceLayer === OPENMAPTILES_SCHEMA.lineSourceLayer
      ? OPENMAPTILES_SCHEMA
      : PROTOMAPS_SCHEMA
  }

  /** Push the store flag onto the layers and the button. */
  applyVisibility(): void {
    const visibility = this.visible ? 'visible' : 'none'
    for (const id of [LAYER_LINE, LAYER_LABEL]) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visibility)
    }
    this.setButtonActive(this.visible)
  }
}
