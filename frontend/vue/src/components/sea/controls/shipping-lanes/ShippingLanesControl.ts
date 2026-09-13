import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import type { useSeaStore } from '@/stores/sea'

type SeaStore = ReturnType<typeof useSeaStore>

/**
 * OpenSeaMap's seamark overlay — the OSM-derived nautical chart layer that
 * carries traffic separation schemes (the charted shipping lanes), fairways,
 * anchorages and aids to navigation. Raster tiles, online only: there is no
 * offline copy, so the layer simply has nothing to draw off-grid.
 */
export const SHIPPING_LANES_TILE_URL = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'
export const SHIPPING_LANES_ATTRIBUTION =
  '© <a href="https://www.openseamap.org">OpenSeaMap</a> contributors'
const SOURCE_ID = 'sea-shipping-lanes'
const LAYER_ID = 'sea-shipping-lanes'

/**
 * Sea-map control that overlays charted shipping lanes (OpenSeaMap seamarks).
 *
 * Visibility lives on the Sea store's overlay flags, so the rail button, the
 * default-layers config and this control can never disagree. The raster layer
 * is added beneath the vessel layers so lanes never sit on top of a ship.
 */
export class ShippingLanesControl extends SentinelControlBase {
  private readonly _seaStore: SeaStore

  constructor(seaStore: SeaStore) {
    super()
    this._seaStore = seaStore
  }

  get buttonLabel(): string {
    // Two dashed lanes with opposing arrows — a traffic separation scheme.
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
  }

  protected handleClick(): void {
    this._seaStore.setOverlay('shippingLanes', !this.visible)
    this.applyVisibility()
  }

  /** Toggle from the side menu. */
  toggle(): void {
    this.handleClick()
  }

  /**
   * (Re)create the raster source and layer. Safe to call after a style reload.
   * The layer goes in beneath the first vessel layer when one exists, so the
   * chart never covers a ship or its label.
   */
  initLayers(): void {
    if (!this.map.getSource(SOURCE_ID)) {
      this.map.addSource(SOURCE_ID, {
        type: 'raster',
        tiles: [SHIPPING_LANES_TILE_URL],
        tileSize: 256,
        minzoom: 6,
        maxzoom: 18,
        attribution: SHIPPING_LANES_ATTRIBUTION,
      })
    }
    if (!this.map.getLayer(LAYER_ID)) {
      const beneath = this.map.getLayer('sea-vessel-track-line')
        ? 'sea-vessel-track-line'
        : undefined
      this.map.addLayer(
        {
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          minzoom: 6,
          paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0 },
        },
        beneath,
      )
    }
    this.applyVisibility()
  }

  /** Push the store's flag onto the layer and the button. */
  applyVisibility(): void {
    if (this.map.getLayer(LAYER_ID)) {
      this.map.setLayoutProperty(LAYER_ID, 'visibility', this.visible ? 'visible' : 'none')
    }
    this.setButtonActive(this.visible)
  }
}
