"use strict";
// ============================================================
// SDR MINI PLAYER
// Compact, draggable SDR player component for use on any page.
// Exposes window._SdrMiniPlayer = { tune, show, hide }
//
// Depends on: sdr-globals.js, sdr-audio.js, sdr-boot.js
// Those must be loaded before this script on pages that use it.
// ============================================================
/// <reference path="./globals.d.ts" />
(function buildSdrMiniPlayer() {
    // ── Constants ────────────────────────────────────────────────────────────
    const SIGNAL_SEGS = 24;
    // ── DOM ──────────────────────────────────────────────────────────────────
    const el = document.createElement('div');
    el.id = 'sdr-mini-player';
    el.className = 'sdr-mini-player sdr-mini-hidden';
    el.innerHTML = `
        <div class="sdr-mini-drag-handle" id="sdr-mini-handle">
            <span class="sdr-mini-title" id="sdr-mini-title">SDR</span>
            <div class="sdr-mini-conn-dot sdr-mini-dot-off" id="sdr-mini-dot" title="Disconnected"></div>
            <button class="sdr-mini-close-btn" id="sdr-mini-close" title="Close">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </div>

        <div class="sdr-mini-body">

            <!-- Frequency + Mode row -->
            <div class="sdr-mini-freq-row">
                <span class="sdr-mini-freq-display" id="sdr-mini-freq">— MHz</span>
                <span class="sdr-mini-mode-badge" id="sdr-mini-mode">AM</span>
            </div>

            <!-- Signal meter -->
            <div class="sdr-mini-signal-bar" id="sdr-mini-signal-bar"></div>

            <!-- Controls row: volume | squelch | play/stop -->
            <div class="sdr-mini-controls-row">

                <div class="sdr-mini-slider-group">
                    <label class="sdr-mini-label">VOL</label>
                    <input class="sdr-mini-slider" id="sdr-mini-vol" type="range" min="0" max="200" step="1" value="80">
                    <span class="sdr-mini-slider-val" id="sdr-mini-vol-val">80%</span>
                </div>

                <div class="sdr-mini-slider-group">
                    <label class="sdr-mini-label">SQL</label>
                    <input class="sdr-mini-slider" id="sdr-mini-sq" type="range" min="-120" max="0" step="1" value="-120">
                    <span class="sdr-mini-slider-val" id="sdr-mini-sq-val">-120</span>
                </div>

                <div class="sdr-mini-play-btns">
                    <button class="sdr-mini-btn sdr-mini-play-btn" id="sdr-mini-play" title="Play">
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <polygon points="2,1 11,6 2,11" fill="currentColor"/>
                        </svg>
                    </button>
                    <button class="sdr-mini-btn sdr-mini-stop-btn" id="sdr-mini-stop" title="Stop" disabled>
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                            <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/>
                        </svg>
                    </button>
                </div>

            </div>
        </div>
    `;
    document.body.appendChild(el);
    // ── State ─────────────────────────────────────────────────────────────────
    let _freqHz = 0;
    let _mode = 'AM';
    let _playing = false;
    let _signalSmoothed = -120;
    // ── Element refs ─────────────────────────────────────────────────────────
    const titleEl = document.getElementById('sdr-mini-title');
    const dotEl = document.getElementById('sdr-mini-dot');
    const closeBtn = document.getElementById('sdr-mini-close');
    const freqEl = document.getElementById('sdr-mini-freq');
    const modeEl = document.getElementById('sdr-mini-mode');
    const signalBar = document.getElementById('sdr-mini-signal-bar');
    const volSlider = document.getElementById('sdr-mini-vol');
    const volVal = document.getElementById('sdr-mini-vol-val');
    const sqSlider = document.getElementById('sdr-mini-sq');
    const sqVal = document.getElementById('sdr-mini-sq-val');
    const playBtn = document.getElementById('sdr-mini-play');
    const stopBtn = document.getElementById('sdr-mini-stop');
    const handle = document.getElementById('sdr-mini-handle');
    // ── Signal bar segments ──────────────────────────────────────────────────
    const _segEls = [];
    for (let i = 0; i < SIGNAL_SEGS; i++) {
        const seg = document.createElement('div');
        seg.className = 'sdr-mini-seg';
        signalBar.appendChild(seg);
        _segEls.push(seg);
    }
    function updateSignalBar(dbfs) {
        const alpha = dbfs > _signalSmoothed ? 0.3 : 0.05;
        _signalSmoothed += alpha * (dbfs - _signalSmoothed);
        const lit = Math.round(Math.max(0, Math.min(SIGNAL_SEGS, ((_signalSmoothed + 120) / 120) * SIGNAL_SEGS)));
        for (let i = 0; i < SIGNAL_SEGS; i++) {
            _segEls[i].classList.toggle('sdr-mini-seg--on', i < lit);
        }
    }
    function resetSignalBar() {
        _signalSmoothed = -120;
        _segEls.forEach(s => s.classList.remove('sdr-mini-seg--on'));
    }
    // ── Connection dot ───────────────────────────────────────────────────────
    function setConnected(on) {
        dotEl.className = 'sdr-mini-conn-dot ' + (on ? 'sdr-mini-dot-on' : 'sdr-mini-dot-off');
        dotEl.title = on ? 'Connected' : 'Disconnected';
    }
    // ── Playing state ────────────────────────────────────────────────────────
    function setPlaying(playing) {
        _playing = playing;
        playBtn.disabled = playing;
        stopBtn.disabled = !playing;
        if (!playing)
            resetSignalBar();
    }
    // ── Play / stop ──────────────────────────────────────────────────────────
    function defaultBwHz(mode) {
        switch (mode) {
            case 'WFM': return 200000;
            case 'NFM': return 12500;
            case 'AM': return 10000;
            case 'USB':
            case 'LSB': return 3000;
            case 'CW': return 500;
            default: return 10000;
        }
    }
    function play() {
        if (!_freqHz)
            return;
        if (window._SdrAudio) {
            window._SdrAudio.initAudio(_sdrCurrentRadioId ?? undefined);
            window._SdrAudio.setMode(_mode);
            window._SdrAudio.setBandwidthHz(defaultBwHz(_mode));
            window._SdrAudio.setVolume(parseInt(volSlider.value, 10) / 100);
            window._SdrAudio.setSquelch(parseInt(sqSlider.value, 10));
        }
        if (_sdrSocket && _sdrSocket.readyState === WebSocket.OPEN) {
            _sdrSocket.send(JSON.stringify({ cmd: 'tune', frequency_hz: _freqHz }));
            _sdrSocket.send(JSON.stringify({ cmd: 'mode', mode: _mode }));
        }
        else if (!_sdrSocket || _sdrSocket.readyState === WebSocket.CLOSED) {
            const radioId = _sdrCurrentRadioId;
            if (radioId) {
                document.dispatchEvent(new CustomEvent('sdr-radio-selected', { detail: { radioId } }));
            }
        }
        sessionStorage.setItem('sdrLastFreqHz', String(_freqHz));
        sessionStorage.setItem('sdrLastMode', _mode);
        setPlaying(true);
    }
    function stop() {
        if (window._SdrAudio)
            window._SdrAudio.stop();
        setPlaying(false);
    }
    playBtn.addEventListener('click', play);
    stopBtn.addEventListener('click', stop);
    // ── Volume ────────────────────────────────────────────────────────────────
    volSlider.addEventListener('input', () => {
        const v = parseInt(volSlider.value, 10);
        volVal.textContent = `${v}%`;
        if (window._SdrAudio)
            window._SdrAudio.setVolume(v / 100);
    });
    // ── Squelch ──────────────────────────────────────────────────────────────
    let _sqDebounce = null;
    sqSlider.addEventListener('input', () => {
        const sq = parseInt(sqSlider.value, 10);
        sqVal.textContent = String(sq);
        if (_sqDebounce)
            clearTimeout(_sqDebounce);
        _sqDebounce = setTimeout(() => {
            if (_sdrSocket && _sdrSocket.readyState === WebSocket.OPEN) {
                _sdrSocket.send(JSON.stringify({ cmd: 'squelch', squelch_dbfs: sq }));
            }
            if (window._SdrAudio)
                window._SdrAudio.setSquelch(sq);
        }, 150);
    });
    // ── Signal updates from boot ─────────────────────────────────────────────
    // Listen to a custom event dispatched by sdr-boot when spectrum data arrives.
    // sdr-boot already calls window._SdrControls.updateSignalBar — we piggyback
    // via a separate event so we don't need to monkey-patch _SdrControls.
    document.addEventListener('sdr-mini:signal', (e) => {
        if (_playing)
            updateSignalBar(e.detail);
    });
    document.addEventListener('sdr-mini:connected', (e) => {
        setConnected(e.detail);
        if (!e.detail)
            setPlaying(false);
    });
    // ── Close ─────────────────────────────────────────────────────────────────
    closeBtn.addEventListener('click', () => {
        stop();
        hide();
    });
    // ── Dragging ─────────────────────────────────────────────────────────────
    let _dragOffX = 0, _dragOffY = 0, _dragging = false;
    handle.addEventListener('mousedown', (e) => {
        // Ignore clicks on close button
        if (e.target.closest('#sdr-mini-close'))
            return;
        _dragging = true;
        const rect = el.getBoundingClientRect();
        _dragOffX = e.clientX - rect.left;
        _dragOffY = e.clientY - rect.top;
        el.style.transition = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!_dragging)
            return;
        const x = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, e.clientX - _dragOffX));
        const y = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, e.clientY - _dragOffY));
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    });
    document.addEventListener('mouseup', () => { _dragging = false; });
    // ── Touch drag ───────────────────────────────────────────────────────────
    handle.addEventListener('touchstart', (e) => {
        if (e.target.closest('#sdr-mini-close'))
            return;
        _dragging = true;
        const t = e.touches[0];
        const rect = el.getBoundingClientRect();
        _dragOffX = t.clientX - rect.left;
        _dragOffY = t.clientY - rect.top;
        el.style.transition = 'none';
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!_dragging)
            return;
        const t = e.touches[0];
        const x = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, t.clientX - _dragOffX));
        const y = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, t.clientY - _dragOffY));
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    }, { passive: true });
    document.addEventListener('touchend', () => { _dragging = false; });
    // ── Public API ────────────────────────────────────────────────────────────
    function show() {
        el.classList.remove('sdr-mini-hidden');
    }
    function hide() {
        el.classList.add('sdr-mini-hidden');
    }
    /**
     * Tune the mini player to a frequency and show it.
     * @param freqHz   Frequency in Hz
     * @param mode     Demodulation mode (AM, NFM, WFM, USB, LSB, CW)
     * @param name     Display title (e.g. "Heathrow TWR")
     */
    function tune(freqHz, mode, name) {
        _freqHz = freqHz;
        _mode = mode || 'AM';
        titleEl.textContent = name || 'SDR';
        freqEl.textContent = (freqHz / 1e6).toFixed(3) + ' MHz';
        modeEl.textContent = _mode;
        setPlaying(false);
        show();
    }
    window._SdrMiniPlayer = { tune, show, hide, updateSignalBar, setConnected };
})();
