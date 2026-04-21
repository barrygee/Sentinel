import { SentinelControlBase } from '../sentinel-control-base/SentinelControlBase'
import type { AirStore } from '../types'

export class NamesToggleControl extends SentinelControlBase {
    namesVisible: boolean
    private _airStore: AirStore

    constructor(airStore: AirStore) {
        super()
        this._airStore = airStore
        this.namesVisible = airStore.overlayStates.names
    }

    get buttonLabel(): string { return 'N' }
    get buttonTitle(): string { return 'Toggle city names' }

    protected onInit(): void {
        this.setButtonActive(this.namesVisible)
        if (this.map.isStyleLoaded()) {
            this._applyVisibility()
        } else {
            this.map.once('style.load', () => this._applyVisibility())
        }
    }

    protected handleClick(): void {
        this.namesVisible = !this.namesVisible
        this._applyVisibility()
        this._airStore.setOverlay('names', this.namesVisible)
    }

    _applyVisibility(): void {
        const visibility = this.namesVisible ? 'visible' : 'none'
        const layers = ['place_suburb', 'place_village', 'place_town', 'place_city', 'place_state', 'place_country', 'place_country_other', 'water_name']
        layers.forEach(id => { if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visibility) })
        this.setButtonActive(this.namesVisible)
    }
}
