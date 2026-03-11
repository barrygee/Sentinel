// ============================================================
// OVERLAY STATE PERSISTENCE
// Saves and restores the on/off state of every map overlay
// to localStorage so visibility survives page reloads.
//
// _OVERLAY_DEFAULTS  — first-load defaults (all overlays defined here)
// _overlayStates     — live state object, initialised from localStorage or defaults
// _saveOverlayStates — serialises current control states back to localStorage
//
// Dependencies: all control instances (read their .visible/.roadsVisible etc.)
// localStorage key: 'overlayStates'
// ============================================================

/** Default overlay visibility on first load (no prior localStorage entry). */
const _OVERLAY_DEFAULTS = { roads: true, names: false, rings: false, aar: false, awacs: false, airports: true, raf: false, adsb: true, adsbLabels: true };

/**
 * Initialise overlay state from localStorage, merging saved values over defaults.
 * IIFE — runs once at startup.
 */
const _overlayStates = (() => {
    try {
        const saved = localStorage.getItem('overlayStates');
        return saved ? Object.assign({}, _OVERLAY_DEFAULTS, JSON.parse(saved)) : Object.assign({}, _OVERLAY_DEFAULTS);
    } catch (e) { return Object.assign({}, _OVERLAY_DEFAULTS); }
})();

/**
 * Persist all overlay visibility states to localStorage.
 */
function _saveOverlayStates() {
    try {
        localStorage.setItem('overlayStates', JSON.stringify({
            roads:      roadsControl      ? roadsControl.roadsVisible        : _overlayStates.roads,
            names:      namesControl      ? namesControl.namesVisible         : _overlayStates.names,
            rings:      rangeRingsControl ? rangeRingsControl.ringsVisible    : _overlayStates.rings,
            aar:        aarControl        ? aarControl.visible                : _overlayStates.aar,
            awacs:      awacsControl      ? awacsControl.visible              : _overlayStates.awacs,
            airports:   airportsControl   ? airportsControl.visible           : _overlayStates.airports,
            raf:        rafControl        ? rafControl.visible                : _overlayStates.raf,
            adsb:       adsbControl       ? adsbControl.visible               : _overlayStates.adsb,
            adsbLabels: adsbLabelsControl ? adsbLabelsControl.labelsVisible   : _overlayStates.adsbLabels,
        }));
    } catch (e) {}
}
