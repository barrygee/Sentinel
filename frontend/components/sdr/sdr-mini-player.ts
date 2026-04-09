// ============================================================
// SDR MINI PLAYER
// Inline footer bar player, available on all pages except SDR.
// Injected into #footer-left, slides in next to the radio button.
// Shows: device select, freq display, mode button, signal bar,
//        volume slider, squelch slider, play/stop, conn dot.
//
// Frequency is read-only — tuning happens via map clicks
// (calls _SdrMiniPlayer.tune()) or via the full SDR section.
//
// Depends on: sdr-globals.js, sdr-audio.js, sdr-mini-boot.js
// ============================================================

/// <reference path="./globals.d.ts" />

(function buildSdrMiniPlayer() {

    // Skip on the SDR page — full panel is used there
    if (document.body.dataset['domain'] === 'sdr') return;

    // ── Constants ────────────────────────────────────────────────────────────

    const SIGNAL_SEGS    = 16;
    const DEFAULT_SQUELCH = -120;
    const DEFAULT_VOLUME  = 80;
    const MODES = ['AM', 'NFM', 'WFM', 'USB', 'LSB', 'CW'];

    // ── DOM ──────────────────────────────────────────────────────────────────

    const el = document.createElement('div');
    el.id = 'sdr-mini-player';
    el.className = 'sdr-mini-hidden';
    el.innerHTML = `
        <div class="sdr-mini-divider"></div>
        <div class="sdr-mini-device-dropdown" id="sdr-mini-device-dropdown" tabindex="0" title="Select radio">
            <span class="sdr-mini-device-text" id="sdr-mini-device-text">—</span>
            <span class="sdr-mini-device-arrow"></span>
        </div>
        <span class="sdr-mini-freq-display" id="sdr-mini-freq-display">— MHz</span>
        <button class="sdr-mini-mode-btn" id="sdr-mini-mode-btn" title="Cycle mode">AM</button>
        <div class="sdr-mini-signal-bar" id="sdr-mini-signal-bar"></div>
        <div class="sdr-mini-slider-group" id="sdr-mini-vol-group" title="Volume">
            <span class="sdr-mini-slider-label">VOL</span>
            <input class="sdr-mini-slider" id="sdr-mini-vol" type="range" min="0" max="200" step="1" value="${DEFAULT_VOLUME}">
            <span class="sdr-mini-slider-val" id="sdr-mini-vol-val">${DEFAULT_VOLUME}%</span>
        </div>
        <div class="sdr-mini-slider-group" id="sdr-mini-sq-group" title="Squelch">
            <span class="sdr-mini-slider-label">SQL</span>
            <input class="sdr-mini-slider" id="sdr-mini-sq" type="range" min="-120" max="0" step="1" value="${DEFAULT_SQUELCH}">
            <span class="sdr-mini-slider-val" id="sdr-mini-sq-val">${DEFAULT_SQUELCH}</span>
        </div>
        <button class="sdr-mini-transport-btn sdr-mini-play-btn" id="sdr-mini-play" title="Play" disabled>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
        </button>
        <button class="sdr-mini-transport-btn sdr-mini-stop-btn" id="sdr-mini-stop" title="Stop" disabled>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/></svg>
        </button>
        <div class="sdr-mini-conn-dot sdr-mini-dot-off" id="sdr-mini-dot" title="Disconnected"></div>
    `;

    // Insert into footer-left after the radio button
    const footerLeft = document.getElementById('footer-left');
    if (footerLeft) {
        const radioBtn = document.getElementById('radio-mini-btn');
        if (radioBtn && radioBtn.nextSibling) {
            footerLeft.insertBefore(el, radioBtn.nextSibling);
        } else if (radioBtn) {
            footerLeft.appendChild(el);
        } else {
            footerLeft.appendChild(el);
        }
    } else {
        document.body.appendChild(el);
    }

    // ── State ─────────────────────────────────────────────────────────────────

    let _freqHz: number    = 0;
    let _modeIndex: number = 0;
    let _playing: boolean  = false;
    let _signalSmoothed    = -120;
    let _squelch: number   = DEFAULT_SQUELCH;
    let _volume: number    = DEFAULT_VOLUME;
    let _visible: boolean  = false;

    // ── Element refs ─────────────────────────────────────────────────────────

    const freqDisplay    = document.getElementById('sdr-mini-freq-display')! as HTMLSpanElement;
    const signalBar      = document.getElementById('sdr-mini-signal-bar')!   as HTMLDivElement;
    const modeBtn        = document.getElementById('sdr-mini-mode-btn')!     as HTMLButtonElement;
    const playBtn        = document.getElementById('sdr-mini-play')!         as HTMLButtonElement;
    const stopBtn        = document.getElementById('sdr-mini-stop')!         as HTMLButtonElement;
    const dotEl          = document.getElementById('sdr-mini-dot')!          as HTMLDivElement;
    const deviceDropdown = document.getElementById('sdr-mini-device-dropdown')! as HTMLDivElement;
    const deviceText     = document.getElementById('sdr-mini-device-text')!     as HTMLSpanElement;
    const volSlider      = document.getElementById('sdr-mini-vol')!  as HTMLInputElement;
    const volVal         = document.getElementById('sdr-mini-vol-val')! as HTMLSpanElement;
    const sqSlider       = document.getElementById('sdr-mini-sq')!   as HTMLInputElement;
    const sqVal          = document.getElementById('sdr-mini-sq-val')!  as HTMLSpanElement;

    // ── Signal bar ────────────────────────────────────────────────────────────

    const _segEls: HTMLDivElement[] = [];
    for (let i = 0; i < SIGNAL_SEGS; i++) {
        const seg = document.createElement('div');
        seg.className = 'sdr-mini-seg';
        signalBar.appendChild(seg);
        _segEls.push(seg);
    }

    function updateSignalBar(dbfs: number, squelchOpen?: boolean) {
        if (!_playing) { resetSignalBar(); return; }
        const alpha = dbfs > _signalSmoothed ? 0.3 : 0.05;
        _signalSmoothed += alpha * (dbfs - _signalSmoothed);
        // Use squelchOpen from the audio engine when provided; fall back to local squelch comparison
        const open = squelchOpen !== undefined ? squelchOpen : (_signalSmoothed > _squelch);
        const lit = open
            ? Math.round(Math.max(0, Math.min(SIGNAL_SEGS, ((_signalSmoothed + 120) / 120) * SIGNAL_SEGS)))
            : 0;
        for (let i = 0; i < SIGNAL_SEGS; i++) {
            _segEls[i].classList.toggle('sdr-mini-seg--on', i < lit);
        }
    }

    function resetSignalBar() {
        _signalSmoothed = -120;
        _segEls.forEach(s => s.classList.remove('sdr-mini-seg--on'));
    }

    // ── Volume slider ─────────────────────────────────────────────────────────

    volSlider.addEventListener('input', () => {
        _volume = parseInt(volSlider.value, 10);
        volVal.textContent = `${_volume}%`;
        if (window._SdrAudio) window._SdrAudio.setVolume(_volume / 100);
        sessionStorage.setItem('sdrMiniVolume', String(_volume));
    });

    // ── Squelch slider ────────────────────────────────────────────────────────

    let _sqDebounce: ReturnType<typeof setTimeout> | null = null;
    sqSlider.addEventListener('input', () => {
        _squelch = parseInt(sqSlider.value, 10);
        sqVal.textContent = String(_squelch);
        if (_sqDebounce) clearTimeout(_sqDebounce);
        _sqDebounce = setTimeout(() => {
            if (window._SdrAudio) window._SdrAudio.setSquelch(_squelch);
            if (_sdrSocket && _sdrSocket.readyState === WebSocket.OPEN) {
                _sdrSocket.send(JSON.stringify({ cmd: 'squelch', squelch_dbfs: _squelch }));
            }
            sessionStorage.setItem('sdrMiniSquelch', String(_squelch));
        }, 150);
    });

    // ── Device dropdown ───────────────────────────────────────────────────────

    let _deviceMenuEl: HTMLDivElement | null = null;
    let _deviceMenuOpen = false;
    let _knownRadios: SdrRadio[] = [];

    function buildDeviceMenu(radios: SdrRadio[]) {
        if (_deviceMenuEl) _deviceMenuEl.remove();
        _deviceMenuEl = document.createElement('div');
        _deviceMenuEl.className = 'sdr-device-menu sdr-device-menu--upward';

        const placeholder = document.createElement('div');
        placeholder.className = 'sdr-device-menu-item sdr-device-menu-placeholder';
        placeholder.textContent = '— select radio —';
        placeholder.addEventListener('click', () => {
            deviceText.textContent = '— select radio —';
            deviceText.classList.remove('sdr-device-dropdown-text--chosen');
            closeDeviceMenu();
            if (_playing) stop();
            _sdrCurrentRadioId = null;
            document.dispatchEvent(new CustomEvent('sdr-radio-deselected'));
        });
        _deviceMenuEl.appendChild(placeholder);

        radios.filter(r => r.enabled).forEach(r => {
            const item = document.createElement('div');
            item.className = 'sdr-device-menu-item';
            if (r.id === _sdrCurrentRadioId) item.classList.add('sdr-device-menu-item--active');
            item.textContent = r.name;
            item.dataset.value = String(r.id);
            item.addEventListener('click', () => {
                const wasPlaying = _playing;
                if (wasPlaying) stop();
                _sdrCurrentRadioId = r.id;
                sessionStorage.setItem('sdrLastRadioId', String(r.id));
                deviceText.textContent = r.name;
                deviceText.classList.add('sdr-device-dropdown-text--chosen');
                // Rebuild to update active marker
                buildDeviceMenu(_knownRadios);
                closeDeviceMenu();
                document.dispatchEvent(new CustomEvent('sdr-radio-selected', { detail: { radioId: r.id } }));
                if (wasPlaying && _freqHz) play();
            });
            _deviceMenuEl!.appendChild(item);
        });

        document.body.appendChild(_deviceMenuEl);
    }

    function positionDeviceMenu() {
        if (!_deviceMenuEl) return;
        const rect = deviceDropdown.getBoundingClientRect();
        // Open upward — anchor bottom of menu to top of dropdown
        _deviceMenuEl.style.left     = rect.left + 'px';
        _deviceMenuEl.style.bottom   = (window.innerHeight - rect.top) + 'px';
        _deviceMenuEl.style.top      = 'auto';
        _deviceMenuEl.style.minWidth = rect.width + 'px';
    }

    function openDeviceMenu() {
        if (!_deviceMenuEl) return;
        positionDeviceMenu();
        _deviceMenuEl.classList.add('sdr-device-menu--open');
        deviceDropdown.classList.add('sdr-device-dropdown--open');
        _deviceMenuOpen = true;
    }

    function closeDeviceMenu() {
        if (!_deviceMenuEl) return;
        _deviceMenuEl.classList.remove('sdr-device-menu--open');
        deviceDropdown.classList.remove('sdr-device-dropdown--open');
        _deviceMenuOpen = false;
    }

    deviceDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_deviceMenuOpen) closeDeviceMenu(); else openDeviceMenu();
    });

    deviceDropdown.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (_deviceMenuOpen) closeDeviceMenu(); else openDeviceMenu(); }
        if (e.key === 'Escape') closeDeviceMenu();
    });

    document.addEventListener('click', () => { if (_deviceMenuOpen) closeDeviceMenu(); });

    // ── Connection dot ────────────────────────────────────────────────────────

    function setConnected(on: boolean) {
        dotEl.className = 'sdr-mini-conn-dot ' + (on ? 'sdr-mini-dot-on' : 'sdr-mini-dot-off');
        dotEl.title = on ? 'Connected' : 'Disconnected';
    }

    // ── Frequency display ─────────────────────────────────────────────────────

    function displayFreq(hz: number) {
        freqDisplay.textContent = hz > 0 ? (hz / 1e6).toFixed(3) + ' MHz' : '— MHz';
    }

    // ── Mode button ───────────────────────────────────────────────────────────

    function currentMode(): string { return MODES[_modeIndex]; }

    function setModeIndex(idx: number) {
        _modeIndex = ((idx % MODES.length) + MODES.length) % MODES.length;
        modeBtn.textContent = currentMode();
    }

    function setModeByName(mode: string) {
        const idx = MODES.indexOf(mode);
        setModeIndex(idx >= 0 ? idx : 0);
    }

    modeBtn.addEventListener('click', () => {
        setModeIndex(_modeIndex + 1);
        const mode = currentMode();
        if (_playing) {
            if (window._SdrAudio) {
                window._SdrAudio.setMode(mode);
                window._SdrAudio.setBandwidthHz(defaultBwHz(mode));
            }
            if (_sdrSocket && _sdrSocket.readyState === WebSocket.OPEN) {
                _sdrSocket.send(JSON.stringify({ cmd: 'mode', mode }));
            }
        }
        sessionStorage.setItem('sdrLastMode', mode);
    });

    // ── Helpers ───────────────────────────────────────────────────────────────

    function defaultBwHz(mode: string): number {
        switch (mode) {
            case 'WFM': return 200_000;
            case 'NFM': return 12_500;
            case 'AM':  return 10_000;
            case 'USB': case 'LSB': return 3_000;
            case 'CW':  return 500;
            default:    return 10_000;
        }
    }

    // ── Playing state ─────────────────────────────────────────────────────────

    function setPlaying(playing: boolean) {
        _playing = playing;
        playBtn.disabled = playing || _freqHz === 0;
        stopBtn.disabled = !playing;
        if (!playing) resetSignalBar();
        sessionStorage.setItem('sdrPlaying', playing ? '1' : '0');
    }

    // ── Play / Stop ───────────────────────────────────────────────────────────

    function play() {
        if (!_freqHz) return;
        // Restore radio ID if cleared by a previous stop
        if (!_sdrCurrentRadioId) {
            const savedId = parseInt(sessionStorage.getItem('sdrLastRadioId') || '0', 10);
            if (savedId > 0) _sdrCurrentRadioId = savedId;
        }
        setPlaying(true);
        if (!_sdrCurrentRadioId) return; // no radio configured — UI armed, deferred to populateRadios
        const mode = currentMode();
        if (window._SdrAudio) {
            window._SdrAudio.initAudio(_sdrCurrentRadioId ?? undefined);
            window._SdrAudio.setMode(mode);
            window._SdrAudio.setBandwidthHz(defaultBwHz(mode));
            window._SdrAudio.setSquelch(_squelch);
            window._SdrAudio.setVolume(_volume / 100);
        }
        if (_sdrSocket && _sdrSocket.readyState === WebSocket.OPEN) {
            _sdrSocket.send(JSON.stringify({ cmd: 'tune', frequency_hz: _freqHz }));
            _sdrSocket.send(JSON.stringify({ cmd: 'mode', mode }));
        } else {
            document.dispatchEvent(new CustomEvent('sdr-radio-selected', { detail: { radioId: _sdrCurrentRadioId } }));
        }
    }

    function stop() {
        if (window._SdrAudio) window._SdrAudio.stop();
        document.dispatchEvent(new CustomEvent('sdr-radio-deselected'));
        setPlaying(false);
    }

    playBtn.addEventListener('click', play);
    stopBtn.addEventListener('click', stop);

    // ── Visibility ────────────────────────────────────────────────────────────

    function show() {
        _visible = true;
        el.classList.remove('sdr-mini-hidden');
        document.getElementById('radio-mini-btn')?.classList.add('radio-mini-btn-active');
        document.dispatchEvent(new CustomEvent('sdr-mini:visibility', { detail: true }));
        try { sessionStorage.setItem('sdrMiniVisible', '1'); } catch (_e) {}
    }

    function hide() {
        _visible = false;
        el.classList.add('sdr-mini-hidden');
        document.getElementById('radio-mini-btn')?.classList.remove('radio-mini-btn-active');
        document.dispatchEvent(new CustomEvent('sdr-mini:visibility', { detail: false }));
        try { sessionStorage.removeItem('sdrMiniVisible'); } catch (_e) {}
    }

    function toggle() {
        if (_visible) hide(); else show();
    }

    // ── Populate radios (called by sdr-mini-boot) ─────────────────────────────

    function populateRadios(radios: SdrRadio[]) {
        _knownRadios = radios;
        if (!_sdrCurrentRadioId) {
            const savedId = parseInt(sessionStorage.getItem('sdrLastRadioId') || '0', 10);
            const match = savedId > 0 ? radios.find(r => r.id === savedId && r.enabled) : null;
            const first = match || radios.find(r => r.enabled);
            if (first) _sdrCurrentRadioId = first.id;
        }
        // Sync dropdown label
        const selected = _sdrCurrentRadioId ? radios.find(r => r.id === _sdrCurrentRadioId) : null;
        if (selected) {
            deviceText.textContent = selected.name;
            deviceText.classList.add('sdr-device-dropdown-text--chosen');
        }
        buildDeviceMenu(radios);

        const wasPlaying = sessionStorage.getItem('sdrPlaying') === '1';
        const lastFreqHz = parseInt(sessionStorage.getItem('sdrLastFreqHz') || '0', 10);
        const lastMode   = sessionStorage.getItem('sdrLastMode') || 'AM';
        if (wasPlaying && lastFreqHz > 0 && _sdrCurrentRadioId) {
            _freqHz = lastFreqHz;
            setModeByName(lastMode);
            displayFreq(_freqHz);
            playBtn.disabled = false;
            show();
            document.dispatchEvent(new CustomEvent('sdr-radio-selected', { detail: { radioId: _sdrCurrentRadioId } }));
            setPlaying(true);
        } else if (_playing && _sdrCurrentRadioId && _freqHz) {
            // User pressed play before radios loaded — complete the connection now
            const mode = currentMode();
            if (window._SdrAudio) {
                window._SdrAudio.initAudio(_sdrCurrentRadioId);
                window._SdrAudio.setMode(mode);
                window._SdrAudio.setBandwidthHz(defaultBwHz(mode));
                window._SdrAudio.setSquelch(_squelch);
                window._SdrAudio.setVolume(_volume / 100);
            }
            document.dispatchEvent(new CustomEvent('sdr-radio-selected', { detail: { radioId: _sdrCurrentRadioId } }));
        }
    }

    // ── Signal / connection events from boot ─────────────────────────────────

    document.addEventListener('sdr-mini:signal', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        const dbfs = typeof detail === 'number' ? detail : detail.dbfs;
        const squelchOpen = typeof detail === 'object' ? detail.squelchOpen : undefined;
        if (_playing) updateSignalBar(dbfs, squelchOpen);
    });

    document.addEventListener('sdr-mini:connected', (e: Event) => {
        const on = (e as CustomEvent<boolean>).detail;
        setConnected(on);
        if (!on && _playing) setPlaying(false);
    });

    // ── sdr:state-change from full SDR panel ──────────────────────────────────

    document.addEventListener('sdr:state-change', (e: Event) => {
        const { freqHz, mode, playing } = (e as CustomEvent).detail as {
            freqHz: number; mode: string; playing: boolean;
        };
        if (freqHz) { _freqHz = freqHz; displayFreq(freqHz); }
        if (mode) setModeByName(mode);
        if (typeof playing === 'boolean') setPlaying(playing);
    });

    // ── Restore state on page load ────────────────────────────────────────────

    (function restoreState() {
        const lastFreqHz = parseInt(sessionStorage.getItem('sdrLastFreqHz') || '0', 10);
        const lastMode   = sessionStorage.getItem('sdrLastMode') || 'AM';
        const wasVisible = sessionStorage.getItem('sdrMiniVisible') === '1';
        const savedVol   = sessionStorage.getItem('sdrMiniVolume');
        const savedSq    = sessionStorage.getItem('sdrMiniSquelch');
        if (lastFreqHz > 0) {
            _freqHz = lastFreqHz;
            displayFreq(_freqHz);
            setModeByName(lastMode);
            playBtn.disabled = false;
        }
        if (savedVol !== null) {
            _volume = parseInt(savedVol, 10);
            volSlider.value = String(_volume);
            volVal.textContent = `${_volume}%`;
        }
        if (savedSq !== null) {
            _squelch = parseInt(savedSq, 10);
            sqSlider.value = String(_squelch);
            sqVal.textContent = String(_squelch);
        }
        if (wasVisible) show();
    })();

    // ── Signal bar wired into _SdrControls ───────────────────────────────────

    if (!window._SdrControls) {
        (window as any)._SdrControls = {} as SdrControlsAPI;
    }
    const _prev = window._SdrControls.updateSignalBar;
    window._SdrControls.updateSignalBar = (dbfs: number, squelchOpen?: boolean) => {
        if (_prev) _prev(dbfs, squelchOpen);
        if (_playing) updateSignalBar(dbfs, squelchOpen);
    };

    // ── Public API ────────────────────────────────────────────────────────────

    function tune(freqHz: number, mode: string, name?: string) {
        _freqHz = freqHz;
        displayFreq(freqHz);
        if (mode) setModeByName(mode);
        playBtn.disabled = false;
        sessionStorage.setItem('sdrLastFreqHz', String(freqHz));
        sessionStorage.setItem('sdrLastMode', currentMode());
        show();
        play();
    }

    (window as any)._SdrMiniPlayer = { tune, show, hide, toggle, updateSignalBar, setConnected, populateRadios };

})();
