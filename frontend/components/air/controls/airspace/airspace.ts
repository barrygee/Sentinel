// ============================================================
// UK AIRSPACE OVERLAY CONTROL
// Renders 838 UK airspace zones from bundled OpenAIP GeoJSON.
// Covers: CTR, TMA, ATZ, MATZ, DANGER, RESTRICTED, PROHIBITED, RMZ
// Styled by ICAO class and type.
//
// Per-type visibility is handled by updating the GeoJSON source
// filter so only selected types are rendered.
//
// Data source: OpenAIP gb_airspace.geojson (bundled static asset)
// Works online and offline.
//
// Depends on:
//   map (global alias), _overlayStates, _saveOverlayStates
// ============================================================

/// <reference path="../../globals.d.ts" />
/// <reference path="../../types.ts" />
/// <reference path="../sentinel-control-base/sentinel-control-base.ts" />

const AIRSPACE_SOURCE = 'airspace-source';
const AIRSPACE_LAYERS = ['airspace-fill', 'airspace-outline', 'airspace-labels'];

type AirspaceType = 'CTR' | 'TMA' | 'ATZ' | 'MATZ' | 'DANGER' | 'RESTRICTED' | 'PROHIBITED' | 'RMZ';

const ALL_AIRSPACE_TYPES: AirspaceType[] = ['CTR', 'TMA', 'ATZ', 'MATZ', 'DANGER', 'RESTRICTED', 'PROHIBITED', 'RMZ'];

// Outline colours by type
const AIRSPACE_LINE_COLOR: maplibregl.ExpressionSpecification = [
    'match', ['get', 'type'],
    'CTR',        'rgba( 80, 160, 255, 0.85)',
    'TMA',        'rgba( 80, 160, 255, 0.70)',
    'ATZ',        'rgba( 80, 200, 255, 0.80)',
    'MATZ',       'rgba(200, 255,   0, 0.75)',
    'DANGER',     'rgba(255,  80,  80, 0.85)',
    'RESTRICTED', 'rgba(255,  80,  80, 0.85)',
    'PROHIBITED', 'rgba(255,  40,  40, 1.00)',
    'RMZ',        'rgba(200, 100, 255, 0.75)',
    'rgba(180, 180, 180, 0.60)',
];

// Fill colours by type
const AIRSPACE_FILL_COLOR: maplibregl.ExpressionSpecification = [
    'match', ['get', 'type'],
    'CTR',        'rgba( 80, 160, 255, 0.03)',
    'TMA',        'rgba( 80, 160, 255, 0.02)',
    'ATZ',        'rgba( 80, 200, 255, 0.03)',
    'MATZ',       'rgba(200, 255,   0, 0.02)',
    'DANGER',     'rgba(255,  80,  80, 0.03)',
    'RESTRICTED', 'rgba(255,  80,  80, 0.03)',
    'PROHIBITED', 'rgba(255,  40,  40, 0.04)',
    'RMZ',        'rgba(200, 100, 255, 0.03)',
    'rgba(0, 0, 0, 0)',
];

const AIRSPACE_DASH: maplibregl.ExpressionSpecification = [
    'match', ['get', 'type'],
    'MATZ',   ['literal', [4, 3]],
    'ATZ',    ['literal', [6, 2]],
    'DANGER', ['literal', [3, 3]],
    ['literal', [1, 0]],
];

class AirspaceControl extends SentinelControlBase {
    visible:      boolean;
    activeTypes:  Set<AirspaceType>;

    constructor() {
        super();
        this.visible     = _overlayStates.airspace ?? false;
        this.activeTypes = new Set(ALL_AIRSPACE_TYPES);
    }

    get buttonLabel(): string { return 'AS'; }
    get buttonTitle(): string { return 'Toggle UK airspace'; }

    protected onInit(): void {
        this.setButtonActive(this.visible);
        if (this.map.isStyleLoaded()) {
            this.initLayers();
        } else {
            this.map.once('style.load', () => this.initLayers());
        }
    }

    protected handleClick(): void { /* Unused — side menu calls toggle() directly */ }

    initLayers(): void {
        const vis = this.visible ? 'visible' : 'none';

        if (!this.map.getSource(AIRSPACE_SOURCE)) {
            this.map.addSource(AIRSPACE_SOURCE, {
                type: 'geojson',
                data: '/frontend/assets/gb_airspace.geojson',
            });
        }

        const beforeLayer = this.map.getLayer('aara-fill') ? 'aara-fill' : undefined;

        if (!this.map.getLayer('airspace-fill')) {
            this.map.addLayer({
                id:     'airspace-fill',
                type:   'fill',
                source: AIRSPACE_SOURCE,
                filter: this._buildFilter(),
                layout: { visibility: vis },
                paint: {
                    'fill-color':         AIRSPACE_FILL_COLOR,
                    'fill-outline-color': 'rgba(0,0,0,0)',
                },
            }, beforeLayer);
        }

        if (!this.map.getLayer('airspace-outline')) {
            this.map.addLayer({
                id:     'airspace-outline',
                type:   'line',
                source: AIRSPACE_SOURCE,
                filter: this._buildFilter(),
                layout: { visibility: vis },
                paint: {
                    'line-color':     AIRSPACE_LINE_COLOR,
                    'line-width':     1.2,
                    'line-dasharray': AIRSPACE_DASH,
                },
            }, beforeLayer);
        }

        if (!this.map.getLayer('airspace-labels')) {
            this.map.addLayer({
                id:      'airspace-labels',
                type:    'symbol',
                source:  AIRSPACE_SOURCE,
                filter:  this._buildFilter(),
                minzoom: 7,
                layout: {
                    visibility:           vis,
                    'text-field':         ['get', 'name'],
                    'text-font':          ['Noto Sans Regular'],
                    'text-size':          10,
                    'text-anchor':        'center',
                    'symbol-placement':   'point',
                    'text-allow-overlap': false,
                },
                paint: {
                    'text-color': '#ffffff',
                },
            }, beforeLayer);
        }
    }

    /** Build a MapLibre filter expression from the active type set. */
    _buildFilter(): maplibregl.FilterSpecification {
        const types = Array.from(this.activeTypes);
        if (types.length === 0) return ['==', ['get', 'type'], '__none__'];
        if (types.length === ALL_AIRSPACE_TYPES.length) return ['has', 'type'];
        return ['in', ['get', 'type'], ['literal', types]];
    }

    /** Apply the current active-type filter to all layers. */
    _applyFilter(): void {
        const filter = this._buildFilter();
        AIRSPACE_LAYERS.forEach(id => {
            try { this.map.setFilter(id, filter); } catch (_e) {}
        });
    }

    toggle(): void {
        this.visible = !this.visible;
        const vis = this.visible ? 'visible' : 'none';
        AIRSPACE_LAYERS.forEach(id => {
            try { this.map.setLayoutProperty(id, 'visibility', vis); } catch (_e) {}
        });
        this.setButtonActive(this.visible);
        _saveOverlayStates();
    }

    setVisible(v: boolean): void {
        if (this.visible === v) return;
        this.visible = v;
        const vis = v ? 'visible' : 'none';
        AIRSPACE_LAYERS.forEach(id => {
            try { this.map.setLayoutProperty(id, 'visibility', vis); } catch (_e) {}
        });
        this.setButtonActive(v);
    }

    toggleType(type: AirspaceType): void {
        if (this.activeTypes.has(type)) {
            this.activeTypes.delete(type);
        } else {
            this.activeTypes.add(type);
        }
        this._applyFilter();
        // If any type is active and overall is hidden, show the layer
        if (this.activeTypes.size > 0 && !this.visible) {
            this.setVisible(true);
            this.setButtonActive(true);
            _saveOverlayStates();
        }
    }

    setAllTypes(on: boolean): void {
        if (on) {
            ALL_AIRSPACE_TYPES.forEach(t => this.activeTypes.add(t));
        } else {
            this.activeTypes.clear();
        }
        this._applyFilter();
        if (on && !this.visible) {
            this.setVisible(true);
            this.setButtonActive(true);
        } else if (!on && this.visible) {
            this.setVisible(false);
            this.setButtonActive(false);
        }
        _saveOverlayStates();
    }

    isTypeActive(type: AirspaceType): boolean {
        return this.activeTypes.has(type);
    }

    isAllActive(): boolean {
        return this.visible && this.activeTypes.size === ALL_AIRSPACE_TYPES.length;
    }
}

airspaceControl = new AirspaceControl();
map.addControl(airspaceControl, 'top-right');
