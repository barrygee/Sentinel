// ============================================================
// BOOT / INITIALISATION
// Page startup sequence: geolocation watcher, subsystem init, logo animation.
// Must be loaded last, after all controls and components are constructed.
// Depends on: setUserLocation, _Notifications, _Tracking, _FilterPanel, map (global alias)
// ============================================================

// Continuously watch for location changes
if ('geolocation' in navigator) {
    console.log('[location] registering watchPosition');
    navigator.geolocation.watchPosition(
        setUserLocation,
        (error) => { console.error('[location] watchPosition error:', error.code, error.message); },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );
} else {
    console.warn('[location] geolocation not available in navigator');
}

// Restore 3D pitch state after map is fully loaded
map.once('load', () => {
    if (typeof window._is3DActive === 'function' && window._is3DActive()) {
        map.easeTo({ pitch: 45, duration: 400 });
    }
});

// Restore persisted landing notifications on page load
_Notifications.init();

// Initialise tracking panel toggle
_Tracking.init();

// Initialise filter panel
_FilterPanel.init();

// Global Ctrl+F / Cmd+F shortcut to toggle filter panel
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        _FilterPanel.toggle();
    }
});

// ---- Logo animation (bracket draw-in + typewriter) ----
// IIFE — runs once on load and re-plays on logo click.
// Restarts CSS animations on .logo-corner, .logo-bg, .logo-dot by forcing a reflow.
// playLogoAnimation() — inner function:
//   Cancels any in-flight timers, resets text, restarts CSS animations, then:
//   - after 1.23 s (corners + 2 bg pulses): typewriter types 'SENTINEL' at 75 ms/char
//   - after all chars: blinks cursor 6 times at 200 ms interval
// Side effects: mutates logoTextEl.textContent, element.style.animation; sets typeTimer, blinkTimer
(function () {
    const logoSvg    = document.getElementById('logo-img');
    const logoTextEl = document.getElementById('logo-text-el');
    if (!logoSvg || !logoTextEl) return;

    let typeTimer  = null;
    let blinkTimer = null;

    function playLogoAnimation() {
        // Cancel any in-flight timers from a previous run
        clearTimeout(typeTimer);
        clearInterval(blinkTimer);

        // Reset text
        logoTextEl.textContent = '';

        // Restart CSS animations on corners, bg pulse, and dot by forcing a reflow
        const corners = logoSvg.querySelectorAll('.logo-corner');
        const bg      = logoSvg.querySelector('.logo-bg');
        const dot     = logoSvg.querySelector('.logo-dot');
        [...corners, bg, dot].forEach(el => {
            el.style.animation = 'none';
            el.getBoundingClientRect(); // force reflow
            el.style.animation = '';
        });

        // Typewriter — starts after corners draw (0.43s) + 2 bg pulses (2×0.4s) = 1.23s
        const WORD = 'SENTINEL';
        let i = 0;
        function typeNext() {
            if (i < WORD.length) {
                logoTextEl.textContent = WORD.slice(0, ++i) + '|';
                typeTimer = setTimeout(typeNext, 75);
            } else {
                let blinks = 0;
                blinkTimer = setInterval(() => {
                    blinks++;
                    logoTextEl.textContent = WORD + (blinks % 2 === 0 ? '|' : ' ');
                    if (blinks >= 6) {
                        clearInterval(blinkTimer);
                        logoTextEl.textContent = WORD;
                    }
                }, 300);
            }
        }
        typeTimer = setTimeout(typeNext, 1250);
    }

    // Play on load
    playLogoAnimation();

    // Replay on click
    logoSvg.style.cursor = 'pointer';
    logoSvg.addEventListener('click', playLogoAnimation);
})();
