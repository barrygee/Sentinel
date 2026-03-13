"use strict";
// ============================================================
// SPACE OVERLAY REINIT
// Registers a style.load callback with MapComponent that
// re-initialises all space overlay layers whenever the map style
// is switched (e.g. online ↔ offline style change).
//
// Must be loaded after all space control instances have been constructed.
// ============================================================
window.MapComponent.onStyleLoad(function () {
    if (daynightControl)
        daynightControl.initLayers();
    if (issControl)
        issControl.initLayers();
});
