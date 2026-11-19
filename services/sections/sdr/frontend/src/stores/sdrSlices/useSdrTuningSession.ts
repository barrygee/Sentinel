import { computed, ref, shallowRef } from 'vue'
import { isTunableHz } from '../../sdrPanelUtils'
import type { SdrMode, SdrRadio, SdrTab } from './sdrTypes'

/**
 * The SDR store's tuning slice: the radio list, which radio is viewed and how
 * it is tuned (frequency, mode, gain, squelch, demod bandwidth and offset),
 * the panel's mirrors other components read (connection, tuning ownership,
 * active tab), and the marker → panel request channels. The viewed radio,
 * frequency, mode and play state survive a reload through sessionStorage.
 */
export function useSdrTuningSession() {
  const radios = ref<SdrRadio[]>([])
  const currentRadioId = ref<number | null>(null)
  const playing = ref(false)
  const connected = ref(false)
  // Tuning ownership when sharing one dongle across Sentinel instances via the
  // relay control channel. `controlAvailable` is false for a direct rtl_tcp / a
  // relay without the control channel, where tuning is always allowed; in that
  // case `isOwner` stays true so the UI behaves exactly as a single instance.
  // A read-only follower is `controlAvailable && !isOwner && locked` — `locked`
  // (the token is held by *some* instance) distinguishes "another instance is
  // tuning" (read-only) from "the token is free" (a tune attempt can claim it),
  // so a follower is never stuck read-only after the owner leaves.
  const isOwner = ref(true)
  const controlAvailable = ref(false)
  const locked = ref(false)
  const currentFreqHz = ref(100_000_000)
  const currentMode = ref<SdrMode>('WFM')
  const currentGain = ref(30)
  const currentSquelch = ref(-60)
  const panelOpen = ref(false)
  const sampleRate = ref(2_048_000)

  // Which tab the SDR side panel is showing (RADIO / FREQUENCY MANAGER / …).
  // Mirrored here from SdrPanel so siblings — notably the footer's tuned-
  // frequency indicator — can tell the RADIO tab (where the panel already shows
  // the frequency) apart from the other tabs (where the footer should show it).
  const activeTab = ref<SdrTab>('radio')
  function setActiveTab(tab: SdrTab) {
    activeTab.value = tab
  }

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
  let tuneNonce = 0
  let bandwidthNonce = 0
  let fftSizeNonce = 0

  // Current demod offset from the hardware centre frequency (Hz). 0 when
  // auto-centre is ON or the marker sits at centre. The waterfall reads this to
  // place the tuning bar at currentFreqHz + tuningOffsetHz; the panel pushes it
  // into the audio NCO. Plain ref — only changes on a click/retune, not per
  // frame.
  const tuningOffsetHz = ref(0)
  function setTuningOffsetHz(hz: number) {
    tuningOffsetHz.value = hz
  }

  function restoreSession() {
    try {
      const id = sessionStorage.getItem('sdrLastRadioId')
      if (id) currentRadioId.value = parseInt(id)
      const freq = sessionStorage.getItem('sdrLastFreqHz')
      // A stored frequency no tuner can reach is dropped, not restored and re-sent.
      if (freq && isTunableHz(parseInt(freq))) currentFreqHz.value = parseInt(freq)
      const mode = sessionStorage.getItem('sdrLastMode') as SdrMode | null
      if (mode) currentMode.value = mode
      playing.value = sessionStorage.getItem('sdrPlaying') === '1'
    } catch {}
  }

  function persistSession() {
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
    persistSession()
  }

  function setFrequency(hz: number) {
    currentFreqHz.value = hz
    persistSession()
  }

  function setMode(mode: SdrMode) {
    currentMode.value = mode
    persistSession()
  }

  function setPlaying(isPlaying: boolean) {
    playing.value = isPlaying
    persistSession()
  }

  // Panel → store mirror of the device reachability dot. The authoritative copy
  // is the local `connected` ref in SdrPanel.vue; the panel pushes it here so
  // other components (e.g. the air-domain airport list) can gate SDR tuning on
  // whether a radio is actually connected.
  function setConnected(isConnected: boolean) {
    connected.value = isConnected
  }

  // Panel → store mirror of tuning ownership (from the WS status/control frames).
  // Drives the read-only follower UI: when another instance owns the shared
  // dongle, tuning controls are disabled and a banner is shown.
  function setOwnership(owner: boolean, available: boolean, isLocked: boolean) {
    isOwner.value = owner
    controlAvailable.value = available
    locked.value = isLocked
  }

  // True only when the relay control channel is active, another instance holds the
  // tuning token, and we are not it — i.e. this instance is a read-only follower.
  const readOnly = computed(() => controlAvailable.value && !isOwner.value && locked.value)

  // Panel → store mirror of the demod bandwidth.
  function setBandwidthHz(hz: number) {
    bwHz.value = hz
  }

  // Marker → panel: request a device retune (panel applies it, debounced).
  // center=true forces a hardware-centre retune even with auto-centre OFF
  // (the freq-axis drag-pan sets this; click-to-tune leaves it undefined).
  function requestTune(hz: number, center = false) {
    tuneRequest.value = { hz, nonce: ++tuneNonce, center }
  }

  // Marker → panel: request a demod-bandwidth change (audio filter only).
  function requestBandwidth(hz: number) {
    bwRequest.value = { hz, nonce: ++bandwidthNonce }
  }

  // Waterfall → panel: ask the backend to switch FFT size.
  function requestFftSize(bins: number) {
    fftSizeRequest.value = { bins, nonce: ++fftSizeNonce }
  }

  // Fetch the configured SDR radios and replace `radios` with the result. This
  // is the single owner of that list — SdrPanel (radio dropdown/auto-select)
  // and any other consumer read `radios` rather than loading it themselves.
  // Silently keeps the previous value on a network error or non-2xx response
  // (offline/transient failure), matching the rest of this store's fetch
  // helpers — callers that need to react to failure should check whether the
  // list actually changed.
  async function loadRadios() {
    try {
      const res = await fetch('/api/sdr/radios')
      if (res.ok) radios.value = await res.json()
    } catch {}
  }

  restoreSession()

  return {
    radios,
    loadRadios,
    currentRadioId,
    playing,
    connected,
    isOwner,
    controlAvailable,
    locked,
    readOnly,
    setOwnership,
    currentFreqHz,
    currentMode,
    currentGain,
    currentSquelch,
    panelOpen,
    sampleRate,
    activeTab,
    setActiveTab,
    bwHz,
    tuneRequest,
    bwRequest,
    fftSizeRequest,
    tuningOffsetHz,
    setTuningOffsetHz,
    setRadio,
    setFrequency,
    setMode,
    setPlaying,
    setConnected,
    setBandwidthHz,
    requestTune,
    requestBandwidth,
    requestFftSize,
  }
}
