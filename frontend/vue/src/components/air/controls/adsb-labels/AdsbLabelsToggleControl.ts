import { SentinelControlBase } from '../sentinel-control-base/SentinelControlBase'
import type { AirStore } from '../types'
import type { AdsbLiveControl } from '../adsb/AdsbLiveControl'

export class AdsbLabelsToggleControl extends SentinelControlBase {
    labelsVisible: boolean
    private _airStore: AirStore
    private _adsbControl: AdsbLiveControl | null

    constructor(airStore: AirStore, adsbControl: AdsbLiveControl | null) {
        super()
        this._airStore = airStore
        this._adsbControl = adsbControl
        this.labelsVisible = airStore.overlayStates.adsbLabels ?? true
    }

    get buttonLabel(): string { return 'L' }
    get buttonTitle(): string { return 'Toggle aircraft labels' }

    protected onInit(): void {
        const adsbIsOn = this._adsbControl ? this._adsbControl.visible : true
        this.button.style.opacity       = (adsbIsOn && this.labelsVisible) ? '1' : '0.3'
        this.button.style.color         = (adsbIsOn && this.labelsVisible) ? '#c8ff00' : '#ffffff'
        this.button.style.pointerEvents = adsbIsOn ? 'auto' : 'none'
    }

    protected handleClick(): void { this.toggle() }

    toggle(): void {
        this.labelsVisible = !this.labelsVisible
        this.button.style.opacity = this.labelsVisible ? '1' : '0.3'
        this.button.style.color   = this.labelsVisible ? '#c8ff00' : '#ffffff'
        if (this._adsbControl) this._adsbControl.setLabelsVisible(this.labelsVisible)
        this._airStore.setOverlay('adsbLabels', this.labelsVisible)
    }

    syncToAdsb(adsbVisible: boolean): void {
        if (!this.button) return
        this.button.style.pointerEvents = adsbVisible ? 'auto' : 'none'
        this.button.style.opacity       = (adsbVisible && this.labelsVisible) ? '1' : '0.3'
        this.button.style.color         = (adsbVisible && this.labelsVisible) ? '#c8ff00' : '#ffffff'
        if (adsbVisible && this._adsbControl) this._adsbControl.setLabelsVisible(this.labelsVisible)
    }
}
