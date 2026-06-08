import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

export interface SdrRadio {
  id: number
  name: string
  host: string
  port: number
  enabled: boolean
  description?: string
}

export interface SdrFrequencyGroup {
  id: number
  name: string
  slug: string
  sort_order: number
}

export interface SdrStoredFrequency {
  id: number
  group_id: number | null
  label: string
  frequency_hz: number
  mode: string
}

export type SdrMode = 'NFM' | 'WFM' | 'AM' | 'USB' | 'LSB' | 'CW'

export interface SdrSpectrumFrame {
  bins: number[]
  center_hz: number
  sample_rate: number
  ts: number
}

export const useSdrStore = defineStore('sdr', () => {
  const radios = ref<SdrRadio[]>([])
  const groups = ref<SdrFrequencyGroup[]>([])
  const frequencies = ref<SdrStoredFrequency[]>([])
  const currentRadioId = ref<number | null>(null)
  const playing = ref(false)
  const connected = ref(false)
  const currentFreqHz = ref(100_000_000)
  const currentMode = ref<SdrMode>('WFM')
  const currentGain = ref(30)
  const currentSquelch = ref(-60)
  const panelOpen = ref(false)
  const sampleRate = ref(2_048_000)

  // Demod (audio filter) bandwidth mirror. The authoritative copy is the local
  // `bwHz` ref in SdrPanel.vue; the panel pushes it here so the spectrum/
  // waterfall marker (a sibling component) can read it. NOT the device
  // sample_rate / FFT span.
  const bwHz = ref(10000)

  // Marker → panel request channel. SdrWaterfall and SdrPanel are siblings;
  // only the panel owns the control websocket. When the user drags the marker,
  // the waterfall calls requestTune/requestBandwidth and the panel (which
  // watches these) runs its existing debounced sendCmd path. The nonce makes an
  // identical repeat value (e.g. nudge back to the same freq) still fire the
  // watcher — a plain ref would not re-trigger on an unchanged value.
  // `center: true` forces the panel to retune the HARDWARE centre even when
  // autoCenterWaterfallOnTune is OFF — used by the freq-axis drag-pan, which
  // means "move the hardware centre" regardless of the click-to-tune preference.
  const tuneRequest = shallowRef<{ hz: number; nonce: number; center?: boolean } | null>(null)
  const bwRequest = shallowRef<{ hz: number; nonce: number } | null>(null)
  // Waterfall → panel: request a backend FFT bin count (matches the canvas's
  // device-pixel width so the waterfall isn't blurry on HiDPI / wide displays).
  const fftSizeRequest = shallowRef<{ bins: number; nonce: number } | null>(null)
  let _tuneNonce = 0
  let _bwNonce = 0
  let _fftNonce = 0

  // Auto-centre toggle (user preference; lives in the `sdr` settings namespace,
  // edited from Settings → SDR → WATERFALL). localStorage is a fast-path cache
  // so the very first click after load behaves correctly before the async
  // settings fetch resolves; SdrAutoCenterControl reconciles it with the DB.
  //  ON  → clicking the spectrum/waterfall retunes the hardware so the clicked
  //        freq becomes the new span centre (display recenters).
  //  OFF → clicking moves the demod target (tuning bar) to the clicked freq
  //        WITHOUT retuning the hardware; the display stays put and the audio
  //        follows via an NCO offset (see useSdrAudio.setOffsetHz).
  function _readAutoCenterWaterfallOnTune(): boolean {
    try {
      return localStorage.getItem('sdrAutoCenterWaterfallOnTune') !== '0'
    } catch {
      return true
    }
  }
  const autoCenterWaterfallOnTune = ref<boolean>(_readAutoCenterWaterfallOnTune())
  // Set the toggle. When turning it ON while the demod sits off-centre, retune
  // the hardware to the current demod freq so the display recenters on it and
  // the NCO offset clears (otherwise the bar would stay off-centre with a stale
  // offset). Pure cache write here — DB persistence is the control's job.
  function setAutoCenterWaterfallOnTune(on: boolean) {
    autoCenterWaterfallOnTune.value = on
    try {
      localStorage.setItem('sdrAutoCenterWaterfallOnTune', on ? '1' : '0')
    } catch {}
    if (on && tuningOffsetHz.value !== 0) {
      tuningOffsetHz.value = 0
      requestTune(currentFreqHz.value)
    }
  }
  // Re-read autoCenterWaterfallOnTune from the persisted DB config and apply it
  // to this live store. Called when the config JSON editor (Settings → App
  // Settings → Application Config) uploads a new config: that replaces the DB
  // settings, but this store still holds its localStorage-cached value, so
  // without this the running SDR UI would ignore the edit until reload. Keeps
  // the JSON editor, the WATERFALL toggle and the live behaviour in sync.
  async function hydrateAutoCenterFromDb(): Promise<void> {
    try {
      const res = await fetch('/api/settings/sdr')
      if (!res.ok) return
      const data = await res.json()
      const v = data?.autoCenterWaterfallOnTune
      if (typeof v === 'boolean' && v !== autoCenterWaterfallOnTune.value) {
        setAutoCenterWaterfallOnTune(v)
      }
    } catch {
      /* offline / transient — keep current value */
    }
  }

  // "Full waterfall update" toggle (matches SDR++ User Guide v1.1 p. 34). When
  // ON, the waterfall history is reset whenever a viewing parameter (Zoom)
  // changes, so new rows fill the narrower viewport cleanly instead of the
  // pre-zoom rows staying horizontally-stretched. Default ON in Sentinel
  // (SDR++'s own default is OFF, but Sentinel users see a cleaner zoom UX).
  function _readFullWaterfallUpdate(): boolean {
    try {
      return localStorage.getItem('sdrFullWaterfallUpdate') !== '0'
    } catch {
      return true
    }
  }
  const fullWaterfallUpdate = ref<boolean>(_readFullWaterfallUpdate())
  function setFullWaterfallUpdate(on: boolean) {
    fullWaterfallUpdate.value = on
    try {
      localStorage.setItem('sdrFullWaterfallUpdate', on ? '1' : '0')
    } catch {}
  }
  // Mirror of hydrateAutoCenterFromDb — keeps the live toggle in sync after a
  // config JSON upload replaces the DB row.
  async function hydrateFullWaterfallUpdateFromDb(): Promise<void> {
    try {
      const res = await fetch('/api/settings/sdr')
      if (!res.ok) return
      const data = await res.json()
      const v = data?.fullWaterfallUpdate
      if (typeof v === 'boolean' && v !== fullWaterfallUpdate.value) {
        setFullWaterfallUpdate(v)
      }
    } catch {
      /* offline / transient — keep current value */
    }
  }

  // Waterfall overlay visibility toggles (bandplan strip and known-frequency
  // labels). Same persistence pattern as fullWaterfallUpdate: localStorage for
  // instant restore, DB hydrate on config upload. Default ON.
  function _readShowBandPlan(): boolean {
    try {
      return localStorage.getItem('sdrShowBandPlan') !== '0'
    } catch {
      return true
    }
  }
  const showBandPlan = ref<boolean>(_readShowBandPlan())
  function setShowBandPlan(on: boolean) {
    showBandPlan.value = on
    try {
      localStorage.setItem('sdrShowBandPlan', on ? '1' : '0')
    } catch {}
  }
  async function hydrateShowBandPlanFromDb(): Promise<void> {
    try {
      const res = await fetch('/api/settings/sdr')
      if (!res.ok) return
      const data = await res.json()
      const v = data?.showBandPlan
      if (typeof v === 'boolean' && v !== showBandPlan.value) setShowBandPlan(v)
    } catch {
      /* offline / transient */
    }
  }

  function _readShowKnownFreqs(): boolean {
    try {
      return localStorage.getItem('sdrShowKnownFreqs') !== '0'
    } catch {
      return true
    }
  }
  const showKnownFreqs = ref<boolean>(_readShowKnownFreqs())
  function setShowKnownFreqs(on: boolean) {
    showKnownFreqs.value = on
    try {
      localStorage.setItem('sdrShowKnownFreqs', on ? '1' : '0')
    } catch {}
  }
  async function hydrateShowKnownFreqsFromDb(): Promise<void> {
    try {
      const res = await fetch('/api/settings/sdr')
      if (!res.ok) return
      const data = await res.json()
      const v = data?.showKnownFreqs
      if (typeof v === 'boolean' && v !== showKnownFreqs.value) setShowKnownFreqs(v)
    } catch {
      /* offline / transient */
    }
  }

  // Resume delay (seconds) for scan + search auto-resume. When the radio locks
  // on a signal during scan/search, it waits until the signal drops below its
  // threshold AND this many seconds have elapsed before continuing. 0 → resume
  // immediately on drop. Persisted in the `sdr` settings namespace; localStorage
  // is a fast-path cache for instant restore.
  function _readResumeDelaySec(): number {
    try {
      const raw = localStorage.getItem('sdrResumeDelaySec')
      const n = raw == null ? 0 : parseInt(raw, 10)
      return isFinite(n) && n >= 0 ? n : 0
    } catch {
      return 0
    }
  }
  const resumeDelaySec = ref<number>(_readResumeDelaySec())
  function setResumeDelaySec(v: number) {
    const clamped = isFinite(v) && v >= 0 ? Math.floor(v) : 0
    resumeDelaySec.value = clamped
    try {
      localStorage.setItem('sdrResumeDelaySec', String(clamped))
    } catch {}
  }
  async function hydrateResumeDelaySecFromDb(): Promise<void> {
    try {
      const res = await fetch('/api/settings/sdr')
      if (!res.ok) return
      const data = await res.json()
      const v = data?.resumeDelaySec
      if (typeof v === 'number' && v >= 0 && v !== resumeDelaySec.value) {
        setResumeDelaySec(v)
      }
    } catch {
      /* offline / transient */
    }
  }

  // Waterfall view settings (Zoom / Max / Min sliders in SdrWaterfall). These
  // live in the store — not as plain local refs in the component — so they
  // survive the component being torn down and rebuilt when the user navigates
  // away from the SDR section and back. SdrWaterfall seeds its local working
  // copies from these on mount and writes back on every slider change. zmin/
  // zmax of 0/0 means "unset" (use the device default range); autoScale true
  // means the Min/Max sliders haven't been touched. Persisted in localStorage
  // (like the SDR toggle preferences above) so they also survive a full page
  // reload / tab close, not just in-app navigation.
  function _readNum(key: string, fallback: number): number {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return fallback
      const n = parseFloat(raw)
      return isFinite(n) ? n : fallback
    } catch {
      return fallback
    }
  }
  const viewZoom = ref(_readNum('sdrViewZoom', 1))
  const viewZmin = ref(_readNum('sdrViewZmin', 0))
  const viewZmax = ref(_readNum('sdrViewZmax', 0))
  const viewAutoScale = ref<boolean>(
    (() => {
      try {
        return localStorage.getItem('sdrViewAutoScale') !== '0'
      } catch {
        return true
      }
    })(),
  )
  function setViewSettings(s: {
    zoom?: number
    zmin?: number
    zmax?: number
    autoScale?: boolean
  }) {
    if (s.zoom !== undefined) viewZoom.value = s.zoom
    if (s.zmin !== undefined) viewZmin.value = s.zmin
    if (s.zmax !== undefined) viewZmax.value = s.zmax
    if (s.autoScale !== undefined) viewAutoScale.value = s.autoScale
    try {
      localStorage.setItem('sdrViewZoom', String(viewZoom.value))
      localStorage.setItem('sdrViewZmin', String(viewZmin.value))
      localStorage.setItem('sdrViewZmax', String(viewZmax.value))
      localStorage.setItem('sdrViewAutoScale', viewAutoScale.value ? '1' : '0')
    } catch {}
  }

  // Current demod offset from the hardware centre frequency (Hz). 0 when
  // auto-centre is ON or the marker sits at centre. The waterfall reads this to
  // place the tuning bar at currentFreqHz + tuningOffsetHz; the panel pushes it
  // into the audio NCO. Plain ref — only changes on a click/retune, not per
  // frame.
  const tuningOffsetHz = ref(0)
  function setTuningOffsetHz(hz: number) {
    tuningOffsetHz.value = hz
  }

  // Latest spectrum frame from the control WebSocket. Non-persisted; held as a
  // single ref (the bins array is NOT deep-tracked — consumers read it
  // imperatively in their render/push loop). See SdrWaterfall.vue.
  // shallowRef: a fresh frame (with a 1024-number array) arrives ~12x/sec.
  // A deep `ref` would proxy that array every frame; shallowRef makes the
  // assignment O(1) while the watch still fires on identity change.
  const lastSpectrum = shallowRef<SdrSpectrumFrame | null>(null)

  function setSpectrum(frame: SdrSpectrumFrame) {
    lastSpectrum.value = frame
  }

  // True only while a range search is actively stepping (sweeping). The
  // waterfall reads this to freeze rendering while the centre frequency is
  // jumping every dwell_ms — painting those frames produces meaningless noise.
  const searchSweeping = ref(false)
  // Range bounds + current step for the search overlay shown by SdrWaterfall.
  // Panel writes these as the sweep advances; null when not searching.
  const searchLowHz = ref<number | null>(null)
  const searchHighHz = ref<number | null>(null)
  const searchCurrentHz = ref<number | null>(null)

  // True while the scanner is actively stepping between saved frequencies and
  // has not yet locked on an active signal. Drives the same paused/holding
  // overlay used during search sweeps. Group names label which groups are in
  // the scan queue (or a single "All" entry when every scannable freq is in).
  const scanSweeping = ref(false)
  const scanGroupNames = ref<string[]>([])

  function _restoreSession() {
    try {
      const id = sessionStorage.getItem('sdrLastRadioId')
      if (id) currentRadioId.value = parseInt(id)
      const freq = sessionStorage.getItem('sdrLastFreqHz')
      if (freq) currentFreqHz.value = parseInt(freq)
      const mode = sessionStorage.getItem('sdrLastMode') as SdrMode | null
      if (mode) currentMode.value = mode
      playing.value = sessionStorage.getItem('sdrPlaying') === '1'
    } catch {}
  }

  function _persistSession() {
    try {
      if (currentRadioId.value !== null)
        sessionStorage.setItem('sdrLastRadioId', String(currentRadioId.value))
      sessionStorage.setItem('sdrLastFreqHz', String(currentFreqHz.value))
      sessionStorage.setItem('sdrLastMode', currentMode.value)
      sessionStorage.setItem('sdrPlaying', playing.value ? '1' : '0')
    } catch {}
  }

  function setRadio(id: number) {
    currentRadioId.value = id
    _persistSession()
  }

  function setFrequency(hz: number) {
    currentFreqHz.value = hz
    _persistSession()
  }

  function setMode(mode: SdrMode) {
    currentMode.value = mode
    _persistSession()
  }

  function setPlaying(val: boolean) {
    playing.value = val
    _persistSession()
  }

  // Panel → store mirror of the device reachability dot. The authoritative copy
  // is the local `connected` ref in SdrPanel.vue; the panel pushes it here so
  // other components (e.g. the air-domain airport list) can gate SDR tuning on
  // whether a radio is actually connected.
  function setConnected(val: boolean) {
    connected.value = val
  }

  // Panel → store mirror of the demod bandwidth.
  function setBandwidthHz(hz: number) {
    bwHz.value = hz
  }

  // Marker → panel: request a device retune (panel applies it, debounced).
  // center=true forces a hardware-centre retune even with auto-centre OFF
  // (the freq-axis drag-pan sets this; click-to-tune leaves it undefined).
  function requestTune(hz: number, center = false) {
    tuneRequest.value = { hz, nonce: ++_tuneNonce, center }
  }

  // Marker → panel: request a demod-bandwidth change (audio filter only).
  function requestBandwidth(hz: number) {
    bwRequest.value = { hz, nonce: ++_bwNonce }
  }

  // Waterfall → panel: ask the backend to switch FFT size.
  function requestFftSize(bins: number) {
    fftSizeRequest.value = { bins, nonce: ++_fftNonce }
  }

  async function loadRadios() {
    try {
      const res = await fetch('/api/sdr/radios')
      if (res.ok) radios.value = await res.json()
    } catch {}
  }

  async function loadGroups() {
    try {
      const res = await fetch('/api/sdr/groups')
      if (res.ok) groups.value = await res.json()
    } catch {}
  }

  async function loadFrequencies() {
    try {
      const res = await fetch('/api/sdr/frequencies')
      if (res.ok) frequencies.value = await res.json()
    } catch {}
  }

  _restoreSession()

  return {
    radios,
    groups,
    frequencies,
    currentRadioId,
    playing,
    connected,
    currentFreqHz,
    currentMode,
    currentGain,
    currentSquelch,
    panelOpen,
    sampleRate,
    lastSpectrum,
    searchSweeping,
    searchLowHz,
    searchHighHz,
    searchCurrentHz,
    scanSweeping,
    scanGroupNames,
    bwHz,
    tuneRequest,
    bwRequest,
    fftSizeRequest,
    autoCenterWaterfallOnTune,
    setAutoCenterWaterfallOnTune,
    hydrateAutoCenterFromDb,
    fullWaterfallUpdate,
    setFullWaterfallUpdate,
    hydrateFullWaterfallUpdateFromDb,
    showBandPlan,
    setShowBandPlan,
    hydrateShowBandPlanFromDb,
    showKnownFreqs,
    setShowKnownFreqs,
    hydrateShowKnownFreqsFromDb,
    resumeDelaySec,
    setResumeDelaySec,
    hydrateResumeDelaySecFromDb,
    viewZoom,
    viewZmin,
    viewZmax,
    viewAutoScale,
    setViewSettings,
    tuningOffsetHz,
    setTuningOffsetHz,
    setRadio,
    setFrequency,
    setMode,
    setPlaying,
    setConnected,
    setSpectrum,
    setBandwidthHz,
    requestTune,
    requestBandwidth,
    requestFftSize,
    loadRadios,
    loadGroups,
    loadFrequencies,
  }
})
