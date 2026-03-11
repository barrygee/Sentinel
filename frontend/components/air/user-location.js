// ============================================================
// USER LOCATION MARKER
// Animated SVG marker showing the user's position on the map.
// Handles GPS watchPosition, cached location, manual right-click pin,
// and reverse-geocode footer label (Nominatim, throttled 2 min).
// Depends on: map (global alias), maplibregl, rangeRingCenter, rangeRingsControl, _Notifications
// ============================================================

// Helper: fly to user's geolocation (uses rangeRingCenter which is kept live)
function goToUserLocation() {
    if (rangeRingCenter) {
        map.flyTo({ center: rangeRingCenter, zoom: 10 });
        if (_onGoToUserLocation) _onGoToUserLocation();
    } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 10 });
            if (_onGoToUserLocation) _onGoToUserLocation();
        });
    }
}

let userMarker;

function createMarkerElement(longitude, latitude) {
    const el = document.createElement('div');
    el.style.width = '60px';
    el.style.height = '60px';
    el.style.overflow = 'visible';
    el.style.position = 'relative';
    el.style.zIndex = '9999';
    el.classList.add('user-location-marker');

    // Circle circumference for stroke-dasharray draw-on animation
    const R = 13;
    const CIRC = +(2 * Math.PI * R).toFixed(2); // ~81.68

    const CY = 30;
    const BG_RIGHT = 97;
    // Background capped exactly to circle height (cy=30, r=13 → y=17 to y=43)
    const BG_Y1 = CY - R; // 17
    const BG_Y2 = CY + R; // 43
    // At top/bottom tangent points arcX = CY (sqrt(r²-r²) = 0)
    const arcX1 = CY;
    const arcX2 = CY;

    el.innerHTML = `<svg viewBox="0 0 120 60" width="120" height="60" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
        <!-- Coord background: left edge is concave arc matching circle, right edge is convex arc (pill cap) -->
        <path class="marker-coord-bg"
              d="M ${arcX1},${BG_Y1} A ${R},${R} 0 0,1 ${CY + R},${CY} A ${R},${R} 0 0,1 ${arcX2},${BG_Y2} L ${BG_RIGHT},${BG_Y2} A ${R},${R} 0 0,0 ${BG_RIGHT},${BG_Y1} Z"
              fill="black" opacity="0.75"
              style="clip-path:inset(0 100% 0 0)"/>
        <!-- Outer circle draws on -->
        <circle class="marker-ring" cx="${CY}" cy="${CY}" r="${R}" fill="none" stroke="#c8ff00" stroke-width="1.8"
                stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/>
        <!-- Centre dot -->
        <circle class="marker-dot" cx="${CY}" cy="${CY}" r="3.5" fill="white" opacity="0"/>
        <!-- Coordinates: centred vertically within the 26px panel (y17→43), baselines at 26 and 39 -->
        <text x="52" y="26" fill="white" font-size="7.5" font-family="monospace">
            <tspan class="marker-lat-label" fill="#c8ff00" font-size="6"></tspan><tspan class="marker-lat"></tspan>
        </text>
        <text x="52" y="39" fill="white" font-size="7.5" font-family="monospace">
            <tspan class="marker-lon-label" fill="#c8ff00" font-size="6"></tspan><tspan class="marker-lon"></tspan>
        </text>
    </svg>`;

    const ring        = el.querySelector('.marker-ring');
    const dot         = el.querySelector('.marker-dot');
    const coordBg     = el.querySelector('.marker-coord-bg');
    const latLabelEl  = el.querySelector('.marker-lat-label');
    const lonLabelEl  = el.querySelector('.marker-lon-label');
    const latEl       = el.querySelector('.marker-lat');
    const lonEl       = el.querySelector('.marker-lon');

    const LAT_LABEL = 'LAT ';
    const LON_LABEL = 'LON ';

    // Timers so we can cancel on re-trigger
    let timers = [];
    const after = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

    function cancelAll() {
        timers.forEach(clearTimeout);
        timers = [];
    }

    function playCoordSequence(latText, lonText) {
        // 1. Slide coord background in
        coordBg.style.clipPath = 'inset(0 100% 0 0)';
        coordBg.style.animation = 'none';
        coordBg.offsetWidth; // reflow
        coordBg.style.animation = 'marker-coord-bg-in 0.3s ease-out forwards';
        // Lock in the open state via inline style once animation completes so
        // MapLibre repaints can't reset the animation-forwards fill.
        coordBg.addEventListener('animationend', function onBgIn(e) {
            if (e.animationName !== 'marker-coord-bg-in') return;
            coordBg.removeEventListener('animationend', onBgIn);
            coordBg.style.animation = 'none';
            coordBg.style.clipPath = 'inset(0 0% 0 0)';
        });

        // 2. Type label then value on each line in parallel
        // Each line: type LAT_LABEL chars, then latText chars sequentially
        latLabelEl.textContent = '';
        lonLabelEl.textContent = '';
        latEl.textContent = '';
        lonEl.textContent = '';

        // Build full strings per line: label + value
        const latFull = LAT_LABEL + latText;
        const lonFull = LON_LABEL + lonText;
        let i = 0, j = 0;

        function typeStep() {
            let more = false;
            if (i < latFull.length) {
                const ch = latFull.slice(0, ++i);
                latLabelEl.textContent = ch.slice(0, Math.min(i, LAT_LABEL.length));
                latEl.textContent      = ch.slice(LAT_LABEL.length);
                more = true;
            }
            if (j < lonFull.length) {
                const ch = lonFull.slice(0, ++j);
                lonLabelEl.textContent = ch.slice(0, Math.min(j, LON_LABEL.length));
                lonEl.textContent      = ch.slice(LON_LABEL.length);
                more = true;
            }
            if (more) after(65, typeStep);
            else scheduleHideCoords(latFull, lonFull);
        }
        after(300, typeStep);
    }

    function scheduleHideCoords(latFull, lonFull) {
        // Hold 3 seconds then reverse
        after(3000, () => {
            // Erase character by character right-to-left (value first, then label)
            let i = latFull.length, j = lonFull.length;
            function eraseStep() {
                let more = false;
                if (i > 0) {
                    const ch = latFull.slice(0, --i);
                    latLabelEl.textContent = ch.slice(0, Math.min(i, LAT_LABEL.length));
                    latEl.textContent      = ch.slice(LAT_LABEL.length);
                    more = true;
                }
                if (j > 0) {
                    const ch = lonFull.slice(0, --j);
                    lonLabelEl.textContent = ch.slice(0, Math.min(j, LON_LABEL.length));
                    lonEl.textContent      = ch.slice(LON_LABEL.length);
                    more = true;
                }
                if (more) {
                    after(45, eraseStep);
                } else {
                    // All text erased — slide background out right→left
                    coordBg.style.clipPath = 'inset(0 0% 0 0)';
                    coordBg.style.animation = 'none';
                    coordBg.offsetWidth;
                    coordBg.style.animation = 'marker-coord-bg-out 0.3s ease-in forwards';
                    // Lock in the hidden state via inline style once animation completes.
                    coordBg.addEventListener('animationend', function onBgOut(e) {
                        if (e.animationName !== 'marker-coord-bg-out') return;
                        coordBg.removeEventListener('animationend', onBgOut);
                        coordBg.style.animation = 'none';
                        coordBg.style.clipPath = 'inset(0 100% 0 0)';
                    });
                    // After bg gone, pulse dot 3× fast (dips transparent, ends opaque)
                    after(300, () => {
                        dot.style.animation = 'none';
                        dot.offsetWidth;
                        dot.style.animation = 'marker-dot-end-pulse 0.18s ease-in-out 3 forwards';
                        after(540, () => {
                            el.dataset.animDone = '1';
                            el.style.zIndex = '0';
                        });
                    });
                }
            }
            eraseStep();
        });
    }

    function runIntroAnimation() {
        cancelAll();
        el.dataset.animDone = '0';
        el.style.zIndex = '9999';

        const latText = longitude !== undefined ? latitude.toFixed(3) : '';
        const lonText = longitude !== undefined ? longitude.toFixed(3) : '';

        // Reset states
        ring.style.strokeDashoffset = String(CIRC);
        ring.style.animation = 'none';
        dot.style.opacity = '0';
        dot.style.animation = 'none';
        dot.style.fill = 'white';
        coordBg.style.animation = 'none';
        coordBg.style.clipPath = 'inset(0 100% 0 0)';
        latLabelEl.textContent = '';
        lonLabelEl.textContent = '';
        latEl.textContent = '';
        lonEl.textContent = '';

        // Step 1: draw circle on (0.5s)
        after(20, () => {
            ring.style.animation = `marker-circle-draw 0.5s ease-out forwards`;
        });

        // Step 2: dot pulses twice (starts at 0.55s, 2× 0.2s = 0.4s)
        after(550, () => {
            dot.style.opacity = '1';
            dot.style.animation = 'marker-dot-pulse 0.2s ease-in-out 2 forwards';
        });

        // Step 3: coord background + typing (starts at 0.55 + 0.4 = 0.95s)
        after(950, () => playCoordSequence(latText, lonText));
    }

    // Store live coords on element for click handler
    el.dataset.lat = latitude !== undefined ? latitude.toFixed(3) : '';
    el.dataset.lon = longitude !== undefined ? longitude.toFixed(3) : '';

    // Click replays the coord sequence using current stored coords
    el.addEventListener('click', () => {
        const latText = el.dataset.lat || '';
        const lonText = el.dataset.lon || '';
        cancelAll();
        // Reset coord area
        coordBg.style.animation = 'none';
        coordBg.offsetWidth;
        coordBg.style.clipPath = 'inset(0 100% 0 0)';
        latLabelEl.textContent = '';
        lonLabelEl.textContent = '';
        latEl.textContent = '';
        lonEl.textContent = '';
        playCoordSequence(latText, lonText);
    });

    runIntroAnimation();

    // Expose so callers can re-trigger the intro animation (e.g. after a manual location set)
    el._replayIntro = runIntroAnimation;

    return el;
}

function setUserLocation(position) {
    const { longitude, latitude } = position.coords;
    const isFirstFix = !userMarker;
    console.log('[location] setUserLocation called', { longitude, latitude, isFirstFix, fromCache: !!position._fromCache });

    // Don't let a live GPS fix overwrite a manually-pinned location
    if (!position._fromCache && !position._manual) {
        try {
            const saved = JSON.parse(localStorage.getItem('userLocation') || 'null');
            if (saved && saved.manual) return;
        } catch (e) {}
    }

    // Add or update marker for user's location
    if (userMarker) {
        userMarker.setLngLat([longitude, latitude]);
        const el = userMarker.getElement();
        // Always keep live coords up to date for click replay
        el.dataset.lat = latitude.toFixed(3);
        el.dataset.lon = longitude.toFixed(3);
        // Re-run the intro animation when location is manually set
        if (position._manual && typeof el._replayIntro === 'function') el._replayIntro();
    } else {
        userMarker = new maplibregl.Marker({ element: createMarkerElement(longitude, latitude), anchor: 'center' })
            .setLngLat([longitude, latitude])
            .addTo(map);
    }

    // On the first live GPS fix, fly to the user's location so the marker is visible
    if (isFirstFix && !position._fromCache) {
        map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 10) });
    }

    // Update range rings centre to user's location
    rangeRingCenter = [longitude, latitude];
    if (rangeRingsControl) rangeRingsControl.updateCenter(longitude, latitude);

    // Cache the coordinates with a timestamp (manual flag preserved for right-click overrides)
    if (!position._manual) {
        try {
            const existing = JSON.parse(localStorage.getItem('userLocation') || 'null');
            if (existing && existing.manual) {
                // Don't overwrite a manual pin with a GPS/cache write
            } else {
                localStorage.setItem('userLocation', JSON.stringify({ longitude, latitude, ts: Date.now() }));
            }
        } catch (e) {
            localStorage.setItem('userLocation', JSON.stringify({ longitude, latitude, ts: Date.now() }));
        }
    }
    localStorage.setItem('geolocationGranted', 'true');

    // Update footer country via reverse geocoding (throttled to once per 2 minutes)
    const now = Date.now();
    if (now - setUserLocation._lastGeocode > 2 * 60 * 1000) {
        setUserLocation._lastGeocode = now;
        fetch(`/api/air/geocode/reverse?lat=${latitude}&lon=${longitude}`)
            .then(r => r.json())
            .then(data => {
                const country = data.address && data.address.country;
                if (country) {
                    const el = document.getElementById('footer-location');
                    if (el) el.textContent = country.toUpperCase();
                }
            })
            .catch(() => {});
    }
}
setUserLocation._lastGeocode = 0;

// Load cached location — manual overrides persist indefinitely, GPS cache expires after 5 minutes
const cachedLocation = localStorage.getItem('userLocation');
if (cachedLocation) {
    try {
        const { longitude, latitude, ts, manual } = JSON.parse(cachedLocation);
        if (manual || Date.now() - (ts || 0) < 5 * 60 * 1000) {
            setUserLocation({ coords: { longitude, latitude }, _fromCache: true });
        } else {
            localStorage.removeItem('userLocation');
        }
    } catch (e) {
        localStorage.removeItem('userLocation');
    }
}

// Right-click on map → context menu to set location manually
(function () {
    let _ctxMenu = null;

    function removeMenu() {
        if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
    }

    map.on('contextmenu', (e) => {
        removeMenu();

        const { lng, lat } = e.lngLat;

        const menu = document.createElement('div');
        menu.style.cssText = [
            'position:absolute',
            'background:#1a1a2e',
            'border:1px solid #444',
            'border-radius:4px',
            'padding:4px 0',
            'font-family:monospace',
            'font-size:12px',
            'color:#fff',
            'z-index:9999',
            'box-shadow:0 2px 8px rgba(0,0,0,.6)',
            'min-width:180px',
            'cursor:default',
        ].join(';');

        const point = e.point;
        menu.style.left = point.x + 'px';
        menu.style.top  = point.y + 'px';

        const item = document.createElement('div');
        item.textContent = 'Set my location here';
        item.style.cssText = 'padding:6px 14px;cursor:pointer;white-space:nowrap;';
        item.addEventListener('mouseenter', () => { item.style.background = '#2a2a4e'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('click', () => {
            removeMenu();
            // Save as manual override (no expiry)
            localStorage.setItem('userLocation', JSON.stringify({ longitude: lng, latitude: lat, ts: Date.now(), manual: true }));
            setUserLocation({ coords: { longitude: lng, latitude: lat }, _fromCache: false, _manual: true });
        });

        menu.appendChild(item);
        map.getContainer().appendChild(menu);
        _ctxMenu = menu;

        // Dismiss on any interaction
        const dismiss = () => { removeMenu(); };
        document.addEventListener('click', dismiss, { once: true });
        document.addEventListener('keydown', dismiss, { once: true });
        map.on('move', dismiss);
        map.on('zoom', dismiss);
    });
})();
