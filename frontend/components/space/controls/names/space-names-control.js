"use strict";
// ============================================================
// SPACE NAMES TOGGLE CONTROL
// Toggles place_* and water_name MapLibre layers on/off.
//
// Depends on: map (global alias), _spaceOverlayStates, _saveSpaceOverlayStates
// ============================================================
/// <reference path="../../globals.d.ts" />
/// <reference path="../../../air/controls/sentinel-control-base/sentinel-control-base.ts" />
class SpaceNamesToggleControl extends SentinelControlBase {
    constructor() {
        super();
        this.namesVisible = _spaceOverlayStates.names;
    }
    get buttonLabel() { return 'N'; }
    get buttonTitle() { return 'Toggle city names'; }
    onInit() {
        this.setButtonActive(this.namesVisible);
        if (this.map.isStyleLoaded()) {
            this.applyNamesVisibility();
        }
        else {
            this.map.once('style.load', () => this.applyNamesVisibility());
        }
    }
    handleClick() { this.toggleNames(); }
    applyNamesVisibility() {
        const visibility = this.namesVisible ? 'visible' : 'none';
        const nameLayers = [
            'place_suburb', 'place_village', 'place_town',
            'place_city', 'place_state', 'place_country',
            'place_country_other', 'water_name',
        ];
        nameLayers.forEach(id => {
            try {
                this.map.setLayoutProperty(id, 'visibility', visibility);
            }
            catch (e) { }
        });
        this.setButtonActive(this.namesVisible);
    }
    toggleNames() {
        this.namesVisible = !this.namesVisible;
        this.applyNamesVisibility();
        _saveSpaceOverlayStates();
    }
}
spaceNamesControl = new SpaceNamesToggleControl();
map.addControl(spaceNamesControl, 'top-right');
