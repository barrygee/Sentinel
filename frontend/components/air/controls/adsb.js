// ADS-B Live Control
// Polls airplanes.live API every 1s, interpolates positions at 100ms,
// renders aircraft icons (canvas sprites), click/hover tags, status bar,
// tracking, notifications, squawk emergency detection, trail history.
// Depends on: map (global alias), maplibregl, _overlayStates, _saveOverlayStates, _Notifications, _Tracking, rangeRingCenter

class AdsbLiveControl {
    constructor() {
        this.visible = _overlayStates.adsb;
        this._pollInterval = null;
        this._interpolateInterval = null;
        this._geojson = { type: 'FeatureCollection', features: [] };
        this._trails = {};
        this._trailsGeojson = { type: 'FeatureCollection', features: [] };
        this._MAX_TRAIL = 100;
        this._selectedHex = null;
        this._eventsAdded = false;
        this._lastPositions = {};   // hex -> { lon, lat, gs, track, ts }
        this._spriteReady = Promise.resolve();
        this._tagMarker = null;   // MapLibre Marker showing selected-aircraft data tag
        this._tagHex    = null;
        this._followEnabled = false;
        this._hoverMarker = null; // MapLibre Marker showing hovered-aircraft data tag
        this._hoverHex    = null;
        this._callsignMarkers = {};  // hex -> MapLibre Marker (HTML callsign label)
        this.labelsVisible = _overlayStates.adsbLabels ?? true;
        this._prevAlt = {};           // hex -> last known alt_baro (for landing/departure detection)
        this._hasDeparted = {};       // hex -> bool (true once departure notification fired)
        this._landedAt = {};          // hex -> timestamp when plane transitioned to alt===0
        this._seenOnGround = {};      // hex -> bool (true once observed at alt===0 while tracked)
        this._parkedTimers = {};      // hex -> setTimeout id (remove from map after 1 min)
        this._notifEnabled = new Set(); // hex -> notifications enabled (independent of tracking)
        this._trackingRestored = false;
        this._lastFetchTime = 0;
        this._isFetching = false;
        this._emergencySquawks = new Set(['7700', '7600', '7500']); // squawk codes treated as emergencies
        this._prevSquawk = {};  // hex -> last known squawk code (for change detection)
        this._typeFilter = 'all'; // 'all' | 'civil' | 'mil'
        this._allHidden = false; // true = hide all planes regardless of type filter
        this._hideGroundVehicles = false; // true = hide ground vehicles (C1, C2)
        this._hideTowers = false;        // true = hide towers/obstructions (C3, t=TWR)
        this._fetchFailCount = 0;        // consecutive fetch failures (for backoff)
    }

    setTypeFilter(mode) {
        this._typeFilter = mode;
        this._applyTypeFilter();
        this._updateCallsignMarkers();
    }

    setAllHidden(hidden) {
        this._allHidden = hidden;
        this._applyTypeFilter();
        this._updateCallsignMarkers();
        // Also hide/show the selected-aircraft tag and hover tag (HTML markers outside map filter)
        // Keep the tag visible if a plane is actively being tracked
        const isTracking = this._followEnabled && this._selectedHex;
        const tagEl = this._tagMarker ? this._tagMarker.getElement() : null;
        if (tagEl) tagEl.style.visibility = (hidden && !isTracking) ? 'hidden' : '';
        const hoverEl = this._hoverMarker ? this._hoverMarker.getElement() : null;
        if (hoverEl) hoverEl.style.visibility = hidden ? 'hidden' : '';
        // Trails: keep visible while tracking, hide otherwise
        try { this.map.setLayoutProperty('adsb-trails', 'visibility', (!hidden || isTracking) ? 'visible' : 'none'); } catch(e) {}
    }

    setHideGroundVehicles(hide) {
        this._hideGroundVehicles = hide;
        this._applyTypeFilter();
        this._updateCallsignMarkers();
    }

    setHideTowers(hide) {
        this._hideTowers = hide;
        this._applyTypeFilter();
        this._updateCallsignMarkers();
    }

    _applyTypeFilter() {
        if (!this.map) return;
        const baseFilter = ['any', ['>', ['get', 'alt_baro'], 0], ['>=', ['zoom'], 10]];

        // C1/C2 = ground vehicles, C3/C4/C5 or t=TWR = towers
        const isGndExpr   = ['match', ['get', 'category'], ['C1', 'C2'], true, false];
        const isTowerExpr = ['any',
            ['match', ['get', 'category'], ['C3', 'C4', 'C5'], true, false],
            ['==', ['get', 't'], 'TWR']
        ];
        // A plane is anything that is neither a ground vehicle nor a tower
        const isPlaneExpr = ['all', ['!', isGndExpr], ['!', isTowerExpr]];

        if (this._allHidden) {
            const trackedHex = this._followEnabled && this._selectedHex ? this._selectedHex : null;
            if (trackedHex) {
                // Keep only the tracked aircraft visible
                const trackedFilter = ['==', ['get', 'hex'], trackedHex];
                ['adsb-bracket', 'adsb-icons'].forEach(id => {
                    try {
                        this.map.setLayoutProperty(id, 'visibility', 'visible');
                        this.map.setFilter(id, trackedFilter);
                    } catch(e) {}
                });
            } else {
                ['adsb-bracket', 'adsb-icons'].forEach(id => {
                    try { this.map.setLayoutProperty(id, 'visibility', 'none'); } catch(e) {}
                });
            }
            return;
        }

        ['adsb-bracket', 'adsb-icons'].forEach(id => {
            try { this.map.setLayoutProperty(id, 'visibility', 'visible'); } catch(e) {}
        });

        // Non-planes only shown when type filter is 'all' and ADS-B is visible
        const typeFiltering = this._typeFilter !== 'all';
        const showGnd    = this.visible && !typeFiltering && !this._hideGroundVehicles;
        const showTowers = this.visible && !typeFiltering && !this._hideTowers;

        const conditions = [];

        if (this.visible) {
            if (this._typeFilter === 'civil') {
                conditions.push(['all', baseFilter, isPlaneExpr, ['!', ['boolean', ['get', 'military'], false]]]);
            } else if (this._typeFilter === 'mil') {
                conditions.push(['all', baseFilter, isPlaneExpr, ['boolean', ['get', 'military'], false]]);
            } else {
                conditions.push(['all', baseFilter, isPlaneExpr]);
            }
        }

        if (showGnd)    conditions.push(isGndExpr);
        if (showTowers) conditions.push(isTowerExpr);

        const filter = conditions.length === 0
            ? ['==', ['get', 'hex'], '']
            : conditions.length === 1 ? conditions[0] : ['any', ...conditions];

        try { this.map.setFilter('adsb-bracket', filter); } catch(e) {}
        try { this.map.setFilter('adsb-icons',   filter); } catch(e) {}
    }

    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl';
        this.container.style.backgroundColor = '#000000';
        this.container.style.borderRadius = '0';
        this.container.style.marginTop = '4px';

        this.button = document.createElement('button');
        this.button.title = 'Toggle live ADS-B aircraft';
        this.button.textContent = 'ADS';
        this.button.style.width = '29px';
        this.button.style.height = '29px';
        this.button.style.border = 'none';
        this.button.style.backgroundColor = '#000000';
        this.button.style.cursor = 'pointer';
        this.button.style.fontSize = '8px';
        this.button.style.fontWeight = 'bold';
        this.button.style.display = 'flex';
        this.button.style.alignItems = 'center';
        this.button.style.justifyContent = 'center';
        this.button.style.transition = 'opacity 0.2s, color 0.2s';
        this.button.style.opacity = this.visible ? '1' : '0.3';
        this.button.style.color = this.visible ? '#c8ff00' : '#ffffff';
        this.button.onclick = () => this.toggle();
        this.button.onmouseover = () => this.button.style.backgroundColor = '#111111';
        this.button.onmouseout  = () => this.button.style.backgroundColor = '#000000';

        this.container.appendChild(this.button);

        // Pre-fetch ADS-B data immediately so planes are ready to display as
        // soon as the map style finishes loading, rather than waiting for the
        // first poll to complete after layers are initialised.
        if (this.visible) this._fetch();

        // Wait for sprite before initialising layers — sprite is local so loads fast
        this._spriteReady.then(() => {
            if (!this.map) return;
            console.time('[ADSB] style.load → initLayers');
            if (this.map.isStyleLoaded()) {
                console.log('[ADSB] style already loaded, calling initLayers immediately');
                this.initLayers();
            } else {
                console.log('[ADSB] waiting for style.load...');
                this.map.once('style.load', () => {
                    console.timeEnd('[ADSB] style.load → initLayers');
                    this.initLayers();
                });
            }
        });

        return this.container;
    }

    onRemove() {
        this._stopPolling();
        if (this.container && this.container.parentNode) this.container.parentNode.removeChild(this.container);
        this.map = undefined;
    }

    _parseAlt(alt_baro) {
        if (alt_baro === 'ground' || alt_baro === '' || alt_baro == null) return 0;
        const alt = typeof alt_baro === 'number' ? alt_baro : parseFloat(alt_baro) || 0;
        return alt < 0 ? 0 : alt;
    }

    // Small solid directional triangle pointing north — rotated by icon-rotate
    // to match aircraft track. S=64 canvas, pixelRatio 2 → 32px logical.
    _createRadarBlip(color = '#ffffff', scale = 1) {
        const S  = 64;
        const cx = S / 2, cy = S / 2;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');

        // Base vertices centred on canvas
        const apex  = { x: cx,      y: cy - 13 };
        const bR    = { x: cx +  9, y: cy + 10 };
        const bL    = { x: cx -  9, y: cy + 10 };

        // Centroid of the triangle
        const gcx = (apex.x + bR.x + bL.x) / 3;
        const gcy = (apex.y + bR.y + bL.y) / 3;

        // Scale each vertex around the centroid
        const s = (v) => ({ x: gcx + (v.x - gcx) * scale, y: gcy + (v.y - gcy) * scale });

        const A = s(apex), B = s(bR), C = s(bL);

        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.lineTo(C.x, C.y);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();

        return ctx.getImageData(0, 0, S, S);
    }

    // Axis-aligned bracket corners matching the location marker style.
    // S=64 canvas, pixelRatio 2 → 32px logical, bracket centred at (32,32).
    _createBracket(color = '#c8ff00') {
        const S   = 64;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');

        // Map location-marker SVG coords (viewBox 14 15 32 30) to canvas 2:1 scale
        // SVG bracket: x=[16,44], y=[17,43]; arms 5 SVG units → 10 canvas px
        const x1 = 4, y1 = 4, x2 = 60, y2 = 56, arm = 10;

        // Semitransparent black background fill
        ctx.fillStyle = 'rgba(0, 0, 0, 0.10)';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

        ctx.strokeStyle = color;
        ctx.lineWidth   = 3;       // 1.5 logical, matching location marker
        ctx.lineCap     = 'square';

        // Top-left
        ctx.beginPath(); ctx.moveTo(x1 + arm, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 + arm); ctx.stroke();
        // Top-right
        ctx.beginPath(); ctx.moveTo(x2 - arm, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + arm); ctx.stroke();
        // Bottom-left
        ctx.beginPath(); ctx.moveTo(x1 + arm, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - arm); ctx.stroke();
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(x2 - arm, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - arm); ctx.stroke();

        return ctx.getImageData(0, 0, S, S);
    }

    // Bracket corners for military aircraft — same style as civil but black.
    _createMilBracket() {
        const S   = 64;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');

        const x1 = 4, y1 = 4, x2 = 60, y2 = 56, arm = 10;

        // Semitransparent green background fill
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

        ctx.strokeStyle = '#000000';
        ctx.lineWidth   = 3;
        ctx.lineCap     = 'square';

        // Top-left
        ctx.beginPath(); ctx.moveTo(x1 + arm, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 + arm); ctx.stroke();
        // Top-right
        ctx.beginPath(); ctx.moveTo(x2 - arm, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + arm); ctx.stroke();
        // Bottom-left
        ctx.beginPath(); ctx.moveTo(x1 + arm, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - arm); ctx.stroke();
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(x2 - arm, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - arm); ctx.stroke();

        return ctx.getImageData(0, 0, S, S);
    }

    // Fixed obstruction/tower icon — solid white circle centred on canvas.
    _createTowerBlip(scale = 1.1) {
        const S  = 64;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, 9 * scale, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        return ctx.getImageData(0, 0, S, S);
    }

    // Ground vehicle icon — solid white square centred on canvas.
    _createGroundVehicleBlip(color = '#ffffff', scale = 1.1) {
        const S  = 64;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');
        const half = 9 * scale;
        const cx = S / 2, cy = S / 2;
        ctx.fillStyle = color;
        ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
        return ctx.getImageData(0, 0, S, S);
    }

    // UAV/drone icon — same triangle as radar blip with an X drawn inside the body.
    _createUAVBlip(color = '#ffffff', scale = 1.1) {
        const S  = 64;
        const cx = S / 2, cy = S / 2;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');

        const apex = { x: cx,      y: cy - 13 };
        const bR   = { x: cx +  9, y: cy + 10 };
        const bL   = { x: cx -  9, y: cy + 10 };

        const gcx = (apex.x + bR.x + bL.x) / 3;
        const gcy = (apex.y + bR.y + bL.y) / 3;
        const s   = (v) => ({ x: gcx + (v.x - gcx) * scale, y: gcy + (v.y - gcy) * scale });
        const A = s(apex), B = s(bR), C = s(bL);

        // Draw filled triangle
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.lineTo(C.x, C.y);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        // Draw X inside the triangle body — centred on the triangle centroid
        const xSize = 4.5 * scale;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth   = 1.8;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(gcx - xSize, gcy - xSize); ctx.lineTo(gcx + xSize, gcy + xSize);
        ctx.moveTo(gcx + xSize, gcy - xSize); ctx.lineTo(gcx - xSize, gcy + xSize);
        ctx.stroke();

        return ctx.getImageData(0, 0, S, S);
    }

    _registerIcons() {
        if (this.map.hasImage('adsb-bracket'))         this.map.removeImage('adsb-bracket');
        if (this.map.hasImage('adsb-bracket-mil'))     this.map.removeImage('adsb-bracket-mil');
        if (this.map.hasImage('adsb-bracket-emerg'))   this.map.removeImage('adsb-bracket-emerg');
        if (this.map.hasImage('adsb-blip'))            this.map.removeImage('adsb-blip');
        if (this.map.hasImage('adsb-blip-mil'))        this.map.removeImage('adsb-blip-mil');
        if (this.map.hasImage('adsb-blip-emerg'))      this.map.removeImage('adsb-blip-emerg');
        if (this.map.hasImage('adsb-blip-uav'))        this.map.removeImage('adsb-blip-uav');
        if (this.map.hasImage('adsb-blip-gnd'))        this.map.removeImage('adsb-blip-gnd');
        if (this.map.hasImage('adsb-blip-tower'))      this.map.removeImage('adsb-blip-tower');
        if (this.map.hasImage('adsb-blip-emerg-gnd')) this.map.removeImage('adsb-blip-emerg-gnd');
        if (this.map.hasImage('adsb-bracket-emerg-gnd')) this.map.removeImage('adsb-bracket-emerg-gnd');
        this.map.addImage('adsb-bracket',         this._createBracket(),                         { pixelRatio: 2, sdf: false });
        this.map.addImage('adsb-bracket-mil',     this._createMilBracket(),                      { pixelRatio: 2, sdf: false });
        this.map.addImage('adsb-bracket-emerg',   this._createBracket('#ff2222'),                { pixelRatio: 2, sdf: false });
        this.map.addImage('adsb-bracket-emerg-gnd', this._createBracket('#ff2222'),              { pixelRatio: 2, sdf: false });
        this.map.addImage('adsb-blip',            this._createRadarBlip('#ffffff',         1.1), { pixelRatio: 2, sdf: false });
        this.map.addImage('adsb-blip-mil',        this._createRadarBlip('#c8ff00',         1.1), { pixelRatio: 2, sdf: false });
        this.map.addImage('adsb-blip-emerg',      this._createRadarBlip('#ff2222',         1.1), { pixelRatio: 2, sdf: false });
        this.map.addImage('adsb-blip-uav',        this._createUAVBlip('#ffffff',           1.1), { pixelRatio: 2, sdf: false });
        this.map.addImage('adsb-blip-gnd',        this._createGroundVehicleBlip('#ffffff', 1.1), { pixelRatio: 2, sdf: false });
        this.map.addImage('adsb-blip-emerg-gnd',  this._createGroundVehicleBlip('#ff2222', 1.1), { pixelRatio: 2, sdf: false });
        this.map.addImage('adsb-blip-tower',      this._createTowerBlip(1.1),                    { pixelRatio: 2, sdf: false });
    }

    initLayers() {
        console.log('[ADSB] initLayers called, geojson features:', this._geojson.features.length);
        const vis = this.visible ? 'visible' : 'none';

        ['adsb-icons', 'adsb-bracket', 'adsb-trails'].forEach(id => {
            try { this.map.removeLayer(id); } catch(e) {}
        });
        this._clearCallsignMarkers();
        ['adsb-live', 'adsb-trails-source'].forEach(id => {
            if (this.map.getSource(id)) this.map.removeSource(id);
        });

        this._registerIcons();

        // Position-history dots for selected aircraft (rendered behind icons)
        this.map.addSource('adsb-trails-source', { type: 'geojson', data: this._trailsGeojson });
        this.map.addLayer({
            id: 'adsb-trails',
            type: 'circle',
            source: 'adsb-trails-source',
            layout: { visibility: vis },
            paint: {
                'circle-radius': 2.5,
                'circle-opacity': ['get', 'opacity'],
                'circle-stroke-width': 0,
                'circle-color': ['case', ['==', ['get', 'emerg'], 1], '#ff2222', '#c8ff00'],
            }
        });

        // Aircraft positions
        this.map.addSource('adsb-live', { type: 'geojson', data: this._geojson });

        // Bracket corners — viewport-aligned (never rotate), always visible
        this.map.addLayer({
            id: 'adsb-bracket',
            type: 'symbol',
            source: 'adsb-live',
            filter: ['all', ['!', ['match', ['get', 'category'], ['A0', 'B0', 'C0'], true, false]], ['any', ['>', ['get', 'alt_baro'], 0], ['>=', ['zoom'], 10]]],
            layout: {
                visibility: vis,
                'icon-image': [
                    'case',
                    ['==', ['get', 'squawkEmerg'], 1], 'adsb-bracket-emerg',
                    ['boolean', ['get', 'military'], false], 'adsb-bracket-mil',
                    ['==', ['get', 'category'], 'C1'], 'adsb-bracket-emerg-gnd',
                    'adsb-bracket'
                ],
                'icon-size': 0.75,
                'icon-rotation-alignment': 'viewport',
                'icon-pitch-alignment': 'viewport',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            },
            paint: {
                'icon-opacity': ['case', ['==', ['get', 'stale'], 1], 0.3, 1],
                'icon-opacity-transition': { duration: 0 },
            }
        });

        // Directional triangle — rotates with aircraft track, always visible
        this.map.addLayer({
            id: 'adsb-icons',
            type: 'symbol',
            source: 'adsb-live',
            filter: ['all', ['!', ['match', ['get', 'category'], ['A0', 'B0', 'C0'], true, false]], ['any', ['>', ['get', 'alt_baro'], 0], ['>=', ['zoom'], 10]]],
            layout: {
                visibility: vis,
                'icon-image': [
                    'case',
                    ['==', ['get', 'squawkEmerg'], 1], 'adsb-blip-emerg',
                    ['boolean', ['get', 'military'], false], 'adsb-blip-mil',
                    ['==', ['get', 'category'], 'B6'], 'adsb-blip-uav',
                    ['==', ['get', 'category'], 'C1'], 'adsb-blip-emerg-gnd',
                    ['==', ['get', 'category'], 'C2'], 'adsb-blip-gnd',
                    ['==', ['get', 'category'], 'C3'], 'adsb-blip-tower',
                    ['==', ['get', 't'], 'TWR'], 'adsb-blip-tower',
                    'adsb-blip'
                ],
                'icon-size': 0.75,
                'icon-rotate': ['get', 'track'],
                'icon-rotation-alignment': 'map',
                'icon-pitch-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            },
            paint: {
                'icon-opacity': ['case', ['==', ['get', 'stale'], 1], 0.3, 1],
                'icon-opacity-transition': { duration: 0 },
            }
        });

        // Click/hover handlers — added once only to avoid duplicates on style reload
        if (!this._eventsAdded) {
            this._eventsAdded = true;

            let _clickHandled = false;
            const handleAircraftClick = (e) => {
                if (_clickHandled) return;
                if (!e.features || !e.features.length) return;
                _clickHandled = true;
                const hex = e.features[0].properties.hex;
                this._selectedHex = (hex === this._selectedHex) ? null : hex;
                this._hideHoverTag();
                this._applySelection();
            };

            this.map.on('click', 'adsb-bracket', handleAircraftClick);
            this.map.on('click', 'adsb-icons',  handleAircraftClick);

            this.map.on('click', (e) => {
                if (_clickHandled) { _clickHandled = false; return; }
                if (this._followEnabled) return;
                if (this._selectedHex) {
                    const hits = this.map.queryRenderedFeatures(e.point, { layers: ['adsb-bracket', 'adsb-icons'] });
                    if (!hits.length) {
                        this._selectedHex = null;
                        this._applySelection();
                    }
                }
            });

            const handleHoverEnter = (e) => {
                this.map.getCanvas().style.cursor = 'pointer';
                if (!e.features || !e.features.length) return;
                const hex = e.features[0].properties.hex;
                const f = this._geojson.features.find(f => f.properties.hex === hex);
                if (f) this._showHoverTag(f);
            };
            const handleHoverLeave = () => {
                this.map.getCanvas().style.cursor = '';
                this._hideHoverTag();
            };

            this.map.on('mouseenter', 'adsb-bracket', handleHoverEnter);
            this.map.on('mouseleave', 'adsb-bracket', handleHoverLeave);
            this.map.on('mouseenter', 'adsb-icons',   handleHoverEnter);
            this.map.on('mouseleave', 'adsb-icons',   handleHoverLeave);

            this.map.on('zoomend', () => this._updateCallsignMarkers());
        }

        this._raiseLayers();
        this._applyTypeFilter();

        // If a pre-fetch already completed while waiting for the style/layers to
        // initialise, push that data to the map immediately so planes appear
        // without waiting for another full API round-trip.
        if (this._geojson.features.length) this._interpolate();

        // Start polling only once the map source exists so the first fetch
        // can immediately display planes rather than silently dropping data.
        if (this.visible && !this._pollInterval) this._startPolling();
    }

    _categoryLabel(code) {
        const map = {
            A0: 'No category info', A1: 'Light aircraft', A2: 'Small aircraft',
            A3: 'Large aircraft',   A4: 'High vortex',    A5: 'Heavy aircraft',
            A6: 'High performance', A7: 'Rotorcraft',
            B0: 'No category info', B1: 'Glider / sailplane', B2: 'Lighter-than-air',
            B3: 'Parachutist',      B4: 'Ultralight',         B6: 'UAV / drone',
            B7: 'Space vehicle',
            C1: 'Emergency surface vehicle', C2: 'Service surface vehicle',
            C3: 'Fixed obstruction / tower', C4: 'Cluster obstacle',
            C5: 'Line obstacle',             C6: 'No category info',
        };
        if (!code) return null;
        const desc = map[code.toUpperCase()];
        return desc ? `${code.toUpperCase()} – ${desc}` : code.toUpperCase();
    }

    _buildTagHTML(props) {
        const raw      = (props.flight || '').trim() || (props.r || '').trim() || (props.hex || '').trim();
        const callsign = raw || 'UNKNOWN';
        const isEmergency = props.squawkEmerg === 1 || (props.emergency && props.emergency !== 'none');
        const callsignColor = isEmergency ? '#ff4040' : '#ffffff';

        // Tracking mode only applies to the specific plane being tracked.
        const isTracked  = this._followEnabled && props.hex === this._tagHex;
        const notifOn    = this._notifEnabled.has(props.hex);
        const trkColor   = isTracked ? '#c8ff00' : 'rgba(255,255,255,0.3)';
        const trkBtnText = isTracked ? 'TRACKING' : 'TRACK';
        const trkBtn = `<button class="tag-follow-btn" style="` +
            `background:none;border:none;cursor:pointer;padding:8px 12px;` +
            `color:${trkColor};font-family:'Barlow Condensed','Barlow',sans-serif;` +
            `font-size:10px;font-weight:700;letter-spacing:.1em;line-height:1;` +
            `touch-action:manipulation;-webkit-tap-highlight-color:transparent">${trkBtnText}</button>`;

        const bellColor = notifOn ? '#c8ff00' : 'rgba(255,255,255,0.3)';
        const bellBtn = `<button class="tag-notif-btn" data-hex="${props.hex}" style="` +
            `background:none;border:none;cursor:pointer;padding:8px 6px;` +
            `color:${bellColor};line-height:1;` +
            `touch-action:manipulation;-webkit-tap-highlight-color:transparent" aria-label="Toggle notifications">` +
            `<svg width="11" height="11" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">` +
            `<path d="M6.5 1C4.015 1 2 3.015 2 5.5V9H1v1h11V9h-1V5.5C11 3.015 8.985 1 6.5 1Z" fill="currentColor"/>` +
            `<path d="M5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1" fill="none"/>` +
            (notifOn ? '' : `<line x1="1.5" y1="1.5" x2="11.5" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>`) +
            `</svg></button>`;

        // When tracking, show only callsign + type (mil) + buttons — data is in the status bar below.
        if (isTracked) {
            const milTypeBadge = (props.military && props.t)
                ? `<span style="background:#4d6600;color:#c8ff00;font-size:11px;font-weight:700;padding:0 6px;letter-spacing:.05em;align-self:stretch;display:flex;align-items:center;margin:-1px 0 -1px 4px;">${props.t.toUpperCase()}</span>`
                : '';
            const hasBadge = !!(props.military && props.t);
            return `<div style="` +
                `background:rgba(0,0,0,0.7);` +
                `color:#fff;` +
                `font-family:'Barlow Condensed','Barlow',sans-serif;` +
                `font-size:13px;font-weight:400;` +
                `padding:1px ${hasBadge ? '0' : '8px'} 1px 8px;` +
                `white-space:nowrap;user-select:none">` +
                `<div style="display:flex;align-items:stretch;gap:4px">` +
                `<span style="font-size:13px;font-weight:400;letter-spacing:.12em;color:${callsignColor};pointer-events:none;align-self:center">${callsign}</span>` +
                `${milTypeBadge}${trkBtn}</div></div>`;
        }

        const alt      = props.alt_baro ?? 0;
        const vrt      = props.baro_rate ?? 0;
        const altStr   = alt === 0 ? 'GND'
            : alt >= 18000 ? 'FL' + String(Math.round(alt / 100)).padStart(3, '0')
            : alt.toLocaleString() + ' ft';
        const vrtArrow = vrt >  200 ? ' ↑' : vrt < -200 ? ' ↓' : '';
        const spdStr   = Math.round(props.gs ?? 0) + ' kt';
        const hdgStr   = Math.round(props.track ?? 0) + '°';
        const rows = [
            ['ALT', altStr + vrtArrow],
            ['SPD', spdStr],
            ['HDG', hdgStr],
        ];
        if (props.t) rows.push(['TYP', props.t]);
        if (props.r) rows.push(['REG', props.r]);
        if (props.squawk) rows.push(['SQK', props.squawk]);
        const catLabel = this._categoryLabel(props.category);
        if (catLabel) rows.push(['CAT', catLabel]);

        const rowsHTML = rows.map(([lbl, val]) =>
            `<div style="display:flex;gap:14px;line-height:1.8">` +
            `<span style="opacity:0.5;min-width:34px;letter-spacing:.05em">${lbl}</span>` +
            `<span>${val}</span></div>`
        ).join('');

        return `<div style="` +
            `background:rgba(0,0,0,0.7);` +
            `color:#fff;` +
            `font-family:'Barlow Condensed','Barlow',sans-serif;` +
            `font-size:14px;font-weight:400;` +
            `padding:6px 14px 9px;` +
            `white-space:nowrap;user-select:none">` +
            `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;` +
            `font-weight:600;font-size:15px;letter-spacing:.12em;` +
            `margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid rgba(255,255,255,0.12)">` +
            `<span style="font-size:13px;font-weight:400;pointer-events:none;color:${callsignColor}">${callsign}</span>` +
            `<div style="display:flex;align-items:center;gap:0">${bellBtn}${trkBtn}</div></div>` +
            `<div style="pointer-events:none">` + rowsHTML + `</div></div>`;
    }

    _buildStatusBarHTML(props) {
        const raw      = (props.flight || '').trim() || (props.r || '').trim() || (props.hex || '').trim();
        const callsign = raw || 'UNKNOWN';
        const alt      = props.alt_baro ?? 0;
        const vrt      = props.baro_rate ?? 0;
        const altStr   = alt === 0 ? 'GND'
            : alt >= 18000 ? 'FL' + String(Math.round(alt / 100)).padStart(3, '0')
            : alt.toLocaleString() + ' ft';
        const vrtArrow = vrt > 200 ? ' ↑' : vrt < -200 ? ' ↓' : '';
        const vrtStr   = vrt === 0 ? '0 fpm' : (vrt > 0 ? '+' : '') + Math.round(vrt).toLocaleString() + ' fpm';

        const fields = [];
        if (props.r)            fields.push(['REG',     props.r]);
        if (props.t)            fields.push(['TYPE',    props.t]);
        fields.push(['ALT',     altStr + vrtArrow]);
        fields.push(['GS',      Math.round(props.gs ?? 0) + ' kt']);
        fields.push(['HDG',     Math.round(props.track ?? 0) + '°']);
        if (props.squawk)       fields.push(['SQUAWK',  props.squawk]);
        if (props.emergency && props.emergency !== 'none') fields.push(['EMRG', props.emergency.toUpperCase()]);
        if (props.military)     fields.push(['CLASS',   'MILITARY']);
        const catLabel = this._categoryLabel(props.category);
        if (catLabel)           fields.push(['CATEGORY', catLabel]);

        const isEmergency = props.emergency && props.emergency !== 'none';
        const headerColor = isEmergency ? '#ff4040' : '#ffffff';

        const fieldsHTML = fields.map(([lbl, val]) =>
            `<div class="adsb-sb-field">` +
            `<span class="adsb-sb-label">${lbl}</span>` +
            `<span class="adsb-sb-value${lbl === 'EMRG' ? ' adsb-sb-emrg' : ''}">${val}</span>` +
            `</div>`
        ).join('');

        return `<div class="adsb-sb-header">` +
            `<span class="adsb-sb-label-tag">TRACKING</span>` +
            `<button class="adsb-sb-untrack-btn">UNTRACK</button>` +
            `</div>` +
            `<div class="adsb-sb-header" style="border-top:none;height:auto;padding:8px 14px 9px">` +
            `<span class="adsb-sb-callsign" style="color:${headerColor}">${callsign}</span>` +
            `</div>` +
            `<div class="adsb-sb-fields">${fieldsHTML}</div>`;
    }

    _showStatusBar(props) {
        let bar = document.getElementById('adsb-status-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'adsb-status-bar';
            const panel = document.getElementById('tracking-panel');
            if (panel) panel.appendChild(bar);
            else document.body.appendChild(bar);
        }
        delete bar.dataset.apt;
        bar.innerHTML = this._buildStatusBarHTML(props);
        bar.classList.add('adsb-sb-visible');
        this._wireStatusBarUntrack(bar);
        if (typeof _Tracking !== 'undefined') { _Tracking.setCount(1); _Tracking.openPanel(); }
        if (typeof _FilterPanel !== 'undefined') _FilterPanel.reposition();
    }

    _hideStatusBar() {
        const bar = document.getElementById('adsb-status-bar');
        if (bar) bar.classList.remove('adsb-sb-visible');
        if (typeof _Tracking !== 'undefined') { _Tracking.setCount(0); _Tracking.closePanel(); }
        if (typeof _FilterPanel !== 'undefined') _FilterPanel.reposition();
    }

    _updateStatusBar() {
        if (!this._followEnabled || !this._selectedHex) return;
        const bar = document.getElementById('adsb-status-bar');
        if (!bar || !bar.classList.contains('adsb-sb-visible')) return;
        const f = this._geojson.features.find(f => f.properties.hex === this._selectedHex);
        if (f) {
            bar.innerHTML = this._buildStatusBarHTML(f.properties);
            this._wireStatusBarUntrack(bar);
        }
    }

    _wireStatusBarUntrack(bar) {
        const btn = bar.querySelector('.adsb-sb-untrack-btn');
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._followEnabled = false;
            // Dismiss tracking notification for the previously tracked plane
            if (this._tagHex && this._trackingNotifIds && this._trackingNotifIds[this._tagHex]) {
                _Notifications.dismiss(this._trackingNotifIds[this._tagHex]);
                delete this._trackingNotifIds[this._tagHex];
            }
            if (this._tagHex) this._notifEnabled.delete(this._tagHex);
            // Rebuild the tag marker without tracking state
            if (this._tagHex) {
                const f = this._geojson.features.find(f => f.properties.hex === this._tagHex);
                if (f) {
                    const coords = this._interpolatedCoords(this._tagHex) || f.geometry.coordinates;
                    const newEl = document.createElement('div');
                    newEl.innerHTML = this._buildTagHTML(f.properties);
                    this._wireTagButton(newEl);
                    if (this._tagMarker) { this._tagMarker.remove(); this._tagMarker = null; }
                    this._tagMarker = new maplibregl.Marker({ element: newEl, anchor: 'top-left', offset: [14, -13] })
                        .setLngLat(coords)
                        .addTo(this.map);
                }
            }
            this._hideStatusBar();
            this._saveTrackingState();
            const is3D_u = typeof window._is3DActive === 'function' && window._is3DActive();
            if (!is3D_u) this.map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
        });
    }

    _wireTagButton(el, overrideHex = null) {
        const btn = el.querySelector('.tag-follow-btn');
        if (!btn) return;

        // Wire the notification bell button
        const bellBtn = el.querySelector('.tag-notif-btn');
        if (bellBtn) {
            bellBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
            bellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const hex = bellBtn.dataset.hex || overrideHex || this._tagHex;
                if (!hex) return;

                const wasEnabled = this._notifEnabled.has(hex);
                const f = this._geojson.features.find(f => f.properties.hex === hex);
                const callsign = f ? ((f.properties.flight || '').trim() || (f.properties.r || '').trim() || hex) : hex;
                const detail   = '';
                if (!this._trackingNotifIds) this._trackingNotifIds = {};

                if (wasEnabled) {
                    this._notifEnabled.delete(hex);
                    // Dismiss any existing notif and add a fresh notifications-off one
                    if (this._trackingNotifIds[hex]) {
                        _Notifications.dismiss(this._trackingNotifIds[hex]);
                        delete this._trackingNotifIds[hex];
                    }
                    _Notifications.add({ type: 'notif-off', title: callsign, detail: detail || undefined });
                } else {
                    this._notifEnabled.add(hex);
                    // Dismiss any previous notif for this plane before creating a new one
                    if (this._trackingNotifIds[hex]) {
                        _Notifications.dismiss(this._trackingNotifIds[hex]);
                    }
                    this._trackingNotifIds[hex] = _Notifications.add({
                        type:   'tracking',
                        title:  callsign,
                        detail: detail || undefined,
                        action: {
                            label: 'DISABLE NOTIFICATIONS',
                            callback: () => {
                                this._notifEnabled.delete(hex);
                                if (this._trackingNotifIds) delete this._trackingNotifIds[hex];
                                this._rebuildTagForHex(hex);
                            },
                        },
                    });
                }

                // Update bell colour in-place immediately, then sync the stored marker
                const nowEnabled = this._notifEnabled.has(hex);
                bellBtn.style.color = nowEnabled ? '#c8ff00' : 'rgba(255,255,255,0.3)';
                const slash = bellBtn.querySelector('line');
                if (slash) slash.setAttribute('display', nowEnabled ? 'none' : 'inline');
                // Rebuild stored tag marker so it stays in sync if re-opened
                this._rebuildTagForHex(hex);
            });
        }

        // MapLibre calls e.preventDefault() on every mousedown on the marker element,
        // which suppresses the subsequent click event. Stop propagation from the button
        // so MapLibre's mousedown handler never sees presses originating here.
        btn.addEventListener('mousedown', (e) => { e.stopPropagation(); });

        // Hover over the whole label: swap TRACKING ↔ UNTRACK
        if (btn.textContent === 'TRACKING') {
            el.addEventListener('mouseenter', () => { btn.textContent = 'UNTRACK'; });
            el.addEventListener('mouseleave', () => { btn.textContent = 'TRACKING'; });
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Resolve which hex to act on — overrideHex is used when clicking
            // TRACK from the hover tag (plane not yet selected).
            const hex = overrideHex || this._tagHex;
            if (!hex) return;

            // If clicking from the hover tag, select the plane first.
            if (overrideHex && overrideHex !== this._selectedHex) {
                // Dismiss notification for the previously tracked plane before switching
                if (this._tagHex && this._trackingNotifIds && this._trackingNotifIds[this._tagHex]) {
                    _Notifications.dismiss(this._trackingNotifIds[this._tagHex]);
                    delete this._trackingNotifIds[this._tagHex];
                }
                if (this._tagHex) this._notifEnabled.delete(this._tagHex);
                this._selectedHex = overrideHex;
                this._hideHoverTagNow();
                this._applySelection();
                // _applySelection will create the tag marker and show the selected tag.
                // Enable tracking and notifications after the marker is created.
                this._followEnabled = true;
                this._notifEnabled.add(hex);
                const f = this._geojson.features.find(f => f.properties.hex === hex);
                if (f) {
                    const _trkCs = (f.properties.flight || '').trim() || (f.properties.r || '').trim() || hex;
                    const _trkDetail = undefined;
                    if (!this._trackingNotifIds) this._trackingNotifIds = {};
                    if (this._trackingNotifIds[hex]) _Notifications.dismiss(this._trackingNotifIds[hex]);
                    this._trackingNotifIds[hex] = _Notifications.add({
                        type: 'track', title: _trkCs, detail: _trkDetail,
                    });
                    this._showStatusBar(f.properties);
                    const is3D_a = typeof window._is3DActive === 'function' && window._is3DActive();
                    const _trackCoords_a = this._interpolatedCoords(hex) || f.geometry.coordinates;
                    this.map.easeTo({ center: _trackCoords_a, zoom: 16, ...(is3D_a ? { pitch: 45 } : {}), duration: 600 });
                    // Rebuild the tag marker in tracking layout.
                    const coords = this._interpolatedCoords(hex) || f.geometry.coordinates;
                    const newEl = document.createElement('div');
                    newEl.innerHTML = this._buildTagHTML(f.properties);
                    this._wireTagButton(newEl);
                    if (this._tagMarker) { this._tagMarker.remove(); this._tagMarker = null; }
                    this._tagMarker = new maplibregl.Marker({ element: newEl, anchor: 'left', offset: [14, 0] })
                        .setLngLat(coords)
                        .addTo(this.map);
                }
                this._saveTrackingState();
                return;
            }

            this._followEnabled = !this._followEnabled;
            // Disable notifications when tracking is turned off
            if (!this._followEnabled && this._tagHex) {
                this._notifEnabled.delete(this._tagHex);
                if (this._trackingNotifIds && this._trackingNotifIds[this._tagHex]) {
                    _Notifications.dismiss(this._trackingNotifIds[this._tagHex]);
                    delete this._trackingNotifIds[this._tagHex];
                }
            }
            // Auto-enable notifications when tracking is turned on
            if (this._followEnabled && this._tagHex) {
                this._notifEnabled.add(this._tagHex);
                const _trkF = this._geojson.features.find(f => f.properties.hex === this._tagHex);
                const _trkCs = _trkF ? ((_trkF.properties.flight || '').trim() || (_trkF.properties.r || '').trim() || this._tagHex) : this._tagHex;
                const _trkDetail = undefined;
                if (!this._trackingNotifIds) this._trackingNotifIds = {};
                if (this._trackingNotifIds[this._tagHex]) _Notifications.dismiss(this._trackingNotifIds[this._tagHex]);
                this._trackingNotifIds[this._tagHex] = _Notifications.add({
                    type: 'track', title: _trkCs, detail: _trkDetail,
                });
            }

            // Re-create the marker so the anchor updates (top-left for data box, left for tracking).
            if (this._tagHex) {
                const f = this._geojson.features.find(f => f.properties.hex === this._tagHex);
                if (f) {
                    const coords = this._interpolatedCoords(this._tagHex) || f.geometry.coordinates;
                    const newEl = document.createElement('div');
                    newEl.innerHTML = this._buildTagHTML(f.properties);
                    this._wireTagButton(newEl);
                    if (this._tagMarker) { this._tagMarker.remove(); this._tagMarker = null; }
                    const anchor = this._followEnabled ? 'left' : 'top-left';
                    const offset = this._followEnabled ? [14, 0] : [14, -13];
                    this._tagMarker = new maplibregl.Marker({ element: newEl, anchor, offset })
                        .setLngLat(coords)
                        .addTo(this.map);
                    if (this._followEnabled) {
                        this._showStatusBar(f.properties);
                        const is3D_b = typeof window._is3DActive === 'function' && window._is3DActive();
                        const _trackCoords_b = this._interpolatedCoords(this._tagHex) || f.geometry.coordinates;
                        this.map.easeTo({ center: _trackCoords_b, zoom: 16, ...(is3D_b ? { pitch: 45 } : {}), duration: 600 });
                    } else {
                        this._hideStatusBar();
                        const is3D_c = typeof window._is3DActive === 'function' && window._is3DActive();
                        if (!is3D_c) this.map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
                    }
                }
            }
            // Re-apply layer filter in case _allHidden is active (tracked plane must stay visible)
            if (this._allHidden) {
                this._applyTypeFilter();
                const isTracking = this._followEnabled && this._selectedHex;
                const tagEl = this._tagMarker ? this._tagMarker.getElement() : null;
                if (tagEl) tagEl.style.visibility = isTracking ? '' : 'hidden';
                try { this.map.setLayoutProperty('adsb-trails', 'visibility', isTracking ? 'visible' : 'none'); } catch(e) {}
            }
            this._saveTrackingState();
        });
    }

    _rebuildTagForHex(hex) {
        if (!hex || hex !== this._tagHex) return;
        const f = this._geojson.features.find(f => f.properties.hex === hex);
        if (!f) return;
        const coords = this._interpolatedCoords(hex) || f.geometry.coordinates;
        const newEl = document.createElement('div');
        newEl.innerHTML = this._buildTagHTML(f.properties);
        this._wireTagButton(newEl);
        if (this._tagMarker) { this._tagMarker.remove(); this._tagMarker = null; }
        const isTracked = this._followEnabled && hex === this._tagHex;
        const anchor = isTracked ? 'left' : 'top-left';
        const offset = isTracked ? [14, 0] : [14, -13];
        this._tagMarker = new maplibregl.Marker({ element: newEl, anchor, offset })
            .setLngLat(coords)
            .addTo(this.map);
    }

    _showSelectedTag(feature) {
        this._hideSelectedTag();
        this._hideStatusBar();
        if (!feature || !this.map) return;
        this._followEnabled = false;
        const el = document.createElement('div');
        el.innerHTML = this._buildTagHTML(feature.properties);
        this._wireTagButton(el);
        const coords = this._interpolatedCoords(feature.properties.hex) || feature.geometry.coordinates;
        // Data box: top-left aligned. Tracking label: vertically centred (left anchor).
        const anchor = this._followEnabled ? 'left' : 'top-left';
        this._tagMarker = new maplibregl.Marker({ element: el, anchor, offset: [14, -13] })
            .setLngLat(coords)
            .addTo(this.map);
        if (this._allHidden) el.style.visibility = 'hidden';
        this._tagHex = feature.properties.hex;
    }

    _hideSelectedTag() {
        if (this._tagMarker) { this._tagMarker.remove(); this._tagMarker = null; }
        if (this._tagHex && this._followEnabled) {
            this._notifEnabled.delete(this._tagHex);
        }
        this._tagHex = null;
        this._saveTrackingState();
    }

    _showHoverTag(feature, fromLabel = false) {
        if (!feature || !this.map) return;
        const hex = feature.properties.hex;
        // Don't show hover tag over the already-selected plane
        if (hex === this._selectedHex) return;
        // Cancel any pending hide
        if (this._hoverHideTimer) { clearTimeout(this._hoverHideTimer); this._hoverHideTimer = null; }
        // Already showing hover tag for this plane — just update position
        const coords = this._interpolatedCoords(hex) || feature.geometry.coordinates;
        if (this._hoverHex === hex && this._hoverMarker) {
            this._hoverMarker.setLngLat(coords);
            return;
        }
        this._hideHoverTagNow();
        const el = document.createElement('div');
        el.innerHTML = this._buildTagHTML(feature.properties);
        // Always enable pointer events so the track button is clickable and
        // moving the cursor onto the box keeps it alive.
        el.style.pointerEvents = 'auto';
        el.addEventListener('mouseenter', () => {
            if (this._hoverHideTimer) { clearTimeout(this._hoverHideTimer); this._hoverHideTimer = null; }
        });
        el.addEventListener('mouseleave', () => this._hideHoverTag());
        this._wireTagButton(el, hex);
        this._hoverMarker = new maplibregl.Marker({ element: el, anchor: 'top-left', offset: [14, -13] })
            .setLngLat(coords)
            .addTo(this.map);
        this._hoverHex = hex;
        this._hoverFromLabel = fromLabel;
        // Hide the callsign label in both cases — data box covers its position.
        if (this._callsignMarkers[hex]) {
            this._callsignMarkers[hex].getElement().style.visibility = 'hidden';
        }
    }

    _hideHoverTag() {
        if (this._hoverHideTimer) clearTimeout(this._hoverHideTimer);
        this._hoverHideTimer = setTimeout(() => {
            this._hoverHideTimer = null;
            this._hideHoverTagNow();
        }, 80);
    }

    _hideHoverTagNow() {
        // Always restore the callsign label
        if (this._hoverHex && this._callsignMarkers[this._hoverHex]) {
            this._callsignMarkers[this._hoverHex].getElement().style.visibility = '';
        }
        if (this._hoverMarker) { this._hoverMarker.remove(); this._hoverMarker = null; }
        this._hoverHex = null;
        this._hoverFromLabel = false;
    }

    // Build a simple HTML callsign label element styled like the selected popup header.
    _buildCallsignLabelEl(props) {
        const raw = (props.flight || '').trim() || (props.r || '').trim() || (props.hex || '').trim();
        const callsign = raw || 'UNKNOWN';
        const isEmerg = props.squawkEmerg === 1;
        const el = document.createElement('div');
        el.style.cssText = [
            isEmerg ? 'background:rgba(180,0,0,0.85)' : 'background:rgba(0,0,0,0.5)',
            'color:#ffffff',
            "font-family:'Barlow Condensed','Barlow',sans-serif",
            'font-size:13px',
            'font-weight:400',
            'letter-spacing:.12em',
            'text-transform:uppercase',
            'box-sizing:border-box',
            'display:flex',
            'align-items:center',
            'gap:5px',
            'padding:1px 8px',
            'cursor:pointer',
            'white-space:nowrap',
            'user-select:none',
        ].join(';');
        // Callsign text span
        const nameSpan = document.createElement('span');
        nameSpan.textContent = callsign;
        nameSpan.style.cssText = isEmerg ? 'color:#ff4040 !important' : 'color:#ffffff !important';
        el.appendChild(nameSpan);
        // Military model badge (e.g. C17, C130) + optional tracking button
        if (props.military) {
            const isTracked = this._notifEnabled.has(props.hex);
            const hasBadge = !!props.t;
            if (hasBadge || isTracked) el.style.paddingRight = '0';
            if (hasBadge) {
                const modelBadge = document.createElement('span');
                modelBadge.className = 'mil-model-badge';
                modelBadge.textContent = props.t.toUpperCase();
                modelBadge.style.cssText = 'background:#4d6600;color:#c8ff00 !important;font-size:11px;font-weight:700;padding:0 6px;letter-spacing:.05em;align-self:stretch;display:flex;align-items:center;margin:-1px 0 -1px 5px;';
                el.appendChild(modelBadge);
            }
            if (isTracked) {
                const trkBtn = document.createElement('button');
                trkBtn.className = 'mil-trk-btn';
                trkBtn.textContent = 'TRACKING';
                trkBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0 6px;color:#c8ff00;font-family:inherit;font-size:10px;font-weight:700;letter-spacing:.1em;align-self:stretch;display:flex;align-items:center;white-space:nowrap;';
                trkBtn.addEventListener('mouseenter', () => { trkBtn.textContent = 'UNTRACK'; });
                trkBtn.addEventListener('mouseleave', () => { trkBtn.textContent = 'TRACKING'; });
                trkBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._notifEnabled.delete(props.hex);
                    this._updateCallsignMarkers();
                });
                el.appendChild(trkBtn);
            }
        }
        // Emergency squawk badge — same flush-right panel style as mil-model-badge
        if (isEmerg) {
            el.style.paddingRight = '0';
            el.style.gap = '0';
            const badge = document.createElement('span');
            badge.className = 'sqk-badge';
            badge.textContent = props.squawk;
            const hasTypeBadge = props.military && props.t;
            badge.style.cssText = `background:#000;color:#ff2222 !important;font-size:11px;font-weight:700;padding:0 6px;letter-spacing:.05em;align-self:stretch;display:flex;align-items:center;margin:-1px 0 -1px ${hasTypeBadge ? '0' : '8px'};`;
            el.appendChild(badge);
        }
        el.addEventListener('mouseenter', () => {
            const f = this._geojson.features.find(f => f.properties.hex === props.hex);
            if (f) this._showHoverTag(f, true);
        });
        el.addEventListener('mouseleave', () => {
            this._hideHoverTag();
        });
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const hex = props.hex;
            this._selectedHex = (hex === this._selectedHex) ? null : hex;
            this._hideHoverTag();
            this._applySelection();
        });
        return el;
    }

    setLabelsVisible(v) {
        this.labelsVisible = v;
        if (!v) {
            this._clearCallsignMarkers();
        } else {
            this._updateCallsignMarkers();
        }
    }

    // Create/update HTML callsign markers for all non-selected aircraft.
    _updateCallsignMarkers() {
        if (!this.map || !this.labelsVisible) return;
        const features = this._geojson.features;
        const seen = new Set();

        for (const f of features) {
            const hex = f.properties.hex;
            if (!hex) continue;
            seen.add(hex);

            // Only show label if the icon is visible (mirrors the layer filter).
            const zoom = this.map.getZoom();
            const isMil = !!f.properties.military;
            const cat = (f.properties.category || '').toUpperCase();
            const isGnd    = ['C1', 'C2'].includes(cat);
            const isTower  = ['C3', 'C4', 'C5'].includes(cat) || (f.properties.t || '').toUpperCase() === 'TWR';
            // Ground vehicles and towers have no altitude — always icon-visible when enabled.
            const iconVisible = isGnd || isTower || (f.properties.alt_baro > 0) || (zoom >= 10);
            let typeVisible;
            if (this._allHidden) {
                typeVisible = false;
            } else if (isGnd) {
                typeVisible = this._typeFilter === 'all' && !this._hideGroundVehicles;
            } else if (isTower) {
                typeVisible = this._typeFilter === 'all' && !this._hideTowers;
            } else {
                typeVisible = this.visible && (this._typeFilter === 'all'
                    || (this._typeFilter === 'civil' && !isMil)
                    || (this._typeFilter === 'mil'   && isMil));
            }
            if (!iconVisible || !typeVisible) {
                if (this._callsignMarkers[hex]) {
                    this._callsignMarkers[hex].remove();
                    delete this._callsignMarkers[hex];
                }
                continue;
            }

            // Selected aircraft uses the full popup instead.
            if (hex === this._selectedHex) {
                if (this._callsignMarkers[hex]) {
                    this._callsignMarkers[hex].remove();
                    delete this._callsignMarkers[hex];
                }
                continue;
            }

            const lngLat = this._interpolatedCoords(hex) || f.geometry.coordinates;
            const pos = this._lastPositions[hex];
            const ageSec = pos ? (Date.now() - pos.lastSeen) / 1000 : 0;
            const isStale = ageSec >= 30 && f.properties.alt_baro !== 0;

            if (this._callsignMarkers[hex]) {
                this._callsignMarkers[hex].setLngLat(lngLat);
                // Refresh label contents in case callsign/squawk state changed.
                const labelEl = this._callsignMarkers[hex].getElement();
                const raw = (f.properties.flight || '').trim() || (f.properties.r || '').trim() || f.properties.hex || '';
                const isEmerg = f.properties.squawkEmerg === 1;
                // Update background
                labelEl.style.background = isEmerg ? 'rgba(180,0,0,0.85)' : 'rgba(0,0,0,0.5)';
                labelEl.style.opacity = isStale ? '0.3' : '1';
                // Update callsign text (first child span)
                const nameSpan = labelEl.querySelector('span:not(.sqk-badge):not(.mil-model-badge)') || labelEl;
                nameSpan.textContent = raw || 'UNKNOWN';
                nameSpan.style.cssText = isStale ? 'color:rgba(255,255,255,0.45) !important' : 'color:#ffffff !important';
                // Update/add/remove military model badge + tracking button
                if (f.properties.military) {
                    const isTracked = this._notifEnabled.has(hex);
                    const hasBadge = !!f.properties.t;
                    if (hasBadge || isTracked) labelEl.style.paddingRight = '0';
                    else labelEl.style.paddingRight = '8px';
                    // Model badge
                    let modelBadge = labelEl.querySelector('.mil-model-badge');
                    if (hasBadge) {
                        if (!modelBadge) {
                            modelBadge = document.createElement('span');
                            modelBadge.className = 'mil-model-badge';
                            modelBadge.style.cssText = 'background:#4d6600;color:#c8ff00 !important;font-size:11px;font-weight:700;padding:0 6px;letter-spacing:.05em;align-self:stretch;display:flex;align-items:center;margin:-1px 0 -1px 5px;';
                            labelEl.insertBefore(modelBadge, labelEl.querySelector('.mil-trk-btn') || labelEl.querySelector('.sqk-badge') || null);
                        }
                        modelBadge.textContent = f.properties.t.toUpperCase();
                    } else if (modelBadge) {
                        modelBadge.remove();
                    }
                    // Tracking button
                    let trkBtn = labelEl.querySelector('.mil-trk-btn');
                    if (isTracked && !trkBtn) {
                        trkBtn = document.createElement('button');
                        trkBtn.className = 'mil-trk-btn';
                        trkBtn.textContent = 'TRACKING';
                        trkBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0 6px;color:#c8ff00;font-family:inherit;font-size:10px;font-weight:700;letter-spacing:.1em;align-self:stretch;display:flex;align-items:center;white-space:nowrap;';
                        trkBtn.addEventListener('mouseenter', () => { trkBtn.textContent = 'UNTRACK'; });
                        trkBtn.addEventListener('mouseleave', () => { trkBtn.textContent = 'TRACKING'; });
                        trkBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this._notifEnabled.delete(hex);
                            this._updateCallsignMarkers();
                        });
                        labelEl.appendChild(trkBtn);
                    } else if (!isTracked && trkBtn) {
                        trkBtn.remove();
                    }
                } else {
                    labelEl.querySelector('.mil-model-badge')?.remove();
                    labelEl.querySelector('.mil-trk-btn')?.remove();
                    if (!isEmerg) labelEl.style.paddingRight = '8px';
                }
                // Update/add/remove squawk badge
                let badge = labelEl.querySelector('.sqk-badge');
                if (isEmerg) {
                    labelEl.style.paddingRight = '0';
                    labelEl.style.gap = '0';
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'sqk-badge';
                        badge.style.cssText = 'background:#000;color:#ff2222 !important;font-size:11px;font-weight:700;padding:0 6px;letter-spacing:.05em;align-self:stretch;display:flex;align-items:center;margin:-1px 0 -1px 8px;';
                        labelEl.appendChild(badge);
                    }
                    badge.textContent = f.properties.squawk;
                } else if (badge) {
                    badge.remove();
                    labelEl.style.gap = '5px';
                    if (!labelEl.querySelector('.mil-model-badge') && !labelEl.querySelector('.mil-trk-btn')) {
                        labelEl.style.paddingRight = '8px';
                    }
                }
            } else {
                const labelEl = this._buildCallsignLabelEl(f.properties);
                if (isStale) {
                    labelEl.style.opacity = '0.3';
                    const nameSpan = labelEl.querySelector('span:not(.sqk-badge):not(.mil-model-badge)') || labelEl;
                    if (nameSpan) nameSpan.style.color = 'rgba(255,255,255,0.45)';
                }
                const marker = new maplibregl.Marker({ element: labelEl, anchor: 'left', offset: [14, 0] })
                    .setLngLat(lngLat)
                    .addTo(this.map);
                this._callsignMarkers[hex] = marker;
            }
        }

        // Remove markers for aircraft that have left the feed.
        for (const hex of Object.keys(this._callsignMarkers)) {
            if (!seen.has(hex)) {
                this._callsignMarkers[hex].remove();
                delete this._callsignMarkers[hex];
            }
        }
    }

    _clearCallsignMarkers() {
        for (const marker of Object.values(this._callsignMarkers)) marker.remove();
        this._callsignMarkers = {};
    }

    _applySelection() {
        if (!this.map) return;

        // Apply type filter (civil/mil/all/none) — respects current mode
        this._applyTypeFilter();

        // HTML callsign markers — selected aircraft gets the full popup instead.
        this._updateCallsignMarkers();

        if (this._selectedHex) {
            const f = this._geojson.features.find(f => f.properties.hex === this._selectedHex);
            this._showSelectedTag(f || null);
        } else {
            this._hideSelectedTag();
            this._hideStatusBar();
        }
        this._rebuildTrails();
    }

    _rebuildTrails() {
        const trailFeatures = [];
        if (this._selectedHex && this._trails[this._selectedHex]) {
            const points = this._trails[this._selectedHex];
            const n = points.length;
            const selFeature = this._geojson.features.find(f => f.properties.hex === this._selectedHex);
            const isEmerg = selFeature && (selFeature.properties.squawkEmerg === 1 || (selFeature.properties.emergency && selFeature.properties.emergency !== 'none')) ? 1 : 0;
            for (let i = 0; i < n; i++) {
                const p = points[i];
                trailFeatures.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
                    properties: {
                        alt:     p.alt,
                        opacity: (i + 1) / n,   // oldest = near 0, newest = 1.0
                        emerg:   isEmerg,
                    }
                });
            }
        }
        this._trailsGeojson = { type: 'FeatureCollection', features: trailFeatures };
        if (this.map && this.map.getSource('adsb-trails-source')) {
            this.map.getSource('adsb-trails-source').setData(this._trailsGeojson);
        }
    }

    // Dead-reckoning: runs every second, extrapolates positions between API polls
    // using each aircraft's ground speed and track so movement looks continuous.
    _interpolate() {
        if (!this.map || !this._geojson.features.length) return;
        const now = Date.now();
        // 1 knot = 1 nm/hr; 1 nm = 1/60 degree latitude
        const NM_DEG = 1 / 60;
        const HR_SEC = 3600;

        const STALE_SEC = 30;      // dim/disable after 30s no data
        const REMOVE_SEC = 60;     // remove from map after 60s no data
        this._geojson.features = this._geojson.features.filter(f => {
            const pos = this._lastPositions[f.properties.hex];
            if (!pos) return true;
            const ageSec = (now - pos.lastSeen) / 1000;
            if (ageSec >= REMOVE_SEC) {
                const hex = f.properties.hex;
                if (hex && this._callsignMarkers[hex]) {
                    this._callsignMarkers[hex].remove();
                    delete this._callsignMarkers[hex];
                }
                return false;
            }
            return true;
        });

        this._interpolatedFeatures = this._geojson.features.map(f => {
            const hex = f.properties.hex;
            const pos = this._lastPositions[hex];
            const ageSec = pos ? (now - pos.lastSeen) / 1000 : 0;
            const onGround = f.properties.alt_baro === 0;

            if (onGround) {
                // Ground planes: dead-reckon only if we have fresh data, gs >= 10, and a real track.
                const groundStale = ageSec >= STALE_SEC;
                if (!pos || pos.gs < 10 || groundStale || pos.track === null) {
                    const coords = pos ? [pos.lon, pos.lat] : f.geometry.coordinates;
                    return { ...f, geometry: { type: 'Point', coordinates: coords }, properties: { ...f.properties, stale: 0 } };
                }
            } else {
                // Airborne: go stale if no data received within threshold
                const stale = ageSec >= STALE_SEC ? 1 : 0;
                if (!pos || pos.gs < 10 || stale) {
                    const coords = pos ? [pos.lon, pos.lat] : f.geometry.coordinates;
                    return { ...f, geometry: { type: 'Point', coordinates: coords }, properties: { ...f.properties, stale } };
                }
            }

            // Dead-reckon from the last real API fix using elapsed time
            const trackRad = pos.track * Math.PI / 180;
            const nmPerSec = pos.gs / HR_SEC;
            const dLat = nmPerSec * ageSec * Math.cos(trackRad) * NM_DEG;
            const dLon = nmPerSec * ageSec * Math.sin(trackRad) * NM_DEG / Math.cos(pos.lat * Math.PI / 180);
            const lon = pos.lon + dLon;
            const lat = pos.lat + dLat;
            return {
                ...f,
                geometry: { type: 'Point', coordinates: [lon, lat] },
                properties: { ...f.properties, stale: 0 }
            };
        });

        const interpolated = { type: 'FeatureCollection', features: this._interpolatedFeatures };

        if (this.map.getSource('adsb-live')) {
            this.map.getSource('adsb-live').setData(interpolated);
            // setData resets layer filters — reapply immediately
            this._applyTypeFilter();
        } else {
            console.log('[ADSB] _interpolate: source not ready yet');
        }

        // Keep tag and callsign markers on interpolated positions.
        if (this._tagMarker && this._tagHex) {
            const f = this._interpolatedFeatures.find(f => f.properties.hex === this._tagHex);
            if (f) {
                this._tagMarker.setLngLat(f.geometry.coordinates);
                if (this._followEnabled) {
                    const followPitch = typeof window._getTargetPitch === 'function' ? window._getTargetPitch() : 0;
                    this.map.easeTo({ center: f.geometry.coordinates, pitch: followPitch, duration: 150, easing: t => t });
                }
            }
        }
        for (const f of this._interpolatedFeatures) {
            const hex = f.properties.hex;
            if (hex && this._callsignMarkers[hex]) {
                this._callsignMarkers[hex].setLngLat(f.geometry.coordinates);
            }
            if (hex && hex === this._hoverHex && this._hoverMarker) {
                this._hoverMarker.setLngLat(f.geometry.coordinates);
            }
        }
    }

    // Returns the interpolated coordinates for a given hex, falling back to raw API coords.
    _interpolatedCoords(hex) {
        if (this._interpolatedFeatures) {
            const f = this._interpolatedFeatures.find(f => f.properties.hex === hex);
            if (f) return f.geometry.coordinates;
        }
        const f = this._geojson.features.find(f => f.properties.hex === hex);
        return f ? f.geometry.coordinates : null;
    }

    async _fetch() {
        if (!this.map || this._isFetching) return;
        this._isFetching = true;
        let lat, lon;
        const cached = localStorage.getItem('userLocation');
        if (cached) {
            try {
                const loc = JSON.parse(cached);
                if (Date.now() - (loc.ts || 0) < 10 * 60 * 1000) {
                    lat = loc.latitude;
                    lon = loc.longitude;
                }
            } catch(e) {}
        }
        if (lat === undefined) {
            const c = this.map.getCenter();
            lat = c.lat;
            lon = c.lng;
        }
        try {
            const url = `${origin}/api/air/adsb/point/${lat.toFixed(4)}/${lon.toFixed(4)}/250`;
            console.time('[ADSB] API fetch');
            const resp = await fetch(url);
            console.timeEnd('[ADSB] API fetch');
            if (!resp.ok) {
                if (resp.status === 429) {
                    console.warn('[ADSB] Rate limited (429) — backing off 30s');
                    this._isFetching = false;
                    this._stopFetching();
                    setTimeout(() => { if (this.visible) this._startPolling(); }, 30000);
                    return;
                }
                this._isFetching = false;
                return;
            }
            this._fetchFailCount = 0;
            const data = await resp.json();
            console.log('[ADSB] aircraft count:', (data.ac || []).length);
            const aircraft = data.ac || [];
            const seen = new Set();

            this._geojson = {
                type: 'FeatureCollection',
                features: aircraft
                    .filter(a => a.lat != null && a.lon != null && !['A0', 'B0', 'C0'].includes((a.category || '').toUpperCase()))
                    .map(a => {
                        const alt = this._parseAlt(a.alt_baro);
                        const hex = a.hex || '';
                        seen.add(hex);

                        // Update trail history and store real position for interpolation
                        if (hex) {
                            if (!this._trails[hex]) this._trails[hex] = [];
                            const trail = this._trails[hex];
                            const last = trail[trail.length - 1];
                            const posChanged = !last || last.lon !== a.lon || last.lat !== a.lat;
                            if (posChanged) {
                                trail.push({ lon: a.lon, lat: a.lat, alt });
                                if (trail.length > this._MAX_TRAIL) trail.shift();
                            }
                            // Back-date lastSeen by seen_pos so ageSec reflects how long
                            // ago the position was actually recorded, not when we fetched it.
                            const seenAgoMs = (a.seen_pos ?? 0) * 1000;
                            const lastSeen = Date.now() - seenAgoMs;
                            const existing = this._lastPositions[hex];
                            if (!existing) {
                                this._lastPositions[hex] = {
                                    lon: a.lon, lat: a.lat,
                                    gs: a.gs ?? 0, track: a.track ?? null,
                                    lastSeen
                                };
                            } else {
                                existing.lon = a.lon;
                                existing.lat = a.lat;
                                existing.gs = a.gs ?? 0;
                                existing.track = a.track ?? null;
                                existing.lastSeen = lastSeen;
                            }
                        }

                        // Landing/departure detection for tracked aircraft.
                        if (hex) {
                            const prevAlt = this._prevAlt[hex];
                            const gs      = a.gs ?? 0;
                            const justLanded  = (prevAlt !== undefined && prevAlt > 0 && alt === 0);
                            if (justLanded) this._landedAt[hex] = Date.now();

                            // Record when this aircraft is observed on the ground while notifications enabled
                            if (alt === 0 && this._notifEnabled.has(hex)) {
                                this._seenOnGround[hex] = true;
                            }

                            // Departure: alt > 0 AND ground speed > 0 AND we haven't fired yet
                            // AND we previously saw this aircraft at alt===0 while notifications enabled
                            const justDeparted = (
                                alt > 0 && gs > 0 &&
                                !this._hasDeparted[hex] &&
                                this._seenOnGround[hex] &&
                                this._notifEnabled.has(hex)
                            );
                            this._prevAlt[hex] = alt;

                            // Reset departed flag and ground-seen flag when aircraft is back on ground
                            if (alt === 0) {
                                this._hasDeparted[hex] = false;
                            }

                            // Helper: nearest airport from AIRPORTS_DATA to a given lat/lon
                            const _nearestAirport = (lat, lon) => {
                                let best = null, bestDist = Infinity;
                                for (const f of AIRPORTS_DATA.features) {
                                    const [aLon, aLat] = f.geometry.coordinates;
                                    const dLat = (lat - aLat) * Math.PI / 180;
                                    const dLon = (lon - aLon) * Math.PI / 180;
                                    const a2 = Math.sin(dLat/2)**2 + Math.cos(aLat * Math.PI/180) * Math.cos(lat * Math.PI/180) * Math.sin(dLon/2)**2;
                                    const dist = 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1-a2));
                                    if (dist < bestDist) { bestDist = dist; best = f.properties; }
                                }
                                return best;
                            };

                            if (justDeparted) {
                                this._hasDeparted[hex] = true;
                                const callsign = (a.flight || '').trim() || (a.r || '').trim();
                                const apt      = _nearestAirport(a.lat, a.lon);
                                const aptStr   = apt ? `${apt.name} (${apt.icao})` : '';
                                const parts    = [];
                                if (aptStr) parts.push(aptStr);
                                _Notifications.add({
                                    type:   'departure',
                                    title:  callsign,
                                    detail: parts.join(' · '),
                                });
                            }

                            if (justLanded && this._notifEnabled.has(hex)) {
                                const callsign = (a.flight || '').trim() || (a.r || '').trim();
                                const apt      = _nearestAirport(a.lat, a.lon);
                                const aptStr   = apt ? `${apt.name} (${apt.icao})` : '';
                                const parts    = [];
                                if (aptStr) parts.push(aptStr);
                                _Notifications.add({
                                    type:   'flight',
                                    title:  callsign,
                                    detail: parts.join(' · '),
                                });
                                // Schedule removal from map after 1 minute
                                if (this._parkedTimers[hex]) clearTimeout(this._parkedTimers[hex]);
                                this._parkedTimers[hex] = setTimeout(() => {
                                    delete this._parkedTimers[hex];
                                    delete this._prevAlt[hex];
                                    delete this._hasDeparted[hex];
                                    delete this._trails[hex];
                                    delete this._lastPositions[hex];
                                    // Remove from geojson features
                                    this._geojson = {
                                        type: 'FeatureCollection',
                                        features: this._geojson.features.filter(f => f.properties.hex !== hex)
                                    };
                                    // Also rebuild interpolated features
                                    if (this._interpolatedFeatures) {
                                        this._interpolatedFeatures = this._interpolatedFeatures.filter(f => f.properties.hex !== hex);
                                    }
                                    // Remove callsign marker
                                    if (this._callsignMarkers[hex]) {
                                        this._callsignMarkers[hex].remove();
                                        delete this._callsignMarkers[hex];
                                    }
                                    // If this was the selected/tracked plane, deselect
                                    if (this._selectedHex === hex) {
                                        this._selectedHex = null;
                                        this._followEnabled = false;
                                        this._hideSelectedTag();
                                        this._hideStatusBar();
                                    }
                                    this._rebuildTrails();
                                    this._interpolate();
                                }, 60 * 1000);
                            }

                            // Cancel any pending removal timer if the plane goes airborne again
                            if (alt > 0 && this._parkedTimers[hex]) {
                                clearTimeout(this._parkedTimers[hex]);
                                delete this._parkedTimers[hex];
                            }
                        }

                        const gs = a.gs ?? 0;
                        const hexInt = parseInt(hex, 16);
                        const military = a.t !== 'LAAD'
                            && (a.military === true
                            || (hexInt >= 0x43C000 && hexInt <= 0x43FFFF)  // UK military
                            || (hexInt >= 0xAE0000 && hexInt <= 0xAFFFFF)); // US military

                        return {
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
                            properties: {
                                hex,
                                flight:       (a.flight || '').trim(),
                                r:            a.r || '',
                                t:            a.t || '',
                                alt_baro:     alt,
                                alt_geom:     a.alt_geom ?? null,
                                gs,
                                ias:          a.ias ?? null,
                                mach:         a.mach ?? null,
                                track:        a.track ?? 0,
                                baro_rate:    a.baro_rate ?? 0,
                                nav_altitude: a.nav_altitude_mcp ?? a.nav_altitude_fms ?? null,
                                nav_heading:  a.nav_heading ?? null,
                                category:     (a.category || '').toUpperCase(),
                                emergency:    a.emergency || '',
                                squawk:       a.squawk || '',
                                squawkEmerg:  this._emergencySquawks.has(a.squawk || '') ? 1 : 0,
                                rssi:         a.rssi ?? null,
                                military,
                            }
                        };
                    })
            };

            // Remove stale aircraft data
            for (const hex of Object.keys(this._trails)) {
                if (!seen.has(hex)) delete this._trails[hex];
            }
            for (const hex of Object.keys(this._lastPositions)) {
                if (!seen.has(hex)) delete this._lastPositions[hex];
            }
            for (const hex of Object.keys(this._prevAlt)) {
                if (!seen.has(hex) && !this._parkedTimers[hex]) delete this._prevAlt[hex];
            }
            for (const hex of Object.keys(this._hasDeparted)) {
                if (!seen.has(hex)) delete this._hasDeparted[hex];
            }

            // Clean up squawk state for aircraft that have left the feed
            for (const hex of Object.keys(this._prevSquawk)) {
                if (!seen.has(hex)) delete this._prevSquawk[hex];
            }

            // Squawk emergency detection — fire notifications on entry/exit of emergency codes
            for (const f of this._geojson.features) {
                const props  = f.properties;
                const hex    = props.hex;
                if (!hex) continue;
                const squawk = props.squawk || '';
                const prev   = this._prevSquawk[hex];
                const isEmerg = this._emergencySquawks.has(squawk);
                const wasEmerg = prev !== undefined && this._emergencySquawks.has(prev);

                if (squawk !== prev) {
                    if (isEmerg) {
                        // Entered emergency squawk
                        const callsign = (props.flight || '').trim() || (props.r || '').trim() || hex;
                        const squawkLabels = { '7700': 'General Emergency', '7600': 'Radio Failure / Lost Comm', '7500': 'Hijacking / Unlawful Interference' };
                        const now = new Date();
                        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const detail = [
                            `SQK ${squawk} — ${squawkLabels[squawk] || 'Emergency'}`,
                            props.alt_baro > 0 ? `ALT ${props.alt_baro.toLocaleString()} ft` : 'ON GROUND',
                            props.gs ? `GS ${Math.round(props.gs)} kt` : '',
                        ].filter(Boolean).join(' · ') + `\n${dateStr}  ${timeStr}`;
                        const coords = f.geometry.coordinates;
                        _Notifications.add({
                            type:   'emergency',
                            title:  callsign,
                            detail,
                            clickAction: () => {
                                if (this.map) {
                                    this.map.flyTo({ center: coords, zoom: Math.max(this.map.getZoom(), 9) });
                                }
                            },
                        });
                    } else if (wasEmerg) {
                        // Exited emergency squawk — announce the new code
                        const callsign = (props.flight || '').trim() || (props.r || '').trim() || hex;
                        const now = new Date();
                        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const newCode = squawk || '(none)';
                        _Notifications.add({
                            type:   'squawk-clr',
                            title:  callsign,
                            detail: `Squawk changed to ${newCode}  ·  ${dateStr}  ${timeStr}`,
                        });
                    }
                    this._prevSquawk[hex] = squawk;
                }
            }

            // Don't push raw API coords to the map — let the interpolation timer be the
            // sole writer so there's no backward snap when new data arrives.
            this._lastFetchTime = Date.now();

            // On first load, re-select any previously tracked plane.
            this._restoreTrackingState();

            // Rebuild trail and refresh data tag for selected aircraft
            this._rebuildTrails();
            if (this._tagHex && this._tagMarker) {
                const f = this._geojson.features.find(f => f.properties.hex === this._tagHex);
                if (f) {
                    const el = this._tagMarker.getElement();
                    el.innerHTML = this._buildTagHTML(f.properties);
                    this._wireTagButton(el);
                    this._updateStatusBar();
                } else {
                    this._hideSelectedTag();   // aircraft left the area
                    this._hideStatusBar();
                }
            }
            // Refresh HTML callsign markers for all aircraft.
            this._updateCallsignMarkers();
            // Keep ADS-B layers above all other map layers
            this._raiseLayers();
            this._fetchFailCount = 0;
        } catch(e) {
            console.timeEnd('[ADSB] API fetch'); // clear timer if fetch threw before timeEnd
            this._fetchFailCount++;
            if (this._fetchFailCount >= 3) {
                console.warn(`[ADSB] ${this._fetchFailCount} consecutive fetch failures — backing off 30s`);
                this._fetchFailCount = 0;
                this._isFetching = false;
                this._stopFetching();
                setTimeout(() => { if (this.visible) this._startPolling(); }, 30000);
                return;
            }
            console.warn('ADS-B fetch error:', e);
        } finally {
            this._isFetching = false;
        }
    }

    // Raise all ADS-B layers to the top of the map layer stack.
    _raiseLayers() {
        if (!this.map) return;
        ['adsb-trails', 'adsb-bracket', 'adsb-icons'].forEach(id => {
            try { this.map.moveLayer(id); } catch(e) {}
        });
    }

    _saveTrackingState() {
        try {
            const activeHex = this._tagHex || (this._followEnabled ? this._selectedHex : null);
            if (activeHex && this._followEnabled) {
                const prevHex = (() => { try { return JSON.parse(localStorage.getItem('adsbTracking') || '{}').hex; } catch(e) { return null; } })();
                if (prevHex && prevHex !== activeHex) {
                    fetch(`/api/air/tracking/${encodeURIComponent(prevHex)}`, { method: 'DELETE' }).catch(() => {});
                }
                localStorage.setItem('adsbTracking', JSON.stringify({ hex: activeHex }));
                const f = this._geojson.features.find(f => f.properties.hex === activeHex);
                const callsign = f ? ((f.properties.flight || '').trim() || (f.properties.r || '').trim() || '') : '';
                fetch('/api/air/tracking', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hex: activeHex, callsign, follow: true }),
                }).catch(() => {});
            } else {
                const prevHex = (() => { try { return JSON.parse(localStorage.getItem('adsbTracking') || '{}').hex; } catch(e) { return null; } })();
                localStorage.removeItem('adsbTracking');
                if (prevHex) {
                    fetch(`/api/air/tracking/${encodeURIComponent(prevHex)}`, { method: 'DELETE' }).catch(() => {});
                }
            }
        } catch(e) {}
    }

    _restoreTrackingState() {
        if (this._trackingRestored) return;
        this._trackingRestored = true;
        // Try backend first, fall back to localStorage
        fetch('/api/air/tracking')
            .then(r => r.ok ? r.json() : [])
            .then(rows => {
                const tracked = rows.find(r => r.follow);
                if (tracked) {
                    localStorage.setItem('adsbTracking', JSON.stringify({ hex: tracked.hex }));
                }
                this._doRestoreTracking();
            })
            .catch(() => this._doRestoreTracking());
    }

    _doRestoreTracking() {
        try {
            const saved = localStorage.getItem('adsbTracking');
            if (!saved) return;
            const { hex } = JSON.parse(saved);
            if (!hex) return;
            const f = this._geojson.features.find(f => f.properties.hex === hex);
            if (!f) return;
            this._selectedHex = hex;
            this._applySelection();
            // Activate follow/tracking mode
            this._followEnabled = true;
            this._saveTrackingState();
            this._notifEnabled.add(hex);
            // Re-attach action callbacks for any persisted tracking notifications
            // (callbacks are in-memory only and are lost on page refresh)
            try {
                const persisted = JSON.parse(localStorage.getItem('notifications') || '[]');
                if (!this._trackingNotifIds) this._trackingNotifIds = {};
                const restoredIds = [];
                for (const item of persisted) {
                    if (item.type === 'tracking') {
                        const notifHex = hex; // capture for callback closure
                        this._trackingNotifIds[notifHex] = item.id;
                        _Notifications.update({
                            id: item.id,
                            action: {
                                label: 'DISABLE NOTIFICATIONS',
                                callback: () => {
                                    this._notifEnabled.delete(notifHex);
                                    if (this._trackingNotifIds) delete this._trackingNotifIds[notifHex];
                                    this._rebuildTagForHex(notifHex);
                                },
                            },
                        });
                        restoredIds.push(item.id);
                    }
                }
                if (restoredIds.length) _Notifications.render(restoredIds);
            } catch(e) {}
            const coords = this._interpolatedCoords(hex) || f.geometry.coordinates;
            const newEl = document.createElement('div');
            newEl.innerHTML = this._buildTagHTML(f.properties);
            this._wireTagButton(newEl);
            if (this._tagMarker) { this._tagMarker.remove(); this._tagMarker = null; }
            this._tagMarker = new maplibregl.Marker({ element: newEl, anchor: 'left', offset: [14, 0] })
                .setLngLat(coords)
                .addTo(this.map);
            this._showStatusBar(f.properties);
            const is3D_r = typeof window._is3DActive === 'function' && window._is3DActive();
            this.map.easeTo({ center: f.geometry.coordinates, zoom: 16, ...(is3D_r ? { pitch: 45 } : {}), duration: 600 });
        } catch(e) {}
    }

    _startPolling() {
        // Skip the immediate fetch if a pre-fetch already completed recently
        // (within the last 4 seconds) to avoid a redundant API call.
        if (Date.now() - this._lastFetchTime > 4000) this._fetch();
        this._pollInterval = setInterval(() => this._fetch(), 5000);
        if (!this._interpolateInterval) {
            this._interpolateInterval = setInterval(() => this._interpolate(), 100);
        }
    }

    _stopPolling() {
        if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
        if (this._interpolateInterval) { clearInterval(this._interpolateInterval); this._interpolateInterval = null; }
    }

    _stopFetching() {
        if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
    }

    toggle() {
        this.visible = !this.visible;
        if (this.visible) {
            this._startPolling();
        } else {
            this._stopPolling();
            this._selectedHex = null;
            this._followEnabled = false;
            this._hideSelectedTag();
            this._hideHoverTag();
            this._hideStatusBar();
            // Only remove plane markers — GV and Tower markers stay visible
            for (const [hex, marker] of Object.entries(this._callsignMarkers)) {
                const f = this._geojson.features.find(f => f.properties.hex === hex);
                if (!f) continue;
                const cat = (f.properties.category || '').toUpperCase();
                const isGnd   = ['C1', 'C2'].includes(cat);
                const isTower = ['C3', 'C4', 'C5'].includes(cat) || (f.properties.t || '').toUpperCase() === 'TWR';
                if (!isGnd && !isTower) { marker.remove(); delete this._callsignMarkers[hex]; }
            }
        }
        // Trails layer has no non-plane items so hide/show it directly
        try { this.map.setLayoutProperty('adsb-trails', 'visibility', this.visible ? 'visible' : 'none'); } catch(e) {}
        this._applyTypeFilter();
        this.button.style.opacity = this.visible ? '1' : '0.3';
        this.button.style.color = this.visible ? '#c8ff00' : '#ffffff';
        if (adsbLabelsControl) adsbLabelsControl.syncToAdsb(this.visible);
        _saveOverlayStates();
    }
}

adsbControl = new AdsbLiveControl();
map.addControl(adsbControl, 'top-right');
window._adsb = adsbControl; // dev testing hook — see squawk-test.js
