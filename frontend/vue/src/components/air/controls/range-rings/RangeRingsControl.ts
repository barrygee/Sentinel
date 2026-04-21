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

    constructor(airStore: AirStore, getUserLocation: () => [number, number] | null) {
        super()
        this._airStore = airStore
        this._getUserLocation = getUserLocation
        this.ringsVisible = airStore.overlayStates.rangeRings
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
        if (this.map.getLayer('range-rings-lines')) this.map.setLayoutProperty('range-rings-lines', 'visibility', this.ringsVisible ? 'visible' : 'none')
        this.setButtonActive(this.ringsVisible)
        this._airStore.setOverlay('rangeRings', this.ringsVisible)
    }

    _initRings(): void {
        const loc = this._getUserLocation()
        const center: [number, number] = loc ?? [this.map.getCenter().lng, this.map.getCenter().lat]
        const lines = buildRingsGeoJSON(center[0], center[1])

        if (this.map.getLayer('range-rings-lines')) this.map.removeLayer('range-rings-lines')
        if (this.map.getSource('range-rings-lines')) this.map.removeSource('range-rings-lines')

        this.map.addSource('range-rings-lines', { type: 'geojson', data: lines })
        this.map.addLayer({
            id: 'range-rings-lines', type: 'line', source: 'range-rings-lines',
            layout: { visibility: this.ringsVisible ? 'visible' : 'none' },
            paint: { 'line-color': 'rgba(255,255,255,0.40)', 'line-width': 1, 'line-dasharray': [4, 4] },
        })
    }

    updateCenter(lng: number, lat: number): void {
        if (!this.map || !this.map.getSource('range-rings-lines')) return
        const lines = buildRingsGeoJSON(lng, lat)
        ;(this.map.getSource('range-rings-lines') as maplibregl.GeoJSONSource).setData(lines)
    }
}
