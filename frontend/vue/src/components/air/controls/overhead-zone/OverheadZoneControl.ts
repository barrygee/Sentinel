import maplibregl from 'maplibre-gl'
import { buildCirclePolygon } from '../../../../utils/distanceUtils'

const SOURCE_ID = 'overhead-zone'
const FILL_ID   = 'overhead-zone-fill'
const LINE_ID   = 'overhead-zone-line'

export const OVERHEAD_ZONE_RADIUS_NM = 10

export class OverheadZoneControl {
    private _map: maplibregl.Map | null = null
    private _visible: boolean
    private _center: [number, number] | null

    constructor(visible: boolean, initialCenter: [number, number] | null = null) {
        this._visible = visible
        this._center = initialCenter
    }

    onAdd(map: maplibregl.Map): void {
        this._map = map
        if (map.isStyleLoaded()) this._init()
        else map.once('style.load', () => this._init())
    }

    onRemove(): void {
        const m = this._map
        if (!m) return
        if (m.getLayer(LINE_ID))   m.removeLayer(LINE_ID)
        if (m.getLayer(FILL_ID))   m.removeLayer(FILL_ID)
        if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID)
        this._map = null
    }

    setVisible(visible: boolean): void {
        this._visible = visible
        const m = this._map
        if (!m) return
        const vis = visible ? 'visible' : 'none'
        if (m.getLayer(FILL_ID)) m.setLayoutProperty(FILL_ID, 'visibility', vis)
        if (m.getLayer(LINE_ID)) m.setLayoutProperty(LINE_ID, 'visibility', vis)
    }

    reinit(): void {
        if (this._map) this._init()
    }

    updateCenter(lng: number, lat: number): void {
        this._center = [lng, lat]
        const m = this._map
        if (!m) return
        const src = m.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
        if (!src) { this._init(); return }
        src.setData(buildCirclePolygon(lng, lat, OVERHEAD_ZONE_RADIUS_NM) as GeoJSON.Feature)
    }

    private _init(): void {
        const m = this._map
        if (!m) return
        if (!this._center) {
            const c = m.getCenter()
            this._center = [c.lng, c.lat]
        }
        const data = buildCirclePolygon(this._center[0], this._center[1], OVERHEAD_ZONE_RADIUS_NM)

        if (m.getLayer(LINE_ID))   m.removeLayer(LINE_ID)
        if (m.getLayer(FILL_ID))   m.removeLayer(FILL_ID)
        if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID)

        m.addSource(SOURCE_ID, { type: 'geojson', data: data as GeoJSON.Feature })

        const vis = this._visible ? 'visible' : 'none'
        m.addLayer({
            id: FILL_ID,
            type: 'fill',
            source: SOURCE_ID,
            layout: { visibility: vis },
            paint: { 'fill-color': 'rgba(200, 255, 0, 0.06)' },
        })
        m.addLayer({
            id: LINE_ID,
            type: 'line',
            source: SOURCE_ID,
            layout: { visibility: vis },
            paint: { 'line-color': 'rgba(200, 255, 0, 0.25)', 'line-width': 1 },
        })
    }
}
