import maplibregl from 'maplibre-gl'
import { SentinelControlBase } from '../../../air/controls/sentinel-control-base/SentinelControlBase'
import type { useSpaceStore } from '@/stores/space'

type SpaceStore = ReturnType<typeof useSpaceStore>

export class DaynightControl extends SentinelControlBase {
    dnVisible: boolean
    private _spaceStore: SpaceStore
    private _pollInterval: ReturnType<typeof setInterval> | null = null
    private _geojson: GeoJSON.Feature | null = null

    constructor(spaceStore: SpaceStore) {
        super()
        this._spaceStore = spaceStore
        this.dnVisible = spaceStore.overlayStates.daynight
    }

    get buttonLabel(): string {
        return `<svg width="13" height="14" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 2C10 2 5 6.5 5 12s5 10 10 10c-6 0-11-4.5-11-10S9 2 15 2z" fill="#ffffff"/>
        </svg>`
    }
    get buttonTitle(): string { return 'Toggle day/night shading' }

    protected onInit(): void {
        this.setButtonActive(this.dnVisible)
        if (this.map.isStyleLoaded()) this.initLayers()
        else this.map.once('style.load', () => this.initLayers())
        this._pollInterval = setInterval(() => this._fetch(), 60000)
        this._fetch()
    }

    protected handleClick(): void { this.toggleDaynight() }

    onRemove(): void {
        if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null }
        super.onRemove()
    }

    initLayers(): void {
        ;['daynight-fill'].forEach(id => { if (this.map.getLayer(id)) this.map.removeLayer(id) })
        try { if (this.map.getSource('daynight-source')) this.map.removeSource('daynight-source') } catch {}

        const emptyGeoJSON: GeoJSON.Feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: {} }
        this.map.addSource('daynight-source', { type: 'geojson', data: this._geojson ?? emptyGeoJSON })
        this.map.addLayer({
            id: 'daynight-fill', type: 'fill', source: 'daynight-source',
            layout: { visibility: this.dnVisible ? 'visible' : 'none' },
            paint: { 'fill-color': 'rgba(10, 10, 60, 0.18)', 'fill-outline-color': 'rgba(10, 10, 60, 0.18)', 'fill-opacity': 1 },
        })
    }

    async _fetch(): Promise<void> {
        try {
            const resp = await fetch('/api/space/daynight')
            if (!resp.ok) return
            const data = await resp.json() as GeoJSON.Feature
            this._geojson = data
            const src = this.map?.getSource('daynight-source') as maplibregl.GeoJSONSource | undefined
            if (src) src.setData(data)
        } catch {}
    }

    toggleDaynight(): void {
        this.dnVisible = !this.dnVisible
        try { this.map.setLayoutProperty('daynight-fill', 'visibility', this.dnVisible ? 'visible' : 'none') } catch {}
        this.setButtonActive(this.dnVisible)
        this._spaceStore.setOverlay('daynight', this.dnVisible)
    }
}
