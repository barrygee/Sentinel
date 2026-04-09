// ============================================================
// SDR RADIO TAB
// Mounts the SDR panel content into the map-sidebar RADIO pane
// on non-SDR pages (air, space, sea, land).
//
// sdr-panel.js must be loaded before this script.
// Depends on: sdr-globals.js, sdr-panel.js, sdr-audio.js, sdr-mini-boot.js
// ============================================================

/// <reference path="./globals.d.ts" />

(function initSdrRadioTab() {

    // Only run on non-SDR pages
    if (document.body.dataset['domain'] === 'sdr') return;

    function mount() {
        const pane = document.getElementById('msb-pane-radio');
        if (!pane) return;

        // _buildSdrPanel is exposed by sdr-panel.js on non-SDR pages
        if (typeof (window as any)._buildSdrPanel === 'function') {
            (window as any)._buildSdrPanel(pane);
        }

        // Now that the panel is mounted and _sdrPopulateRadios is registered,
        // fetch radios and auto-connect. This guarantees no race condition.
        if (typeof (window as any)._sdrLoadRadios === 'function') {
            (window as any)._sdrLoadRadios();
        }
    }

    // Mount after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }

})();
