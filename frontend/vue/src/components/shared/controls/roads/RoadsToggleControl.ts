import { SentinelControlBase } from '@/components/shared/map-kit/sentinel-control-base/SentinelControlBase'
import type { BasemapStore } from '@/stores/basemap'
import { applyBasemapLayerVisibility } from '@/utils/basemapLayers'

/**
 * Toggles the base map's road lines and labels. Shared by every domain map —
 * the visibility it reads and writes lives on the cross-domain basemap store,
 * so the choice follows the operator from one map to the next.
 */
export class RoadsToggleControl extends SentinelControlBase {
  roadsVisible: boolean
  private _basemapStore: BasemapStore

  constructor(basemapStore: BasemapStore) {
    super()
    this._basemapStore = basemapStore
    this.roadsVisible = basemapStore.layers.roads
  }

  get buttonLabel(): string {
    return 'R'
  }
  get buttonTitle(): string {
    return 'Toggle road lines and names'
  }

  protected onInit(): void {
    if (this.map.isStyleLoaded()) {
      this.applyVisibility()
    } else {
      this.map.once('style.load', () => this.applyVisibility())
    }
  }

  protected handleClick(): void {
    this.roadsVisible = !this.roadsVisible
    this.applyVisibility()
    this._basemapStore.setLayer('roads', this.roadsVisible)
  }

  /**
   * Adopt a visibility decided elsewhere — Settings › Map › Map Layers, or the same
   * layer being toggled on another domain's map. Unlike `handleClick` this does
   * not write back to the store: the store is where the value came from.
   */
  setVisible(visible: boolean): void {
    if (this.roadsVisible === visible) return
    this.roadsVisible = visible
    this.applyVisibility()
  }

  /** Push the current visibility onto the style. Public because a map that
   *  swaps its style (online↔offline) must re-apply it after the reload. */
  applyVisibility(): void {
    applyBasemapLayerVisibility(this.map, 'roads', this.roadsVisible)
    this.setButtonActive(this.roadsVisible)
  }
}
