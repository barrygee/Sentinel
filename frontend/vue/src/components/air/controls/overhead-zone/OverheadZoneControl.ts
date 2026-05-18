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
    private _radiusNm: number

    constructor(visible: boolean, initialCenter: [number, number] | null = null, radiusNm: number = OVERHEAD_ZONE_RADIUS_NM) {
        this._visible = visible
        this._center = initialCenter
        this._radiusNm = radiusNm
    }

    setRadiusNm(radiusNm: number): void {
        if (!Number.isFinite(radiusNm) || radiusNm <= 0) return
        this._radiusNm = radiusNm
        const m = this._map
        if (!m || !this._center) return
        const src = m.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
        if (!src) { this._init(); return }
        src.setData(buildCirclePolygon(this._center[0], this._center[1], this._radiusNm) as GeoJSON.Feature)
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
        this._applyVisibility()
    }

    /**
     * Single source of truth for layer visibility. The zone marks the area
     * overhead the user's location, so it only shows when the toggle is on
     * AND a location exists — toggling overhead alerts on with no location
     * must not draw a map-centred zone.
     */
    private _applyVisibility(): void {
        const m = this._map
        if (!m) return
        const vis = this._visible && this._center !== null ? 'visible' : 'none'
        if (m.getLayer(FILL_ID)) m.setLayoutProperty(FILL_ID, 'visibility', vis)
        if (m.getLayer(LINE_ID)) m.setLayoutProperty(LINE_ID, 'visibility', vis)
    }

    reinit(): void {
        if (this._map) this._init()
    }

    updateCenter(lng: number, lat: number): void {
        const hadCenter = this._center !== null
        this._center = [lng, lat]
        const m = this._map
        if (!m) return
        const src = m.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
        if (!src) { this._init(); return }
        src.setData(buildCirclePolygon(lng, lat, this._radiusNm) as GeoJSON.Feature)
        // Gaining a centre (null → set) changes the visibility gate.
        if (!hadCenter) this._applyVisibility()
    }

    private _init(): void {
        const m = this._map
        if (!m) return
        // No map-centre fallback: the zone is centred on the user's location.
        // With none, build an empty source (kept hidden by _applyVisibility)
        // so a later updateCenter() can populate it.
        const data: GeoJSON.Feature | GeoJSON.FeatureCollection = this._center
            ? buildCirclePolygon(this._center[0], this._center[1], this._radiusNm) as GeoJSON.Feature
            : { type: 'FeatureCollection', features: [] }

        if (m.getLayer(LINE_ID))   m.removeLayer(LINE_ID)
        if (m.getLayer(FILL_ID))   m.removeLayer(FILL_ID)
        if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID)

        m.addSource(SOURCE_ID, { type: 'geojson', data })

        m.addLayer({
            id: FILL_ID,
            type: 'fill',
            source: SOURCE_ID,
            layout: { visibility: 'none' },
            paint: { 'fill-color': 'rgba(0, 0, 0, 0.12)' },
        })
        m.addLayer({
            id: LINE_ID,
            type: 'line',
            source: SOURCE_ID,
            layout: { visibility: 'none' },
            paint: { 'line-color': 'rgba(0, 0, 0, 0.35)', 'line-width': 0.6 },
        })
        this._applyVisibility()
    }
}
