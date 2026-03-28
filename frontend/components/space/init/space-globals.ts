// ============================================================
// SPACE GLOBALS
// Shared mutable variable declarations for all space control files.
//
// Must be loaded before any control file so that cross-references
// between controls can reference these variables at parse time.
// All variables start as null and are assigned when controls are added.
// ============================================================

/// <reference path="../globals.d.ts" />

// Control instances — assigned when controls are added to the map
let issControl:        IssControl              | null = null;
let daynightControl:   DaynightControl         | null = null;
let spaceNamesControl: SpaceNamesToggleControl | null = null;

// Side-menu sync callback — assigned by space-side-menu.ts IIFE on load
let _spaceSyncSideMenu: (() => void) | null = null;

// User location — set by space-user-location.ts
let spaceUserLocationCenter:    [number, number] | null = null;
let _onGoToSpaceUserLocation:   (() => void)     | null = null;

// Globe projection state — persisted to localStorage separately from overlay states
let _spaceGlobeActive: boolean = (() => {
    try { return localStorage.getItem('sentinel_space_globeProjection') === '1'; } catch { return false; }
})();
