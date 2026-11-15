import { SentinelControlBase } from '@sentinel/map-kit/sentinel-control-base/SentinelControlBase'
import type { AirStore } from '../types'
import { AWACS_ORBITS } from './awacsOrbits'

export class AwacToggleControl extends SentinelControlBase {
  visible: boolean
  private _airStore: AirStore

  constructor(airStore: AirStore) {
    super()
    this._airStore = airStore
    this.visible = airStore.overlayStates.awacs
  }

  get buttonLabel(): string {
    return '○'
  }
  get buttonTitle(): string {
    return 'Toggle UK AWACS orbits'
  }

  protected onInit(): void {
    this.setButtonActive(this.visible)
    if (this.map.isStyleLoaded()) {
      this.initLayers()
    } else {
      this.map.once('style.load', () => this.initLayers())
    }
  }

  protected handleClick(): void {
    this.toggle()
  }

  initLayers(): void {
    if (this.map.getSource('awacs-orbits')) return
    this.map.addSource('awacs-orbits', { type: 'geojson', data: AWACS_ORBITS as GeoJSON.GeoJSON })

    const layerVisibility = this.visible ? 'visible' : 'none'

    this.map.addLayer({
      id: 'awacs-fill',
      type: 'fill',
      source: 'awacs-orbits',
      layout: { visibility: layerVisibility },
      // Same fill darkness as the satellite footprint, matching the AARA zones.
      paint: { 'fill-color': 'rgba(0, 0, 0, 0.22)', 'fill-outline-color': 'rgba(0,0,0,0)' },
    })

    this.map.addLayer({
      id: 'awacs-outline',
      type: 'line',
      source: 'awacs-orbits',
      layout: { visibility: layerVisibility },
      paint: { 'line-color': 'rgba(0, 0, 0, 0.75)', 'line-width': 1 },
    })
  }

  toggle(): void {
    this.visible = !this.visible
    const layerVisibility = this.visible ? 'visible' : 'none'
    ;['awacs-fill', 'awacs-outline'].forEach((id) => {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', layerVisibility)
    })
    this.setButtonActive(this.visible)
    this._airStore.setOverlay('awacs', this.visible)
  }
}
