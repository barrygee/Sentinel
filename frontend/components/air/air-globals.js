// ============================================================
// AIR GLOBALS
// Shared let declarations for all air component controls.
// Must be loaded before any control file so that mutual
// cross-references (e.g. adsbControl ↔ adsbLabelsControl)
// don't throw ReferenceError at parse time.
// ============================================================

let rangeRingCenter   = null;
let rangeRingsControl = null;
let adsbLabelsControl = null;

let roadsControl    = null;
let namesControl    = null;
let airportsControl = null;
let rafControl      = null;
let aarControl      = null;
let awacsControl    = null;
let adsbControl     = null;
let clearControl    = null;

// Side-menu callbacks — assigned by side-menu.js IIFE at load time
let _syncSideMenuForPlanes = null;
let _onGoToUserLocation    = null;
