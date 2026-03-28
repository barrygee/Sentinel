// ============================================================
// TRACKING — Shared panel component
// Manages the tracking panel: register/unregister tracked items
// from any domain (air, space, sea, land) and renders them all
// in a unified list inside #msb-pane-tracking.
// Mirrors the Notifications panel pattern.
//
// PUBLIC API:
//   register(opts)           — add a tracked item, opens panel
//   unregister(id)           — remove a tracked item
//   updateFields(id, fields) — update live data for an item
//   openPanel()              — open tracking tab in sidebar
//   closePanel()             — close tracking panel
//   toggle()                 — toggle open/close
//   setCount(n)              — manually set badge count (legacy)
//   init()                   — bootstrap on page load
//   isPanelOpen()            — check open state
//
// Exposed as window._Tracking so any script can call
// _Tracking.register() etc. without ES module imports.
// ============================================================
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
/// <reference path="../globals.d.ts" />
/// <reference path="../types.ts" />
window._Tracking = (function () {
    // Registry of currently tracked items, keyed by id
    var _items = new Map();
    function _getBtn() { return document.getElementById('tracking-toggle-btn'); }
    function _getCount() { return document.getElementById('tracking-count'); }
    function _getPane() { return document.getElementById('msb-pane-tracking'); }
    function _isPanelOpen() {
        var btn = _getBtn();
        return btn ? btn.classList.contains('tracking-btn-active') : false;
    }
    function _refreshBadge() {
        var n = _items.size;
        var el = _getCount();
        if (el) {
            el.textContent = n > 0 ? String(n) : '';
            if (n > 0 && !_isPanelOpen()) {
                el.classList.add('tracking-count-active');
            }
            else {
                el.classList.remove('tracking-count-active');
            }
        }
        var btn = _getBtn();
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
        }
    }
    // ---- Render ----
    function _buildItemHTML(opts) {
        var fieldsHTML = opts.fields.map(function (f) {
            return "<div class=\"adsb-sb-field\">" +
                "<span class=\"adsb-sb-label\">".concat(f.label, "</span>") +
                "<span class=\"adsb-sb-value".concat(f.emrg ? ' adsb-sb-emrg' : '', "\">").concat(f.value, "</span>") +
                "</div>";
        }).join('');
        return "<div class=\"adsb-sb-name-row\" data-tracking-id=\"".concat(opts.id, "\">") +
            "<div style=\"display:flex;flex-direction:column;gap:1px\">" +
            "<span class=\"adsb-sb-domain-label\">".concat(opts.domain, "</span>") +
            "<span class=\"adsb-sb-callsign\">".concat(opts.name, "</span>") +
            "</div>" +
            "<button class=\"adsb-sb-untrack-btn\" aria-label=\"Untrack\">UNTRACK</button>" +
            "</div>" +
            "<div class=\"adsb-sb-fields\">".concat(fieldsHTML, "</div>");
    }
    function _render() {
        var pane = _getPane();
        if (!pane)
            return;
        // Remove empty placeholder
        var empty = document.getElementById('msb-tracking-empty');
        if (empty && _items.size > 0)
            empty.style.display = 'none';
        else if (empty)
            empty.style.display = '';
        // Sync DOM: remove items no longer in registry
        pane.querySelectorAll('.tracking-item').forEach(function (el) {
            var _a;
            if (!_items.has((_a = el.dataset['trackingId']) !== null && _a !== void 0 ? _a : ''))
                el.remove();
        });
        // Add new items not yet in DOM
        var renderedIds = new Set(__spreadArray([], pane.querySelectorAll('.tracking-item'), true).map(function (el) { var _a; return (_a = el.dataset['trackingId']) !== null && _a !== void 0 ? _a : ''; }));
        _items.forEach(function (opts) {
            if (renderedIds.has(opts.id))
                return;
            var el = document.createElement('div');
            el.className = 'tracking-item adsb-status-bar adsb-sb-visible';
            el.dataset['trackingId'] = opts.id;
            el.innerHTML = _buildItemHTML(opts);
            _wireUntrack(el, opts);
            pane.appendChild(el);
        });
        _refreshBadge();
    }
    function _wireUntrack(el, opts) {
        var btn = el.querySelector('.adsb-sb-untrack-btn');
        if (!btn)
            return;
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            opts.onUntrack();
        });
    }
    // ---- Public API ----
    function register(opts) {
        _items.set(opts.id, opts);
        _render();
        openPanel();
    }
    function unregister(id) {
        _items.delete(id);
        var pane = _getPane();
        if (pane) {
            var el = pane.querySelector(".tracking-item[data-tracking-id=\"".concat(id, "\"]"));
            if (el)
                el.remove();
        }
        _refreshBadge();
        // Close panel if nothing left tracked
        if (_items.size === 0)
            closePanel();
    }
    function updateFields(id, fields) {
        var opts = _items.get(id);
        if (!opts)
            return;
        opts.fields = fields;
        var pane = _getPane();
        if (!pane)
            return;
        var el = pane.querySelector(".tracking-item[data-tracking-id=\"".concat(id, "\"]"));
        if (!el)
            return;
        var fieldsEl = el.querySelector('.adsb-sb-fields');
        if (fieldsEl) {
            fieldsEl.innerHTML = fields.map(function (f) {
                return "<div class=\"adsb-sb-field\">" +
                    "<span class=\"adsb-sb-label\">".concat(f.label, "</span>") +
                    "<span class=\"adsb-sb-value".concat(f.emrg ? ' adsb-sb-emrg' : '', "\">").concat(f.value, "</span>") +
                    "</div>";
            }).join('');
        }
    }
    // Legacy: allow domains to manually set count (no-op now, count derived from registry)
    function setCount(_n) { }
    function openPanel() {
        var btn = _getBtn();
        if (btn)
            btn.classList.add('tracking-btn-active');
        if (typeof window._MapSidebar !== 'undefined') {
            window._MapSidebar.show();
            window._MapSidebar.switchTab('tracking');
        }
        // Tab mutex: close notifications panel
        if (typeof window._Notifications !== 'undefined') {
            var nb = document.getElementById('notif-toggle-btn');
            if (nb)
                nb.classList.remove('notif-btn-active');
            try {
                localStorage.setItem('notificationsOpen', '0');
            }
            catch (e) { }
        }
        _refreshBadge();
    }
    function closePanel() {
        var wasOpen = _isPanelOpen();
        var btn = _getBtn();
        if (btn)
            btn.classList.remove('tracking-btn-active');
        if (wasOpen && typeof window._MapSidebar !== 'undefined') {
            var trackingPane = document.getElementById('msb-pane-tracking');
            var trackingTabActive = trackingPane ? trackingPane.classList.contains('msb-pane-active') : false;
            var notifOpen = typeof window._Notifications !== 'undefined' && window._Notifications.isPanelOpen();
            if (!notifOpen && trackingTabActive)
                window._MapSidebar.hide();
        }
        _refreshBadge();
    }
    function toggle() {
        if (_isPanelOpen())
            closePanel();
        else
            openPanel();
    }
    function init() {
        var btn = _getBtn();
        if (btn)
            btn.addEventListener('click', toggle);
        _refreshBadge();
    }
    return { openPanel: openPanel, closePanel: closePanel, toggle: toggle, init: init, setCount: setCount, isPanelOpen: _isPanelOpen, register: register, unregister: unregister, updateFields: updateFields };
})();
