import maplibregl from 'maplibre-gl'
import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import type { useSeaStore } from '@/stores/sea'
import { PORTS_DATA, type PortProperties } from './portsData'

type SeaStore = ReturnType<typeof useSeaStore>
type LngLat = [number, number]

/**
 * Sea-map control that plots the known ports — the Sea counterpart of the Air
 * map's airports. Each port is a MapLibre marker carrying its UN/LOCODE and
 * name, styled like the airport labels so the two maps read the same way.
 *
 * Clicking a port opens its accordion — location and VHF working channels —
 * in the side-panel FILTER list (`SeaFilter` listens for `sea-open-port`);
 * nothing is shown on the map itself, again as the airports do it.
 *
 * Visibility lives on the Sea store's overlay flags so the rail button, the
 * default-layers config and this control can never disagree.
 */
export class PortsControl extends SentinelControlBase {
  private readonly _seaStore: SeaStore
  private _markers: maplibregl.Marker[] | null = null

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
    this._markers?.forEach((marker) => marker.remove())
    this._markers = null
    super.onRemove()
  }

  /**
   * Build the markers once. Markers are DOM, not style layers, so they
   * survive a style reload — calling this again after one is a no-op.
   */
  initLayers(): void {
    if (!this._markers) {
      this._markers = PORTS_DATA.features.map((feature) =>
        this._buildMarker(feature.properties, feature.geometry.coordinates as LngLat),
      )
    }
    this.applyVisibility()
  }

  private _buildMarker(portProperties: PortProperties, coordinates: LngLat): maplibregl.Marker {
    const element = document.createElement('div')
    element.style.cssText =
      'padding:6px 16px 6px 0;cursor:pointer;pointer-events:auto;user-select:none'

    const label = document.createElement('div')
    label.style.cssText =
      "color:#fff;font-family:'Barlow Condensed','Barlow',monospace;font-size:10px;font-weight:700;letter-spacing:.08em;line-height:1.5;white-space:nowrap;pointer-events:none"
    const locode = document.createElement('span')
    locode.className = 'port-locode'
    locode.textContent = portProperties.locode
    const name = document.createElement('span')
    name.className = 'port-name'
    name.style.cssText = 'opacity:0.7;font-weight:400'
    name.textContent = portProperties.name.toUpperCase()
    label.append(locode, document.createElement('br'), name)
    element.appendChild(label)

    element.addEventListener('click', (event: Event) => {
      event.stopPropagation()
      document.dispatchEvent(
        new CustomEvent('sea-open-port', { detail: { locode: portProperties.locode } }),
      )
    })

    return new maplibregl.Marker({ element, anchor: 'top-left', offset: [8, -6] }).setLngLat(
      coordinates,
    )
  }

  /** Push the store flag onto the markers and the button. */
  applyVisibility(): void {
    if (this._markers) {
      for (const marker of this._markers) {
        if (this.visible) marker.addTo(this.map)
        else marker.remove()
      }
    }
    this.setButtonActive(this.visible)
  }
}
