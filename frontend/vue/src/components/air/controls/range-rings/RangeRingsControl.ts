import maplibregl from 'maplibre-gl'
import { SentinelControlBase } from '../sentinel-control-base/SentinelControlBase'
import type { AirStore, ControlDeps } from '../types'

const RING_DISTANCES_NM = [50, 100, 150, 200, 250] as const

function buildRingsGeoJSON(lng: number, lat: number): GeoJSON.FeatureCollection {
    const EARTH_RADIUS_NM = 3440.065
    const features: GeoJSON.Feature[] = []
    for (const distNm of RING_DISTANCES_NM) {
        const R = distNm / EARTH_RADIUS_NM
        const points: [number, number][] = []
        const steps = 64
        for (let i = 0; i <= steps; i++) {
            const bearing = (i / steps) * Math.PI * 2
            const lat1 = lat * Math.PI / 180
            const lon1 = lng * Math.PI / 180
            const lat2 = Math.asin(Math.sin(lat1) * Math.cos(R) + Math.cos(lat1) * Math.sin(R) * Math.cos(bearing))
            const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(R) * Math.cos(lat1), Math.cos(R) - Math.sin(lat1) * Math.sin(lat2))
            points.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI])
        }
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: points }, properties: { dist: distNm } })
    }
    return { type: 'FeatureCollection', features }
}

export class RangeRingsControl extends SentinelControlBase {
    ringsVisible: boolean
    private _airStore: AirStore
    private _getUserLocation: () => [number, number] | null
    // Range rings measure distance from the user's location, so they are only
    // meaningful when one exists. Visible iff ringsVisible && _locationAvailable.
    private _locationAvailable: boolean

    constructor(airStore: AirStore, getUserLocation: () => [number, number] | null) {
        super()
        this._airStore = airStore
        this._getUserLocation = getUserLocation
        this.ringsVisible = airStore.overlayStates.rangeRings
        this._locationAvailable = getUserLocation() !== null
    }

    /** Single source of truth for the layer's visibility. */
    private _applyVisibility(): void {
        if (!this.map || !this.map.getLayer('range-rings-lines')) return
        const vis = this.ringsVisible && this._locationAvailable ? 'visible' : 'none'
        this.map.setLayoutProperty('range-rings-lines', 'visibility', vis)
    }

    get buttonLabel(): string { return '◎' }
    get buttonTitle(): string { return 'Toggle range rings' }

    protected onInit(): void {
        this.setButtonActive(this.ringsVisible)
        if (this.map.isStyleLoaded()) this._initRings()
        else this.map.once('style.load', () => this._initRings())
    }

    protected handleClick(): void {
        this.ringsVisible = !this.ringsVisible
        this.setButtonActive(this.ringsVisible)
        this._airStore.setOverlay('rangeRings', this.ringsVisible)
        // Honour the toggle, but rings still only show if a location exists —
        // toggling on with no location must not draw map-centred rings.
        this._applyVisibility()
    }

    _initRings(): void {
        const loc = this._getUserLocation()
        this._locationAvailable = loc !== null
        // Range rings are distance-from-you; without a location there is no
        // meaningful centre. Build the source at the location when present,
        // else an empty collection (kept hidden by _applyVisibility anyway)
        // so a later fix can populate it via updateCenter.
        const lines = loc
            ? buildRingsGeoJSON(loc[0], loc[1])
            : { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection

        if (this.map.getLayer('range-rings-lines')) this.map.removeLayer('range-rings-lines')
        if (this.map.getSource('range-rings-lines')) this.map.removeSource('range-rings-lines')

        this.map.addSource('range-rings-lines', { type: 'geojson', data: lines })
        this.map.addLayer({
            id: 'range-rings-lines', type: 'line', source: 'range-rings-lines',
            layout: { visibility: 'none' },
            paint: { 'line-color': 'rgba(255,255,255,0.40)', 'line-width': 1, 'line-dasharray': [4, 4] },
        })
        this._applyVisibility()
    }

    updateCenter(lng: number, lat: number): void {
        if (!this.map || !this.map.getSource('range-rings-lines')) return
        const lines = buildRingsGeoJSON(lng, lat)
        ;(this.map.getSource('range-rings-lines') as maplibregl.GeoJSONSource).setData(lines)
    }

    /**
     * Tell the control whether a user location currently exists. Rings are
     * only ever shown when this is true AND the user's toggle is on, so
     * toggling rings on with no location does nothing until one is set.
     */
    setLocationAvailable(available: boolean): void {
        this._locationAvailable = available
        this._applyVisibility()
    }
}
