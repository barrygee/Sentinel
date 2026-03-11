// Clear Overlays Control
// CLR button saves/restores all overlay states.
// Depends on: map (global alias), all control globals, _saveOverlayStates, _syncSideMenuForPlanes

class ClearOverlaysControl {
    constructor() {
        this.cleared = false;
        this.savedStates = null;
    }

    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl';
        this.container.style.backgroundColor = '#000000';
        this.container.style.borderRadius = '0';
        this.container.style.marginTop = '4px';

        this.button = document.createElement('button');
        this.button.title = 'Toggle all overlays';
        this.button.textContent = '✕';
        this.button.style.width = '29px';
        this.button.style.height = '29px';
        this.button.style.border = 'none';
        this.button.style.backgroundColor = '#000000';
        this.button.style.cursor = 'pointer';
        this.button.style.fontSize = '14px';
        this.button.style.color = '#ffffff';
        this.button.style.display = 'flex';
        this.button.style.alignItems = 'center';
        this.button.style.justifyContent = 'center';
        this.button.style.transition = 'opacity 0.2s';
        this.button.style.opacity = '0.3';
        this.button.onclick = () => this.toggle();
        this.button.onmouseover = () => this.button.style.backgroundColor = '#111111';
        this.button.onmouseout = () => this.button.style.backgroundColor = '#000000';

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
        if (!this.cleared) {
            this.savedStates = {
                roads: roadsControl ? roadsControl.roadsVisible : false,
                names: namesControl ? namesControl.namesVisible : false,
                rings: rangeRingsControl ? rangeRingsControl.ringsVisible : false,
                aar: aarControl ? aarControl.visible : false,
                awacs: awacsControl ? awacsControl.visible : false,
                airports: airportsControl ? airportsControl.visible : false,
                raf: rafControl ? rafControl.visible : false,
                adsb: adsbControl ? adsbControl.visible : false,
                adsbLabels: adsbLabelsControl ? adsbLabelsControl.labelsVisible : false,
            };
            if (roadsControl && roadsControl.roadsVisible) roadsControl.toggleRoads();
            if (namesControl && namesControl.namesVisible) namesControl.toggleNames();
            if (rangeRingsControl && rangeRingsControl.ringsVisible) rangeRingsControl.toggleRings();
            if (aarControl && aarControl.visible) aarControl.toggle();
            if (awacsControl && awacsControl.visible) awacsControl.toggle();
            if (airportsControl && airportsControl.visible) airportsControl.toggle();
            if (rafControl && rafControl.visible) rafControl.toggle();
            if (adsbControl && adsbControl.visible) {
                adsbControl.setAllHidden(true);
                adsbControl.setLabelsVisible(false);
                // Trails stay visible if a plane is being tracked (trails source only contains selected plane's dots)
                const keepTrails = adsbControl._followEnabled && adsbControl._selectedHex;
                if (!keepTrails) {
                    try { adsbControl.map.setLayoutProperty('adsb-trails', 'visibility', 'none'); } catch(e) {}
                }
            }
            this.cleared = true;
            this.button.style.opacity = '1';
            this.button.style.color = '#c8ff00';
        } else {
            if (this.savedStates) {
                if (roadsControl && this.savedStates.roads && !roadsControl.roadsVisible) roadsControl.toggleRoads();
                if (namesControl && this.savedStates.names && !namesControl.namesVisible) namesControl.toggleNames();
                if (rangeRingsControl && this.savedStates.rings && !rangeRingsControl.ringsVisible) rangeRingsControl.toggleRings();
                if (aarControl && this.savedStates.aar && !aarControl.visible) aarControl.toggle();
                if (awacsControl && this.savedStates.awacs && !awacsControl.visible) awacsControl.toggle();
                if (airportsControl && this.savedStates.airports && !airportsControl.visible) airportsControl.toggle();
                if (rafControl && this.savedStates.raf && !rafControl.visible) rafControl.toggle();
                if (adsbControl && this.savedStates.adsb) {
                    adsbControl.setAllHidden(false);
                    try { adsbControl.map.setLayoutProperty('adsb-trails', 'visibility', 'visible'); } catch(e) {}
                    if (adsbLabelsControl) {
                        adsbLabelsControl.labelsVisible = this.savedStates.adsbLabels;
                        adsbLabelsControl.button.style.opacity = this.savedStates.adsbLabels ? '1' : '0.3';
                        adsbLabelsControl.button.style.color = this.savedStates.adsbLabels ? '#c8ff00' : '#ffffff';
                        adsbControl.setLabelsVisible(this.savedStates.adsbLabels);
                    }
                    _saveOverlayStates();
                }
            }
            this.cleared = false;
            this.button.style.opacity = '0.3';
            this.button.style.color = '#ffffff';
            if (typeof _syncSideMenuForPlanes === 'function') _syncSideMenuForPlanes();
        }
    }
}

clearControl = new ClearOverlaysControl();
map.addControl(clearControl, 'top-right');
