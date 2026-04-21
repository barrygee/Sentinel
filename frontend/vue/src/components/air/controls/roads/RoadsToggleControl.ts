import { SentinelControlBase } from '../sentinel-control-base/SentinelControlBase'
import type { AirStore } from '../types'

const ROAD_LAYERS = [
    'highway_path', 'highway_minor', 'highway_major_casing',
    'highway_major_inner', 'highway_major_subtle',
    'highway_motorway_casing', 'highway_motorway_inner',
    'highway_motorway_subtle', 'highway_name_motorway',
    'highway_name_other', 'highway_ref', 'tunnel_motorway_casing',
    'tunnel_motorway_inner', 'road_area_pier', 'road_pier',
]

export class RoadsToggleControl extends SentinelControlBase {
    roadsVisible: boolean
    private _airStore: AirStore

    constructor(airStore: AirStore) {
        super()
        this._airStore = airStore
        this.roadsVisible = airStore.overlayStates.roads
    }

    get buttonLabel(): string { return 'R' }
    get buttonTitle(): string { return 'Toggle road lines and names' }

    protected onInit(): void {
        if (this.map.isStyleLoaded()) {
            this._applyVisibility()
        } else {
            this.map.once('style.load', () => this._applyVisibility())
        }
    }

    protected handleClick(): void {
        this.roadsVisible = !this.roadsVisible
        this._applyVisibility()
        this._airStore.setOverlay('roads', this.roadsVisible)
    }

    _applyVisibility(): void {
        const visibility = this.roadsVisible ? 'visible' : 'none'
        ROAD_LAYERS.forEach(id => { if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visibility) })
        this.setButtonActive(this.roadsVisible)
    }
}
