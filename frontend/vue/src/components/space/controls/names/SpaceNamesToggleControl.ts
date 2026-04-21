import { SentinelControlBase } from '../../../air/controls/sentinel-control-base/SentinelControlBase'
import type { useSpaceStore } from '@/stores/space'

type SpaceStore = ReturnType<typeof useSpaceStore>

export class SpaceNamesToggleControl extends SentinelControlBase {
    namesVisible: boolean
    private _spaceStore: SpaceStore
    private _isGlobeActive: () => boolean

    constructor(spaceStore: SpaceStore, isGlobeActive: () => boolean) {
        super()
        this._spaceStore   = spaceStore
        this._isGlobeActive = isGlobeActive
        this.namesVisible = spaceStore.overlayStates.names
    }

    get buttonLabel(): string { return 'N' }
    get buttonTitle(): string { return 'Toggle city names' }

    protected onInit(): void {
        this.setButtonActive(this.namesVisible)
        if (this.map.isStyleLoaded()) this.applyNamesVisibility()
        else this.map.once('style.load', () => this.applyNamesVisibility())
    }

    protected handleClick(): void { this.toggleNames() }

    applyNamesVisibility(): void {
        const globeMode = this._isGlobeActive()
        const countryLayers = ['place_country', 'place_country_other']
        const detailLayers  = ['place_suburb', 'place_village', 'place_town', 'place_city', 'place_state', 'water_name']
        const countryVis = this.namesVisible ? 'visible' : 'none'
        const detailVis  = (this.namesVisible && !globeMode) ? 'visible' : 'none'
        countryLayers.forEach(id => { if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', countryVis) })
        detailLayers.forEach(id  => { if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', detailVis) })
        this.setButtonActive(this.namesVisible)
    }

    toggleNames(): void {
        this.namesVisible = !this.namesVisible
        this.applyNamesVisibility()
        this._spaceStore.setOverlay('names', this.namesVisible)
    }
}
