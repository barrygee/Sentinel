// ADS-B Labels Toggle Control
// Syncs callsign label visibility with ADS-B toggle.
// Depends on: map (global alias), adsbControl

class AdsbLabelsToggleControl {
    constructor() {
        this.labelsVisible = _overlayStates.adsbLabels ?? true;
    }

    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl';
        this.container.style.backgroundColor = '#000000';
        this.container.style.borderRadius = '0';
        this.container.style.marginTop = '4px';

        this.button = document.createElement('button');
        this.button.title = 'Toggle aircraft labels';
        this.button.textContent = 'L';
        this.button.style.width = '29px';
        this.button.style.height = '29px';
        this.button.style.border = 'none';
        this.button.style.backgroundColor = '#000000';
        this.button.style.cursor = 'pointer';
        this.button.style.fontSize = '16px';
        this.button.style.fontWeight = 'bold';
        this.button.style.display = 'flex';
        this.button.style.alignItems = 'center';
        this.button.style.justifyContent = 'center';
        this.button.style.transition = 'opacity 0.2s, color 0.2s';
        const adsbOn = adsbControl ? adsbControl.visible : true;
        this.button.style.opacity = (adsbOn && this.labelsVisible) ? '1' : '0.3';
        this.button.style.color = (adsbOn && this.labelsVisible) ? '#c8ff00' : '#ffffff';
        this.button.style.pointerEvents = adsbOn ? 'auto' : 'none';
        this.button.onclick = () => this.toggle();
        this.button.onmouseover = () => { this.button.style.backgroundColor = '#111111'; };
        this.button.onmouseout  = () => { this.button.style.backgroundColor = '#000000'; };

        this.container.appendChild(this.button);
        return this.container;
    }

    onRemove() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.map = undefined;
    }

    toggle() {
        this.labelsVisible = !this.labelsVisible;
        this.button.style.opacity = this.labelsVisible ? '1' : '0.3';
        this.button.style.color = this.labelsVisible ? '#c8ff00' : '#ffffff';
        if (adsbControl) adsbControl.setLabelsVisible(this.labelsVisible);
        _saveOverlayStates();
    }

    syncToAdsb(adsbVisible) {
        if (!this.button) return;
        this.button.style.pointerEvents = adsbVisible ? 'auto' : 'none';
        this.button.style.opacity = (adsbVisible && this.labelsVisible) ? '1' : '0.3';
        this.button.style.color = (adsbVisible && this.labelsVisible) ? '#c8ff00' : '#ffffff';
        if (adsbVisible) adsbControl.setLabelsVisible(this.labelsVisible);
    }
}

adsbLabelsControl = new AdsbLabelsToggleControl();
map.addControl(adsbLabelsControl, 'top-right');
