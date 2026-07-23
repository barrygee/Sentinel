import maplibregl from 'maplibre-gl'
import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import { buildRingsGeoJSON } from '@/utils/rangeRings'

const LS_KEY = 'sentinel_land_rangeRings'

/**
 * Range-rings control for the Land map: concentric distance-from-you rings
 * (50–250 NM) centred on the user's location. Mirrors the air control but is
 * self-contained — its toggle persists to localStorage rather than a store, and
 * it reuses the shared ring geometry. Rings only show when a location exists and
 * the toggle is on.
 */
export class LandRangeRingsControl extends SentinelControlBase {
  private _visible: boolean
  private _locationAvailable: boolean
  private readonly _getUserLocation: () => [number, number] | null

  constructor(getUserLocation: () => [number, number] | null) {
    super()
    this._getUserLocation = getUserLocation
    this._visible = LandRangeRingsControl._readPersisted()
    this._locationAvailable = getUserLocation() !== null
  }

  /** Current toggle state (rings shown when this is on and a location exists). */
  get visible(): boolean {
    return this._visible
  }

  private static _readPersisted(): boolean {
    try {
      return localStorage.getItem(LS_KEY) === '1'
    } catch {
      return false
    }
  }

  get buttonLabel(): string {
    return '◎'
  }
  get buttonTitle(): string {
    return 'Toggle range rings'
  }

  protected onInit(): void {
    this.setButtonActive(this._visible)
    if (this.map.isStyleLoaded()) this._initRings()
    else this.map.once('style.load', () => this._initRings())
  }

  protected handleClick(): void {
    this._visible = !this._visible
    this.setButtonActive(this._visible)
    try {
      localStorage.setItem(LS_KEY, this._visible ? '1' : '0')
    } catch {
      /* private-mode storage failure — keep the in-memory toggle */
    }
    this._applyVisibility()
  }

  private _initRings(): void {
    const loc = this._getUserLocation()
    this._locationAvailable = loc !== null
    const lines = loc
      ? buildRingsGeoJSON(loc[0], loc[1])
      : ({ type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection)

    if (this.map.getLayer('land-range-rings')) this.map.removeLayer('land-range-rings')
    if (this.map.getSource('land-range-rings')) this.map.removeSource('land-range-rings')

    this.map.addSource('land-range-rings', { type: 'geojson', data: lines })
    this.map.addLayer({
      id: 'land-range-rings',
      type: 'line',
      source: 'land-range-rings',
      layout: { visibility: 'none' },
      paint: { 'line-color': 'rgba(255,255,255,0.40)', 'line-width': 1, 'line-dasharray': [4, 4] },
    })
    this._applyVisibility()
  }

  /** Single source of truth for the layer's visibility. */
  private _applyVisibility(): void {
    if (!this.map || !this.map.getLayer('land-range-rings')) return
    const vis = this._visible && this._locationAvailable ? 'visible' : 'none'
    this.map.setLayoutProperty('land-range-rings', 'visibility', vis)
  }

  /** Re-centre the rings on a new user-location fix. */
  updateCenter(lng: number, lat: number): void {
    if (!this.map || !this.map.getSource('land-range-rings')) return
    ;(this.map.getSource('land-range-rings') as maplibregl.GeoJSONSource).setData(
      buildRingsGeoJSON(lng, lat),
    )
  }

  /** Whether a user location currently exists (rings hide without one). */
  setLocationAvailable(available: boolean): void {
    this._locationAvailable = available
    this._applyVisibility()
  }
}
