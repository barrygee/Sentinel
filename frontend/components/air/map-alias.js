// ============================================================
// MAP ALIAS
// Exposes the MapLibre map instance as a bare `map` global so
// all air control files can reference `map` directly without
// knowing about the MapComponent wrapper.
// Must be loaded immediately after map.js.
// ============================================================
const map = window.MapComponent.map;
