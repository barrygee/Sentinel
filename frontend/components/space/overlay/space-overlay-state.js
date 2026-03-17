"use strict";
// ============================================================
// SPACE OVERLAY STATE PERSISTENCE
// Saves and restores each space overlay's on/off state to localStorage
// so visibility choices survive page reloads.
// ============================================================

const _SPACE_OVERLAY_DEFAULTS = {
    iss: true,
    groundTrack: true,
    footprint: true,
    daynight: true,
};

/**
 * Load saved space overlay states from localStorage, merging over defaults.
 */
let _spaceOverlayStates = (() => {
    try {
        const saved = localStorage.getItem('spaceOverlayStates');
        return saved
            ? Object.assign({}, _SPACE_OVERLAY_DEFAULTS, JSON.parse(saved))
            : Object.assign({}, _SPACE_OVERLAY_DEFAULTS);
    } catch (e) {
        return Object.assign({}, _SPACE_OVERLAY_DEFAULTS);
    }
})();

/**
 * Persist the current visibility state of every space control to localStorage.
 */
function _saveSpaceOverlayStates() {
    try {
        localStorage.setItem('spaceOverlayStates', JSON.stringify({
            iss:        issControl      ? issControl.issVisible        : _spaceOverlayStates.iss,
            groundTrack: issControl     ? issControl.trackVisible      : _spaceOverlayStates.groundTrack,
            footprint:  issControl      ? issControl.footprintVisible  : _spaceOverlayStates.footprint,
            daynight:   daynightControl ? daynightControl.dnVisible    : _spaceOverlayStates.daynight,
        }));
    } catch (e) {}
}
