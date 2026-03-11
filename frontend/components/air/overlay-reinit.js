// ============================================================
// OVERLAY REINIT
// Registers style.load callbacks with MapComponent.onStyleLoad()
// so all overlay layers are reconstructed after every style switch.
// Must be loaded after all controls are constructed.
// ============================================================

window.MapComponent.onStyleLoad(function () {
    if (roadsControl)      roadsControl.updateRoadsVisibility();
    if (namesControl)      namesControl.applyNamesVisibility();
    if (rangeRingsControl) rangeRingsControl.initRings();
    if (aarControl)        aarControl.initLayers();
    if (awacsControl)      awacsControl.initLayers();
    if (airportsControl)   airportsControl.initLayers();
    if (rafControl)        rafControl.initLayers();
    if (adsbControl)       adsbControl.initLayers();
});
