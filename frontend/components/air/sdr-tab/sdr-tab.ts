// ============================================================
// SDR TAB  (air section sidebar RADIO tab)
// Injects SDR radio controls into #msb-pane-radio and registers
// window._SdrMiniPlayer so existing callers (airports.ts,
// sdr-mini-boot.ts) work without modification.
//
// Must load BEFORE sdr-mini-player.js (which early-returns when
// it sees _SdrMiniPlayer is already set).
//
// Depends on: sdr-globals.js, sdr-audio.js, map-sidebar.js
// ============================================================

/// <reference path="../../globals.d.ts" />
/// <reference path="../../sdr/globals.d.ts" />

(function buildSdrTab() {

    // ── Constants ────────────────────────────────────────────────────────────

    const SIGNAL_SEGS     = 36;
    const DEFAULT_SQUELCH = -60;

    // ── State ─────────────────────────────────────────────────────────────────

    let _freqHz: number   = 0;
    let _mode:   string   = 'AM';
    let _playing: boolean = false;
    let _signalSmoothed   = -120;
    let _squelch: number  = DEFAULT_SQUELCH;

    // ── Inject HTML into #msb-pane-radio ─────────────────────────────────────

    function _inject() {
        const pane = document.getElementById('msb-pane-radio');
        if (!pane || pane.children.length > 0) return;

        pane.innerHTML = `
            <!-- ── DEVICE group ── -->
            <button class="sdr-group-toggle sdr-group-toggle-expanded" id="sdr-tab-device-toggle">
                <div class="sdr-scanner-section-left">
                    <span class="sdr-group-toggle-icon">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="sdr-group-toggle-label">DEVICE</span>
                </div>
                <div class="sdr-tab-status-right">
                    <div class="sdr-mini-conn-dot sdr-mini-dot-off" id="sdr-tab-dot" title="Disconnected"></div>
                </div>
            </button>
            <div class="sdr-group-body sdr-group-body-expanded" id="sdr-tab-device-body">

                <!-- Radio dropdown -->
                <div class="sdr-mini-section">
                    <div class="sdr-mini-device-dropdown" id="sdr-tab-device-dropdown" tabindex="0">
                        <div class="sdr-mini-device-selected">
                            <span class="sdr-mini-device-text" id="sdr-tab-device-text">— SELECT RADIO —</span>
                            <span class="sdr-mini-device-arrow"></span>
                        </div>
                    </div>
                    <select id="sdr-tab-radio" style="display:none"></select>
                </div>

                <!-- Bandwidth -->
                <div class="sdr-mini-section">
                    <div class="sdr-mini-slider-header">
                        <label class="sdr-mini-field-label">BANDWIDTH</label>
                        <span class="sdr-mini-slider-val" id="sdr-tab-bw-val">10 kHz</span>
                    </div>
                    <input class="sdr-mini-slider" id="sdr-tab-bw" type="range" min="1000" max="2048000" step="500" value="10000">
                </div>

                <!-- RF Gain -->
                <div class="sdr-mini-section">
                    <div class="sdr-mini-slider-header">
                        <label class="sdr-mini-field-label">RF GAIN</label>
                        <span class="sdr-mini-slider-val" id="sdr-tab-gain-val">30.0 dB</span>
                    </div>
                    <input class="sdr-mini-slider" id="sdr-tab-gain" type="range" min="-1" max="49" step="0.5" value="30">
                </div>

                <!-- AGC -->
                <div class="sdr-mini-section sdr-mini-agc-row">
                    <label class="sdr-mini-checkbox-label">
                        <input id="sdr-tab-agc" type="checkbox" class="sdr-mini-checkbox">
                        <span class="sdr-mini-checkbox-custom"></span>
                        <span class="sdr-mini-checkbox-text">AGC (Automatic Gain Control)</span>
                    </label>
                </div>

            </div>

            <!-- ── SIGNAL group ── -->
            <button class="sdr-group-toggle sdr-group-toggle-expanded" id="sdr-tab-signal-toggle">
                <div class="sdr-scanner-section-left">
                    <span class="sdr-group-toggle-icon">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="sdr-group-toggle-label">SIGNAL</span>
                </div>
            </button>
            <div class="sdr-group-body sdr-group-body-expanded" id="sdr-tab-signal-body">

                <!-- Frequency -->
                <div class="sdr-mini-section">
                    <label class="sdr-mini-field-label">FREQUENCY MHZ</label>
                    <div class="sdr-mini-freq-row">
                        <input id="sdr-tab-freq" class="sdr-mini-freq-input" type="text"
                               placeholder="100.000" autocomplete="off" spellcheck="false">
                        <button class="sdr-mini-pill sdr-mini-tune-btn" id="sdr-tab-play" title="Tune / Play">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
                        </button>
                        <button class="sdr-mini-pill sdr-mini-tune-btn sdr-mini-stop-btn" id="sdr-tab-stop" title="Stop" disabled>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/></svg>
                        </button>
                        <button class="sdr-mini-pill sdr-mini-tune-btn sdr-rec-btn" id="sdr-tab-rec" title="Record" disabled>
                            <svg id="sdr-tab-rec-icon" width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>
                        </button>
                    </div>
                    <span class="sdr-rec-timer" id="sdr-tab-rec-timer"></span>
                </div>

                <!-- Mode -->
                <div class="sdr-mini-section">
                    <label class="sdr-mini-field-label">MODE</label>
                    <div class="sdr-mini-mode-pills" id="sdr-tab-mode-pills">
                        <button class="sdr-mini-pill sdr-mini-mode-pill active" data-mode="AM">AM</button>
                        <button class="sdr-mini-pill sdr-mini-mode-pill" data-mode="NFM">NFM</button>
                        <button class="sdr-mini-pill sdr-mini-mode-pill" data-mode="WFM">WFM</button>
                        <button class="sdr-mini-pill sdr-mini-mode-pill" data-mode="USB">USB</button>
                        <button class="sdr-mini-pill sdr-mini-mode-pill" data-mode="LSB">LSB</button>
                        <button class="sdr-mini-pill sdr-mini-mode-pill" data-mode="CW">CW</button>
                    </div>
                </div>

                <!-- Signal meter -->
                <div class="sdr-mini-section">
                    <span class="sdr-mini-field-label">SIGNAL</span>
                    <div class="sdr-mini-signal-bar" id="sdr-tab-signal-bar"></div>
                </div>

                <!-- Volume -->
                <div class="sdr-mini-section">
                    <div class="sdr-mini-slider-header">
                        <label class="sdr-mini-field-label">VOLUME</label>
                        <span class="sdr-mini-slider-val" id="sdr-tab-vol-val">80%</span>
                    </div>
                    <input class="sdr-mini-slider" id="sdr-tab-vol" type="range" min="0" max="200" step="1" value="80">
                </div>

                <!-- Squelch -->
                <div class="sdr-mini-section">
                    <div class="sdr-mini-slider-header">
                        <label class="sdr-mini-field-label">SQUELCH</label>
                        <span class="sdr-mini-slider-val" id="sdr-tab-sq-val">${DEFAULT_SQUELCH} dBFS</span>
                    </div>
                    <input class="sdr-mini-slider" id="sdr-tab-sq" type="range" min="-120" max="0" step="1" value="${DEFAULT_SQUELCH}">
                </div>

            </div>

            <!-- ── RECORDING group ── -->
            <button class="sdr-group-toggle sdr-group-toggle-expanded" id="sdr-tab-recording-toggle">
                <div class="sdr-scanner-section-left">
                    <span class="sdr-group-toggle-icon">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="sdr-group-toggle-label">RECORDING</span>
                </div>
                <span id="sdr-tab-clips-count" class="sdr-clips-count"></span>
            </button>
            <div class="sdr-group-body sdr-group-body-expanded" id="sdr-tab-recording-body">
                <div class="sdr-clips-search-row">
                    <input id="sdr-tab-clips-search" class="sdr-panel-input sdr-clips-search-input" type="text" placeholder="Search clips…" autocomplete="off">
                </div>
                <div id="sdr-tab-clips-list-wrap">
                    <div id="sdr-tab-clips-list"></div>
                    <div id="sdr-tab-clips-empty" class="sdr-panel-empty" style="display:none">No recordings yet.<br>Use the REC button while listening.</div>
                </div>
                <div id="sdr-tab-clips-scroll-hint">MORE
                    <svg id="sdr-tab-clips-scroll-arrow" width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <polyline points="1,2.5 4,5.5 7,2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
            </div>

            <!-- ── EDIT RECORDING MODAL ── -->
            <div id="sdr-tab-rec-modal" class="sdr-modal-overlay" style="display:none">
                <div class="sdr-modal">
                    <div class="sdr-modal-title">EDIT CLIP</div>
                    <div class="sdr-modal-field">
                        <label class="sdr-field-label">NAME</label>
                        <input id="sdr-tab-recmod-name" class="sdr-panel-input sdr-modal-input" type="text" maxlength="120">
                    </div>
                    <div class="sdr-modal-field">
                        <label class="sdr-field-label">NOTES</label>
                        <textarea id="sdr-tab-recmod-notes" class="sdr-panel-input sdr-modal-input sdr-recmod-notes" rows="3" maxlength="500" placeholder="Optional notes…"></textarea>
                    </div>
                    <div class="sdr-modal-actions">
                        <button id="sdr-tab-recmod-cancel" class="sdr-panel-btn">CANCEL</button>
                        <button id="sdr-tab-recmod-save" class="sdr-panel-btn sdr-editfreq-save-btn">SAVE</button>
                    </div>
                </div>
            </div>

            <!-- ── DELETE RECORDING MODAL ── -->
            <div id="sdr-tab-rec-del-modal" class="sdr-modal-overlay" style="display:none">
                <div class="sdr-modal">
                    <div class="sdr-modal-title">DELETE CLIP?</div>
                    <div id="sdr-tab-recdelmod-msg" class="sdr-recdelmod-msg"></div>
                    <div class="sdr-modal-actions">
                        <button id="sdr-tab-recdelmod-cancel" class="sdr-panel-btn">CANCEL</button>
                        <button id="sdr-tab-recdelmod-confirm" class="sdr-panel-btn sdr-editfreq-del-btn">DELETE</button>
                    </div>
                </div>
            </div>
        `;

        _wireControls();
    }

    // ── Wire controls (called once after injection) ───────────────────────────

    function _wireControls() {

        // ── Element refs ─────────────────────────────────────────────────────

        const dotEl        = document.getElementById('sdr-tab-dot')!           as HTMLDivElement;
        const freqInput    = document.getElementById('sdr-tab-freq')!          as HTMLInputElement;
        const modePillsEl  = document.getElementById('sdr-tab-mode-pills')!    as HTMLDivElement;
        const signalBar    = document.getElementById('sdr-tab-signal-bar')!    as HTMLDivElement;
        const volSlider    = document.getElementById('sdr-tab-vol')!           as HTMLInputElement;
        const volVal       = document.getElementById('sdr-tab-vol-val')!       as HTMLSpanElement;
        const sqSlider     = document.getElementById('sdr-tab-sq')!            as HTMLInputElement;
        const sqVal        = document.getElementById('sdr-tab-sq-val')!        as HTMLSpanElement;
        const playBtn      = document.getElementById('sdr-tab-play')!          as HTMLButtonElement;
        const stopBtn      = document.getElementById('sdr-tab-stop')!          as HTMLButtonElement;
        const recBtn       = document.getElementById('sdr-tab-rec')!           as HTMLButtonElement;
        const recTimer     = document.getElementById('sdr-tab-rec-timer')!     as HTMLSpanElement;
        const radioSelect  = document.getElementById('sdr-tab-radio')!         as HTMLSelectElement;
        const bwSlider     = document.getElementById('sdr-tab-bw')!            as HTMLInputElement;
        const bwVal        = document.getElementById('sdr-tab-bw-val')!        as HTMLSpanElement;
        const gainSlider   = document.getElementById('sdr-tab-gain')!          as HTMLInputElement;
        const gainVal      = document.getElementById('sdr-tab-gain-val')!      as HTMLSpanElement;
        const agcCheck     = document.getElementById('sdr-tab-agc')!           as HTMLInputElement;
        const deviceDropdown = document.getElementById('sdr-tab-device-dropdown')! as HTMLDivElement;
        const deviceText   = document.getElementById('sdr-tab-device-text')!   as HTMLSpanElement;
        const clipsCount   = document.getElementById('sdr-tab-clips-count')!   as HTMLSpanElement;
        const clipsList    = document.getElementById('sdr-tab-clips-list')!    as HTMLDivElement;
        const clipsEmpty   = document.getElementById('sdr-tab-clips-empty')!   as HTMLDivElement;
        const recModal     = document.getElementById('sdr-tab-rec-modal')!     as HTMLDivElement;
        const recmodName   = document.getElementById('sdr-tab-recmod-name')!   as HTMLInputElement;
        const recmodNotes  = document.getElementById('sdr-tab-recmod-notes')!  as HTMLTextAreaElement;
        const recmodCancel = document.getElementById('sdr-tab-recmod-cancel')! as HTMLButtonElement;
        const recmodSave   = document.getElementById('sdr-tab-recmod-save')!   as HTMLButtonElement;
        const recDelModal  = document.getElementById('sdr-tab-rec-del-modal')! as HTMLDivElement;
        const recDelMsg    = document.getElementById('sdr-tab-recdelmod-msg')! as HTMLDivElement;
        const recDelCancel = document.getElementById('sdr-tab-recdelmod-cancel')!  as HTMLButtonElement;
        const recDelConfirm= document.getElementById('sdr-tab-recdelmod-confirm')! as HTMLButtonElement;

        // ── Accordion group toggles ───────────────────────────────────────────

        function bindGroupToggle(toggleId: string, bodyId: string) {
            const toggle = document.getElementById(toggleId) as HTMLButtonElement;
            const body   = document.getElementById(bodyId)   as HTMLDivElement;
            if (!toggle || !body) return;
            toggle.addEventListener('click', () => {
                const expanded = toggle.classList.contains('sdr-group-toggle-expanded');
                toggle.classList.toggle('sdr-group-toggle-expanded', !expanded);
                body.classList.toggle('sdr-group-body-expanded', !expanded);
            });
        }

        bindGroupToggle('sdr-tab-device-toggle',    'sdr-tab-device-body');
        bindGroupToggle('sdr-tab-signal-toggle',    'sdr-tab-signal-body');
        bindGroupToggle('sdr-tab-recording-toggle', 'sdr-tab-recording-body');

        // ── Signal bar ────────────────────────────────────────────────────────

        const _segEls: HTMLDivElement[] = [];
        for (let i = 0; i < SIGNAL_SEGS; i++) {
            const seg = document.createElement('div');
            seg.className = 'sdr-mini-seg';
            signalBar.appendChild(seg);
            _segEls.push(seg);
        }

        function updateSignalBar(dbfs: number) {
            const alpha = dbfs > _signalSmoothed ? 0.3 : 0.05;
            _signalSmoothed += alpha * (dbfs - _signalSmoothed);
            const lit = _signalSmoothed > _squelch
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

        // ── Connection dot ────────────────────────────────────────────────────

        function setConnected(on: boolean) {
            dotEl.className = 'sdr-mini-conn-dot ' + (on ? 'sdr-mini-dot-on' : 'sdr-mini-dot-off');
            dotEl.title = on ? 'Connected' : 'Disconnected';
        }

        // ── Recording state ───────────────────────────────────────────────────

        let _clips:           any[]   = [];
        let _clipsFilter              = '';
        let _isRecording              = false;
        let _recTimerInterval: ReturnType<typeof setInterval> | null = null;
        let _liveRecRow:      HTMLDivElement | null = null;
        let _recPausedMs              = 0;
        let _recPauseStart:   number | null = null;
        let _recSquelchOpen           = true;
        let _recStartEpoch            = 0;
        let _editingRecId:    number | null = null;
        let _deletingRecId:   number | null = null;
        let _knownRadios:     SdrRadio[] = [];

        // ── Playing state ─────────────────────────────────────────────────────

        function setPlaying(playing: boolean) {
            _playing = playing;
            playBtn.disabled = playing;
            stopBtn.disabled = !playing;
            recBtn.disabled  = !playing;
            if (!playing) {
                resetSignalBar();
                _stopRecordingIfActive();
            }
        }

        // ── Frequency helpers ─────────────────────────────────────────────────

        function parseFreqMhz(raw: string): number | null {
            const v = parseFloat(raw.replace(/[^\d.]/g, ''));
            if (isNaN(v) || v <= 0) return null;
            return v > 30000 ? Math.round(v) : Math.round(v * 1e6);
        }

        function displayFreq(hz: number) {
            if (document.activeElement !== freqInput) {
                freqInput.value = (hz / 1e6).toFixed(3);
            }
        }

        // ── Mode pills ────────────────────────────────────────────────────────

        function setModePill(mode: string) {
            modePillsEl.querySelectorAll<HTMLButtonElement>('.sdr-mini-mode-pill').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });
        }

        modePillsEl.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.sdr-mini-mode-pill');
            if (!btn || btn.disabled) return;
            _mode = btn.dataset.mode!;
            setModePill(_mode);
            if (_playing) {
                if (window._SdrAudio) {
                    window._SdrAudio.setMode(_mode);
                    window._SdrAudio.setBandwidthHz(defaultBwHz(_mode));
                }
                if (_sdrSocket && _sdrSocket.readyState === WebSocket.OPEN) {
                    _sdrSocket.send(JSON.stringify({ cmd: 'mode', mode: _mode }));
                }
            }
        });

        // ── Play / stop ───────────────────────────────────────────────────────

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

        function play() {
            const hz = parseFreqMhz(freqInput.value);
            if (!hz) return;
            _freqHz = hz;
            if (window._SdrAudio) {
                window._SdrAudio.initAudio(_sdrCurrentRadioId ?? undefined);
                window._SdrAudio.setMode(_mode);
                window._SdrAudio.setBandwidthHz(parseInt(bwSlider.value, 10));
                window._SdrAudio.setVolume(parseInt(volSlider.value, 10) / 100);
                window._SdrAudio.setSquelch(_squelch);
            }
            if (_sdrSocket && _sdrSocket.readyState === WebSocket.OPEN) {
                _sdrSocket.send(JSON.stringify({ cmd: 'tune', frequency_hz: _freqHz }));
                _sdrSocket.send(JSON.stringify({ cmd: 'mode', mode: _mode }));
            } else if (!_sdrSocket || _sdrSocket.readyState === WebSocket.CLOSED) {
                if (_sdrCurrentRadioId) {
                    document.dispatchEvent(new CustomEvent('sdr-radio-selected', { detail: { radioId: _sdrCurrentRadioId } }));
                }
            }
            sessionStorage.setItem('sdrLastFreqHz', String(_freqHz));
            sessionStorage.setItem('sdrLastMode', _mode);
            setPlaying(true);
        }

        function stop() {
            if (window._SdrAudio) window._SdrAudio.stop();
            setPlaying(false);
        }

        playBtn.addEventListener('click', play);
        stopBtn.addEventListener('click', stop);

        freqInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') play();
        });

        // ── Volume ─────────────────────────────────────────────────────────────

        volSlider.addEventListener('input', () => {
            const v = parseInt(volSlider.value, 10);
            volVal.textContent = `${v}%`;
            if (window._SdrAudio) window._SdrAudio.setVolume(v / 100);
        });

        // ── Squelch ────────────────────────────────────────────────────────────

        let _sqDebounce: ReturnType<typeof setTimeout> | null = null;
        sqSlider.addEventListener('input', () => {
            _squelch = parseInt(sqSlider.value, 10);
            sqVal.textContent = `${_squelch} dBFS`;
            if (_sqDebounce) clearTimeout(_sqDebounce);
            _sqDebounce = setTimeout(() => {
                if (_sdrSocket && _sdrSocket.readyState === WebSocket.OPEN) {
                    _sdrSocket.send(JSON.stringify({ cmd: 'squelch', squelch_dbfs: _squelch }));
                }
                if (window._SdrAudio) window._SdrAudio.setSquelch(_squelch);
            }, 150);
        });

        // ── Bandwidth ──────────────────────────────────────────────────────────

        function formatBwHz(hz: number): string {
            if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)} MHz`;
            if (hz >= 1_000)     return `${Math.round(hz / 1000)} kHz`;
            return `${hz} Hz`;
        }

        function snapToValidSampleRate(hz: number): number {
            if (hz <= 262500)  return 250000;
            if (hz <= 600000)  return 300000;
            if (hz <= 1474000) return 1024000;
            if (hz <= 1761000) return 1536000;
            if (hz <= 1921000) return 1792000;
            return 2048000;
        }

        let _bwDebounce: ReturnType<typeof setTimeout> | null = null;
        bwSlider.addEventListener('input', () => {
            const hz = parseInt(bwSlider.value, 10);
            bwVal.textContent = formatBwHz(hz);
            if (window._SdrAudio) window._SdrAudio.setBandwidthHz(hz);
            if (_bwDebounce) clearTimeout(_bwDebounce);
            _bwDebounce = setTimeout(() => {
                if (_sdrSocket && _sdrSocket.readyState === WebSocket.OPEN) {
                    _sdrSocket.send(JSON.stringify({ cmd: 'sample_rate', rate_hz: snapToValidSampleRate(hz) }));
                }
            }, 150);
        });

        // ── RF Gain / AGC ──────────────────────────────────────────────────────

        let _gainDebounce: ReturnType<typeof setTimeout> | null = null;

        function applyGain() {
            const auto = agcCheck.checked;
            gainSlider.disabled = auto;
            const g = parseFloat(gainSlider.value);
            gainVal.textContent = auto ? 'AUTO' : `${g.toFixed(1)} dB`;
            if (_gainDebounce) clearTimeout(_gainDebounce);
            _gainDebounce = setTimeout(() => {
                if (_sdrSocket && _sdrSocket.readyState === WebSocket.OPEN) {
                    _sdrSocket.send(JSON.stringify({ cmd: 'gain', gain_db: auto ? null : g }));
                }
            }, 150);
        }

        gainSlider.addEventListener('input', applyGain);
        agcCheck.addEventListener('change', applyGain);

        // ── Custom device dropdown ─────────────────────────────────────────────

        let _deviceMenuEl: HTMLDivElement | null = null;
        let _deviceMenuOpen = false;

        function buildDeviceMenu(radios: SdrRadio[]) {
            if (_deviceMenuEl) _deviceMenuEl.remove();
            _deviceMenuEl = document.createElement('div');
            _deviceMenuEl.className = 'sdr-mini-device-menu';

            const placeholder = document.createElement('div');
            placeholder.className = 'sdr-mini-device-menu-item sdr-mini-device-menu-placeholder';
            placeholder.textContent = '— select radio —';
            placeholder.addEventListener('click', () => {
                radioSelect.value = '';
                deviceText.textContent = '— SELECT RADIO —';
                deviceText.classList.remove('sdr-mini-device-text--chosen');
                closeDeviceMenu();
                stop();
                setConnected(false);
                _sdrCurrentRadioId = null;
                sessionStorage.removeItem('sdrLastRadioId');
                document.dispatchEvent(new CustomEvent('sdr-radio-deselected'));
            });
            _deviceMenuEl.appendChild(placeholder);

            radios.filter(r => r.enabled).forEach(r => {
                const item = document.createElement('div');
                item.className = 'sdr-mini-device-menu-item';
                item.textContent = r.name;
                item.addEventListener('click', () => {
                    radioSelect.value = String(r.id);
                    deviceText.textContent = r.name.toUpperCase();
                    deviceText.classList.add('sdr-mini-device-text--chosen');
                    closeDeviceMenu();
                    stop();
                    setConnected(false);
                    _sdrCurrentRadioId = r.id;
                    sessionStorage.setItem('sdrLastRadioId', String(r.id));
                    document.dispatchEvent(new CustomEvent('sdr-radio-selected', { detail: { radioId: r.id } }));
                });
                _deviceMenuEl!.appendChild(item);
            });

            document.body.appendChild(_deviceMenuEl);
        }

        function positionDeviceMenu() {
            if (!_deviceMenuEl) return;
            const rect = deviceDropdown.getBoundingClientRect();
            _deviceMenuEl.style.left  = rect.left + 'px';
            _deviceMenuEl.style.top   = rect.bottom + 'px';
            _deviceMenuEl.style.width = rect.width + 'px';
        }

        function openDeviceMenu() {
            if (!_deviceMenuEl) return;
            positionDeviceMenu();
            _deviceMenuEl.classList.add('sdr-mini-device-menu--open');
            deviceDropdown.classList.add('sdr-mini-device-dropdown--open');
            _deviceMenuOpen = true;
        }

        function closeDeviceMenu() {
            if (!_deviceMenuEl) return;
            _deviceMenuEl.classList.remove('sdr-mini-device-menu--open');
            deviceDropdown.classList.remove('sdr-mini-device-dropdown--open');
            _deviceMenuOpen = false;
        }

        deviceDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            if (_deviceMenuOpen) closeDeviceMenu(); else openDeviceMenu();
        });

        deviceDropdown.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _deviceMenuOpen ? closeDeviceMenu() : openDeviceMenu(); }
            if (e.key === 'Escape') closeDeviceMenu();
        });

        document.addEventListener('click', () => { if (_deviceMenuOpen) closeDeviceMenu(); });

        // ── Recording helpers ─────────────────────────────────────────────────

        function _escHtml(s: string): string {
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }
        function _fmtDuration(s: number): string {
            const m = Math.floor(s / 60), sec = Math.round(s % 60);
            return `${m}:${String(sec).padStart(2,'0')}`;
        }
        function _fmtBytes(b: number): string {
            if (b < 1024) return b + ' B';
            if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
            return (b / 1048576).toFixed(1) + ' MB';
        }

        function _setRecBtnIcon(recording: boolean) {
            const icon = document.getElementById('sdr-tab-rec-icon');
            if (!icon) return;
            icon.innerHTML = recording
                ? '<rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor"/>'
                : '<circle cx="5" cy="5" r="4" fill="currentColor"/>';
        }

        function _createLiveRecRow(metadata: SdrRecordingMetadata, startEpoch: number, squelchOpen = true): HTMLDivElement {
            const mhz = (metadata.frequency_hz / 1e6).toFixed(4);
            const now = new Date(startEpoch);
            const dt = now.toISOString().replace('T',' ').slice(0,16);
            const row = document.createElement('div');
            row.className = 'sdr-clip-row sdr-clip-live';
            row.innerHTML = `
                <div class="sdr-clip-header">
                    <span class="sdr-clip-live-dot${squelchOpen ? '' : ' sdr-clip-live-dot--waiting'}"></span>
                    <span class="sdr-clip-name">${squelchOpen ? 'Recording…' : 'Waiting for signal…'}</span>
                </div>
                <div class="sdr-clip-live-meta">
                    <span class="sdr-clip-live-mhz">${mhz} MHz</span>
                    &nbsp;·&nbsp;
                    <span class="sdr-clip-mode-inline">${_escHtml(metadata.mode)}</span>
                    &nbsp;·&nbsp;
                    <span class="sdr-clip-live-dur">0:00</span>
                    &nbsp;·&nbsp;
                    <span class="sdr-clip-live-sz">0 B</span>
                </div>
                <div class="sdr-clip-date">${dt}</div>
            `;
            return row;
        }

        function _updateLiveRecRow(elapsedS: number) {
            if (!_liveRecRow) return;
            (_liveRecRow.querySelector('.sdr-clip-name') as HTMLElement).textContent = _recSquelchOpen ? 'Recording…' : 'Waiting for signal…';
            (_liveRecRow.querySelector('.sdr-clip-live-dur') as HTMLElement).textContent = _fmtDuration(elapsedS);
            (_liveRecRow.querySelector('.sdr-clip-live-sz') as HTMLElement).textContent = _fmtBytes(elapsedS * 96000);
        }

        function _removeLiveRecRow() {
            if (_liveRecRow) { _liveRecRow.remove(); _liveRecRow = null; }
        }

        function _updateClipsScrollHint() {
            const hint = document.getElementById('sdr-tab-clips-scroll-hint');
            if (!hint) return;
            const wrap = document.getElementById('sdr-tab-clips-list-wrap')!;
            const hasOverflow = wrap.scrollHeight > wrap.clientHeight + 2;
            const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 4;
            hint.style.display = (hasOverflow && !atBottom) ? 'flex' : 'none';
        }

        document.getElementById('sdr-tab-clips-list-wrap')!
            .addEventListener('scroll', _updateClipsScrollHint);

        function renderClips() {
            const filter = _clipsFilter.toLowerCase();
            const visible = filter
                ? _clips.filter((c: any) =>
                    (c.name||'').toLowerCase().includes(filter) ||
                    (c.notes||'').toLowerCase().includes(filter) ||
                    (c.radio_name||'').toLowerCase().includes(filter) ||
                    (c.mode||'').toLowerCase().includes(filter))
                : _clips;
            clipsCount.textContent = _clips.length ? String(_clips.length) : '';
            clipsList.innerHTML = '';
            if (_liveRecRow) clipsList.appendChild(_liveRecRow);
            if (visible.length === 0) {
                clipsEmpty.style.display = _liveRecRow ? 'none' : 'block';
                return;
            }
            clipsEmpty.style.display = 'none';
            visible.forEach((c: any) => {
                const row = document.createElement('div');
                row.className = 'sdr-clip-row';
                const mhz = (c.frequency_hz / 1e6).toFixed(4);
                const dur = _fmtDuration(c.duration_s || 0);
                const sz  = _fmtBytes(c.file_size_bytes || 0);
                const dt  = c.started_at ? c.started_at.replace('T',' ').slice(0,16) : '';
                row.innerHTML = `
                    <div class="sdr-clip-header">
                        <span class="sdr-clip-name">${_escHtml(c.name)}</span>
                    </div>
                    <div class="sdr-clip-summary">${mhz} MHz &nbsp;·&nbsp; ${c.mode || ''} &nbsp;·&nbsp; ${dur} &nbsp;·&nbsp; ${sz}</div>
                    <div class="sdr-clip-body">
                        <div class="sdr-clip-meta">${mhz} MHz &nbsp;·&nbsp; ${c.mode || ''} &nbsp;·&nbsp; ${dur} &nbsp;·&nbsp; ${sz}</div>
                        <div class="sdr-clip-date">${dt}</div>
                        ${c.notes ? `<div class="sdr-clip-notes">${_escHtml(c.notes)}</div>` : ''}
                        <div class="sdr-clip-actions">
                            <button class="sdr-clip-play-btn sdr-panel-btn" data-id="${c.id}" title="Play">
                                <svg class="sdr-clip-btn-icon sdr-clip-play-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg>
                                <svg class="sdr-clip-btn-icon sdr-clip-stop-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style="display:none"><rect x="1.5" y="1.5" width="3" height="7"/><rect x="5.5" y="1.5" width="3" height="7"/></svg>
                            </button>
                            <button class="sdr-clip-edit-btn sdr-panel-btn" data-id="${c.id}" title="Edit">
                                <svg class="sdr-clip-btn-icon" width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5z"/></svg>
                            </button>
                            <button class="sdr-clip-export-btn sdr-panel-btn" data-id="${c.id}" data-name="${_escHtml(c.name)}" title="Download WAV">
                                <svg class="sdr-clip-btn-icon" width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 1v6M2.5 7l3 3 3-3"/><line x1="1" y1="10" x2="10" y2="10"/></svg>
                            </button>
                            ${c.has_iq_file ? `<button class="sdr-clip-iq-btn sdr-panel-btn" data-id="${c.id}" title="Download IQ">IQ</button>` : ''}
                            <button class="sdr-clip-del-btn sdr-panel-btn" data-id="${c.id}" title="Delete">
                                <svg class="sdr-clip-btn-icon" width="10" height="11" viewBox="0 0 10 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h8M4 3V2h2v1M8 3l-.7 7H2.7L2 3"/></svg>
                            </button>
                        </div>
                        <div id="sdr-tab-clip-player-${c.id}" class="sdr-clip-player" style="display:none">
                            <span class="sdr-clip-time-cur" id="sdr-tab-clip-cur-${c.id}">00:00</span>
                            <input type="range" class="sdr-clip-seek sdr-panel-slider" id="sdr-tab-clip-seek-${c.id}" value="0" min="0" step="0.01">
                            <span class="sdr-clip-time-dur" id="sdr-tab-clip-dur-${c.id}">00:00</span>
                        </div>
                    </div>
                    <audio id="sdr-tab-clip-audio-${c.id}" style="display:none" src="/api/sdr/recordings/${c.id}/file"></audio>
                `;
                clipsList.appendChild(row);

                const headerEl = row.querySelector('.sdr-clip-header')!;
                const bodyEl   = row.querySelector('.sdr-clip-body') as HTMLElement;
                function expandBody() {
                    row.classList.add('sdr-clip-expanded');
                    bodyEl.style.maxHeight = bodyEl.scrollHeight + 'px';
                    bodyEl.addEventListener('transitionend', function clear() {
                        bodyEl.style.maxHeight = 'none';
                        bodyEl.removeEventListener('transitionend', clear);
                    });
                }
                function collapseBody() {
                    bodyEl.style.maxHeight = bodyEl.scrollHeight + 'px';
                    requestAnimationFrame(() => {
                        bodyEl.style.maxHeight = '0';
                        row.classList.remove('sdr-clip-expanded');
                    });
                }
                expandBody();
                headerEl.addEventListener('click', () => {
                    if (row.classList.contains('sdr-clip-expanded')) collapseBody();
                    else expandBody();
                });

                const playBtn2 = row.querySelector('.sdr-clip-play-btn') as HTMLButtonElement;
                const audio    = document.getElementById(`sdr-tab-clip-audio-${c.id}`) as HTMLAudioElement;
                const player   = document.getElementById(`sdr-tab-clip-player-${c.id}`) as HTMLElement;
                const seekEl   = document.getElementById(`sdr-tab-clip-seek-${c.id}`) as HTMLInputElement;
                const curEl    = document.getElementById(`sdr-tab-clip-cur-${c.id}`) as HTMLElement;
                const durEl    = document.getElementById(`sdr-tab-clip-dur-${c.id}`) as HTMLElement;
                const playIcon = playBtn2.querySelector('.sdr-clip-play-icon') as HTMLElement;
                const stopIcon2 = playBtn2.querySelector('.sdr-clip-stop-icon') as HTMLElement;
                function fmtT(s: number) {
                    const m = Math.floor(s/60), sec = Math.floor(s%60);
                    return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
                }
                function setClipPlaying(on: boolean) {
                    playIcon.style.display = on ? 'none' : '';
                    stopIcon2.style.display = on ? '' : 'none';
                    player.style.display = on ? 'flex' : 'none';
                }
                playBtn2.addEventListener('click', function() {
                    if (!audio.paused || (audio.currentTime > 0 && player.style.display !== 'none')) {
                        audio.pause(); audio.currentTime = 0; setClipPlaying(false);
                    } else {
                        audio.play(); setClipPlaying(true);
                    }
                });
                audio.addEventListener('loadedmetadata', () => {
                    seekEl.max = String(audio.duration || 0);
                    durEl.textContent = fmtT(audio.duration || 0);
                });
                audio.addEventListener('timeupdate', () => {
                    seekEl.value = String(audio.currentTime);
                    curEl.textContent = fmtT(audio.currentTime);
                });
                audio.addEventListener('ended', () => { audio.currentTime = 0; setClipPlaying(false); });
                seekEl.addEventListener('input', () => { audio.currentTime = parseFloat(seekEl.value); });

                (row.querySelector('.sdr-clip-edit-btn') as HTMLButtonElement)
                    .addEventListener('click', () => openEditRecModal(c));
                (row.querySelector('.sdr-clip-export-btn') as HTMLButtonElement)
                    .addEventListener('click', () => {
                        const a = document.createElement('a');
                        a.href = `/api/sdr/recordings/${c.id}/file`;
                        a.download = `${c.name}.wav`;
                        a.click();
                    });
                if (c.has_iq_file) {
                    (row.querySelector('.sdr-clip-iq-btn') as HTMLButtonElement)
                        .addEventListener('click', () => {
                            const a = document.createElement('a');
                            a.href = `/api/sdr/recordings/${c.id}/iq`;
                            a.download = `${c.name}.u8`;
                            a.click();
                        });
                }
                (row.querySelector('.sdr-clip-del-btn') as HTMLButtonElement)
                    .addEventListener('click', () => openDeleteRecModal(c));
            });
            setTimeout(_updateClipsScrollHint, 0);
        }

        async function reloadClips() {
            try {
                const res = await fetch('/api/sdr/recordings', { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                _clips = await res.json();
            } catch(e) { console.error('[SDR-TAB] reloadClips failed:', e); }
            renderClips();
        }

        async function _stopRecordingIfActive() {
            if (!_isRecording) return;
            _isRecording = false;
            if (_recTimerInterval) { clearInterval(_recTimerInterval); _recTimerInterval = null; }
            recBtn.classList.remove('sdr-rec-btn--active');
            _setRecBtnIcon(false);
            recTimer.textContent = '';
            if (!window._SdrAudio) return;
            const radioId = _sdrCurrentRadioId;
            const radioName = radioId ? (_knownRadios.find(r => r.id === radioId) || {} as any).name || '' : '';
            const metadata: SdrRecordingMetadata = {
                radio_id:     radioId,
                radio_name:   radioName,
                frequency_hz: _freqHz   || 0,
                mode:         _mode     || 'AM',
                gain_db:      _sdrCurrentGain   || 30,
                squelch_dbfs: _squelch  || -60,
                sample_rate:  _sdrCurrentSampleRate || 2048000,
            };
            await window._SdrAudio.stopRecording(metadata);
            _removeLiveRecRow();
            await reloadClips();
            setTimeout(reloadClips, 2000);
            const recGroupToggle = document.getElementById('sdr-tab-recording-toggle');
            const recGroupBody   = document.getElementById('sdr-tab-recording-body');
            if (recGroupToggle && !recGroupToggle.classList.contains('sdr-group-toggle-expanded')) {
                recGroupToggle.classList.add('sdr-group-toggle-expanded');
                recGroupBody!.classList.add('sdr-group-body-expanded');
            }
        }

        // Edit recording modal
        function openEditRecModal(c: any) {
            _editingRecId = c.id;
            recmodName.value  = c.name  || '';
            recmodNotes.value = c.notes || '';
            recModal.style.display = 'flex';
            recmodName.focus();
        }
        function closeEditRecModal() {
            recModal.style.display = 'none';
            _editingRecId = null;
        }
        recmodCancel.addEventListener('click', closeEditRecModal);
        recModal.addEventListener('click', (e) => { if (e.target === recModal) closeEditRecModal(); });
        recmodSave.addEventListener('click', async () => {
            const name = recmodName.value.trim();
            if (!name || _editingRecId === null) return;
            try {
                await fetch(`/api/sdr/recordings/${_editingRecId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, notes: recmodNotes.value.trim() }),
                });
                closeEditRecModal();
                await reloadClips();
            } catch(_) {}
        });

        // Delete recording modal
        function openDeleteRecModal(c: any) {
            _deletingRecId = c.id;
            recDelMsg.textContent = `Delete "${c.name}"? This cannot be undone.`;
            recDelModal.style.display = 'flex';
        }
        function closeDeleteRecModal() {
            recDelModal.style.display = 'none';
            _deletingRecId = null;
        }
        recDelCancel.addEventListener('click', closeDeleteRecModal);
        recDelModal.addEventListener('click', (e) => { if (e.target === recDelModal) closeDeleteRecModal(); });
        recDelConfirm.addEventListener('click', async () => {
            if (_deletingRecId === null) return;
            try {
                await fetch(`/api/sdr/recordings/${_deletingRecId}`, { method: 'DELETE' });
                closeDeleteRecModal();
                await reloadClips();
            } catch(_) {}
        });

        // Clips search
        document.getElementById('sdr-tab-clips-search')!
            .addEventListener('input', (e) => {
                _clipsFilter = (e.target as HTMLInputElement).value;
                renderClips();
            });

        // Record button
        recBtn.addEventListener('click', async () => {
            if (!_isRecording) {
                const radioId = _sdrCurrentRadioId;
                const radioName = radioId
                    ? (_knownRadios.find(r => r.id === radioId) || {} as any).name || ''
                    : '';
                const metadata: SdrRecordingMetadata = {
                    radio_id:     radioId,
                    radio_name:   radioName,
                    frequency_hz: _freqHz   || 0,
                    mode:         _mode     || 'AM',
                    gain_db:      _sdrCurrentGain   || 30,
                    squelch_dbfs: _squelch  || -60,
                    sample_rate:  _sdrCurrentSampleRate || 2048000,
                };
                if (!window._SdrAudio) return;
                const recId = await window._SdrAudio.startRecording(metadata);
                if (!recId) return;
                _isRecording   = true;
                _recStartEpoch = Date.now();
                _recPausedMs   = 0;
                const squelchActive = (metadata.squelch_dbfs ?? -120) > -119;
                _recSquelchOpen = !squelchActive;
                _recPauseStart  = squelchActive ? Date.now() : null;
                clipsCount.textContent = '';
                recBtn.classList.add('sdr-rec-btn--active');
                _setRecBtnIcon(true);
                recTimer.textContent = _recSquelchOpen ? '0:00' : '0:00 WAIT';
                _removeLiveRecRow();
                _liveRecRow = _createLiveRecRow(metadata, _recStartEpoch, _recSquelchOpen);
                clipsEmpty.style.display = 'none';
                clipsList.insertBefore(_liveRecRow, clipsList.firstChild);
                _recTimerInterval = setInterval(() => {
                    const pausedSoFar = _recPauseStart != null
                        ? _recPausedMs + (Date.now() - _recPauseStart)
                        : _recPausedMs;
                    const s = Math.floor((Date.now() - _recStartEpoch - pausedSoFar) / 1000);
                    recTimer.textContent = _recSquelchOpen ? _fmtDuration(s) : _fmtDuration(s) + ' WAIT';
                    _updateLiveRecRow(s);
                }, 1000);
            } else {
                await _stopRecordingIfActive();
            }
        });

        reloadClips();

        // ── Populate radios ────────────────────────────────────────────────────

        function populateRadios(radios: SdrRadio[]) {
            _knownRadios = radios;
            while (radioSelect.options.length > 0) radioSelect.remove(0);
            const def = document.createElement('option');
            def.value = '';
            def.textContent = '— select radio —';
            radioSelect.appendChild(def);
            radios.filter(r => r.enabled).forEach(r => {
                const opt = document.createElement('option');
                opt.value = String(r.id);
                opt.textContent = r.name;
                radioSelect.appendChild(opt);
            });

            buildDeviceMenu(radios);

            const savedId = _sdrCurrentRadioId != null ? String(_sdrCurrentRadioId) : '';
            if (savedId) {
                const radio = radios.find(r => r.enabled && String(r.id) === savedId);
                if (radio) {
                    radioSelect.value = savedId;
                    deviceText.textContent = radio.name.toUpperCase();
                    deviceText.classList.add('sdr-mini-device-text--chosen');
                }
            }
        }

        // ── Signal bar: chain onto _SdrControls ───────────────────────────────

        if (!window._SdrControls) {
            (window as any)._SdrControls = {} as SdrControlsAPI;
        }
        const _prevUpdateSignalBar = window._SdrControls.updateSignalBar;
        window._SdrControls.updateSignalBar = (dbfs: number) => {
            if (_prevUpdateSignalBar) _prevUpdateSignalBar(dbfs);
            if (_playing) updateSignalBar(dbfs);
        };

        document.addEventListener('sdr-mini:connected', (e: Event) => {
            setConnected((e as CustomEvent<boolean>).detail);
            if (!(e as CustomEvent<boolean>).detail) setPlaying(false);
        });

        // ── Public API ─────────────────────────────────────────────────────────

        function show() {
            if (window._MapSidebar) {
                window._MapSidebar.show();
                window._MapSidebar.switchTab('search');
            }
        }

        function hide() { /* no-op — user dismisses by switching sidebar tabs */ }

        function tune(freqHz: number, mode: string, name: string) {
            _freqHz = freqHz;
            _mode   = mode || 'AM';
            displayFreq(freqHz);
            setModePill(_mode);
            setPlaying(false);
            show();
        }

        function onSquelchChange(open: boolean) {
            if (!_isRecording) return;
            if (open && !_recSquelchOpen) {
                if (_recPauseStart != null) {
                    _recPausedMs += Date.now() - _recPauseStart;
                    _recPauseStart = null;
                }
                _recSquelchOpen = true;
                if (_liveRecRow) {
                    (_liveRecRow.querySelector('.sdr-clip-name') as HTMLElement).textContent = 'Recording…';
                    _liveRecRow.querySelector('.sdr-clip-live-dot')!.classList.remove('sdr-clip-live-dot--waiting');
                }
            } else if (!open && _recSquelchOpen) {
                _recPauseStart  = Date.now();
                _recSquelchOpen = false;
                if (_liveRecRow) {
                    (_liveRecRow.querySelector('.sdr-clip-name') as HTMLElement).textContent = 'Waiting for signal…';
                    _liveRecRow.querySelector('.sdr-clip-live-dot')!.classList.add('sdr-clip-live-dot--waiting');
                }
            }
        }

        (window as any)._SdrMiniPlayer = { tune, show, hide, updateSignalBar, setConnected, populateRadios, onSquelchChange };
    }

    // Run immediately — #msb-pane-radio already exists because map-sidebar.js
    // injects its HTML synchronously at IIFE execution time.
    _inject();

})();
