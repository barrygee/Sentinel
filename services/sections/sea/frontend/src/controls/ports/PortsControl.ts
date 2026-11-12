import { SentinelControlBase } from '@sentinel/map-kit/sentinel-control-base/SentinelControlBase'
import {
  CIVIL_SITE_COLOURS,
  SiteMarkers,
} from '@sentinel/map-kit/controls/site-markers/SiteMarkers'
import type { useSeaStore } from '../../stores/sea'
import { PORTS_DATA } from './portsData'

type SeaStore = ReturnType<typeof useSeaStore>
type LngLat = [number, number]

/** The port dots' layer, and the layer their labels open on. */
export const PORT_LAYER_ID = 'sea-ports'
export const PORT_OPEN_LABEL_LAYER_ID = 'sea-ports-open'

/** The lowest vessel layer, which the ports sit beneath. */
const VESSEL_TRACK_LAYER_ID = 'sea-vessel-track-line'
/** The vessels' hit layer: a vessel over a port takes the hover and the click. */
const VESSEL_HIT_LAYER_ID = 'sea-vessel-hit'

/**
 * Sea-map control that plots the known ports — the Sea counterpart of the Air
 * map's civil airports, drawn the same way: a black dot until it is hovered or
 * clicked, when its label opens over it with the UN/LOCODE in a block and then
 * the name (map-kit `SiteMarkers`, the layer Air's airports use).
 *
 * Clicking a port also opens its accordion — location and VHF working
 * channels — in the side-panel FILTER list (`SeaFilter` listens for
 * `sea-open-port`), again as the airports do it.
 *
 * Visibility lives on the Sea store's overlay flags so the rail button, the
 * default-layers config and this control can never disagree.
 */
export class PortsControl extends SentinelControlBase {
  private readonly _seaStore: SeaStore
  private _markers: SiteMarkers | null = null

  constructor(seaStore: SeaStore) {
    super()
    this._seaStore = seaStore
  }

  get buttonLabel(): string {
    // An anchor.
    return (
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="8" cy="3" r="1.6" /><path d="M8 4.6V14M4 8h8" />' +
      '<path d="M2.5 9.5c0 3 2.5 4.5 5.5 4.5s5.5-1.5 5.5-4.5" /></svg>'
    )
  }

  get buttonTitle(): string {
    return 'Toggle ports'
  }

  get visible(): boolean {
    return this._seaStore.overlayStates.ports
  }

  protected onInit(): void {
    this.initLayers()
  }

  protected handleClick(): void {
    this._seaStore.setOverlay('ports', !this.visible)
    this.applyVisibility()
  }

  /** Toggle from the side menu. */
  toggle(): void {
    this.handleClick()
  }

  onRemove(): void {
    this._markers?.setVisible(false)
    super.onRemove()
  }

  /**
   * Add the port layers. A style reload drops them, so SeaMap calls this again
   * after one; the markers object is built once and re-attaches its layers.
   */
  initLayers(): void {
    if (!this._markers) {
      const sites = PORTS_DATA.features.map((feature) => ({
        code: feature.properties.locode,
        name: feature.properties.name,
        coordinates: feature.geometry.coordinates as LngLat,
        onClick: () => {
          document.dispatchEvent(
            new CustomEvent('sea-open-port', { detail: { locode: feature.properties.locode } }),
          )
        },
      }))
      this._markers = new SiteMarkers(this.map, sites, {
        dotLayerId: PORT_LAYER_ID,
        labelLayerId: PORT_OPEN_LABEL_LAYER_ID,
        colours: CIVIL_SITE_COLOURS,
        beneathLayerId: VESSEL_TRACK_LAYER_ID,
        priorityLayerId: VESSEL_HIT_LAYER_ID,
      })
    }
    this.applyVisibility()
    void this._markers.attach()
  }

  /** Push the store flag onto the layers and the button. */
  applyVisibility(): void {
    this._markers?.setVisible(this.visible)
    this.setButtonActive(this.visible)
  }
}
