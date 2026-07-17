import type { Ref } from 'vue'
import type { useNotificationsStore } from '@/stores/notifications'
import type { SdrMode, SdrRadio } from '@/stores/sdr'
import { defaultBwHz } from '@/components/sdr/sdrPanelUtils'

/**
 * Satellite auto-tune reconciliation (extracted from SdrPanel.vue's engine
 * spine — behaviour byte-identical): reacts to the pass scheduler's AOS
 * (`sentinel:sdr-tune-external`) and LOS (`sentinel:sdr-tune-restore`)
 * document events. Owns the pending-tune queue (applied once the control
 * socket opens), the pre-AOS snapshot + LOS restore, lock-in priority between
 * overlapping passes, optional record-the-pass, and the user notifications.
 * The panel keeps the useDocumentEvent registrations and passes the handlers
 * through.
 */
export interface UseSdrAutoTuneOptions {
  /** Lazy accessor for the notifications store (the panel's shared instance). */
  notificationsStore: () => ReturnType<typeof useNotificationsStore>
  /** True while audio/spectrum is streaming. */
  playing: Ref<boolean>
  /** Authoritative tuned frequency in Hz. */
  currentFreqHz: Ref<number>
  /** Active demodulator mode. */
  currentMode: Ref<string>
  /** The input's editable text value ("NNN.DDDD" MHz). */
  freqInputVal: Ref<string>
  /** The "NNN.DDD MHz" active-frequency display string. */
  activeFreqDisplay: Ref<string>
  /** Demod audio bandwidth in Hz. */
  bwHz: Ref<number>
  /** The selected radio id, if any. */
  selectedRadioId: Ref<number | null>
  /** The configured radios (hands-free radio pick when nothing is playing). */
  knownRadios: Ref<SdrRadio[]>
  /** True while the scanner sweep owns the tuner. */
  scanActive: Ref<boolean>
  /** True while a range search owns the tuner. */
  searchActive: Ref<boolean>
  /** True while a recording is in progress (useSdrRecording). */
  isRecording: Ref<boolean>
  /** The demod audio path (worklet init, demod mode, audio bandwidth). */
  sdrAudio: {
    initAudio: (radioId: number) => Promise<unknown> | unknown
    setMode: (mode: SdrMode) => void
    setBandwidthHz: (bandwidthHz: number) => void
  }
  /** Sends a control-socket command (the panel's single command chokepoint). */
  sendCmd: (commandPayload: object) => void
  /** Persists the live tuner state to sessionStorage. */
  saveSettings: () => void
  /** Flips the playing flag (+ its sessionStorage marker). */
  setPlayingState: (on: boolean) => void
  /** The panel's Stop action (audio off, sweeps stopped, ownership released). */
  stop: () => void
  /** Selects a radio (opens its control socket); used for hands-free start. */
  selectRadio: (radio: SdrRadio) => void
  /** useSdrRecording's startRecording — begins a clip, true when it started. */
  startRecording: () => Promise<boolean>
  /** useSdrRecording's stopRecordingIfActive — finalises an in-progress clip. */
  stopRecordingIfActive: () => Promise<void>
  /** True when the control socket exists and is OPEN (apply immediately). */
  isSocketOpen: () => boolean
  /** True when the control socket is still CONNECTING (its open will drain). */
  isSocketConnecting: () => boolean
}

/**
 * Wires the AOS/LOS auto-tune reconciliation onto the injected engine
 * chokepoints. Everything returned keeps the exact semantics the panel had
 * inline.
 */
export function useSdrAutoTune(options: UseSdrAutoTuneOptions) {
  const {
    notificationsStore: _notificationsStore,
    playing,
    currentFreqHz,
    currentMode,
    freqInputVal,
    activeFreqDisplay,
    bwHz,
    selectedRadioId,
    knownRadios,
    scanActive,
    searchActive,
    isRecording,
    sdrAudio,
    sendCmd,
    saveSettings,
    setPlayingState,
    stop,
    selectRadio,
    startRecording,
    stopRecordingIfActive,
    isSocketOpen,
    isSocketConnecting,
  } = options

  // Pending external (auto-tune) request, applied once the control socket opens.
  let _pendingExternalTune: {
    hz: number
    mode: SdrMode
    satName: string
    noradId?: string
    token?: string
    record?: boolean
  } | null = null

  // State captured the moment an auto-tune takes over the radio, so the LOS
  // restore can put things back. `playing` records whether audio was running
  // before AOS; when false the radio was stopped (or merely connected) and the
  // restore stops playback again. `token` ties this snapshot to the firing pass so
  // a stale LOS (after a newer pass retuned) is ignored. `tunedHz`/`tunedMode` are
  // what we tuned *to* — the restore only acts if the radio is still on them
  // (i.e. the user hasn't manually retuned since), so we never clobber a manual change.
  // `startedRecording` is true when *we* auto-started a recording at AOS, so the LOS
  // restore stops only that recording and never a manual one the user began.
  let _autoTunePrevState: {
    token?: string
    playing: boolean
    freqHz: number
    mode: SdrMode
    tunedHz: number
    tunedMode: SdrMode
    startedRecording?: boolean
  } | null = null

  // Map a satellite's downlink mode string (e.g. "FM", "USB", "FSK9k6") to a
  // demodulator the SDR supports. Satellite FM voice is narrowband, so "FM" maps
  // to NFM (not broadcast WFM); anything unrecognised falls back to NFM.
  function _coerceSdrMode(mode: string | undefined): SdrMode {
    const m = (mode || '').toUpperCase()
    if (m === 'WFM') return 'WFM'
    if (m === 'NFM' || m === 'FM') return 'NFM'
    if (m === 'AM') return 'AM'
    if (m === 'USB') return 'USB'
    if (m === 'LSB') return 'LSB'
    if (m === 'CW') return 'CW'
    return 'NFM'
  }

  // True while an auto-tune is actively holding the radio: we have a snapshot AND
  // the radio is still parked on exactly what we tuned it to. If the user (or a
  // scan/search) has since moved off that freq, the lock is no longer held and a
  // fresh pass may take over. Shared by onExternalTune (lock-in priority) and
  // onExternalTuneRestore (only restore if still on the tuned freq).
  function _isAutoTuneLockHeld(): boolean {
    const snap = _autoTunePrevState
    if (!snap) return false
    if (scanActive.value || searchActive.value) return false
    return (
      playing.value &&
      Math.round(currentFreqHz.value) === snap.tunedHz &&
      (currentMode.value as SdrMode) === snap.tunedMode
    )
  }

  // External tune request (currently from satellite auto-tune at AOS). Tunes the
  // SDR to the given freq+mode, starting the default radio hands-free if nothing
  // is playing. Because the control socket opens asynchronously, the actual tune
  // is queued in _pendingExternalTune and applied once the socket is open (see
  // the control socket's 'open' handler, which calls drainPendingExternalTune).
  function onExternalTune(e: Event): void {
    const detail = (
      e as CustomEvent<{
        hz: number
        mode?: string
        satName?: string
        noradId?: string
        token?: string
        record?: boolean
      }>
    ).detail
    if (!detail || !detail.hz) return
    const hz = Math.round(detail.hz)
    const mode = _coerceSdrMode(detail.mode)
    const satName = detail.satName || 'SATELLITE'
    const noradId = detail.noradId
    const token = detail.token
    const record = !!detail.record

    // Lock-in priority: if an earlier overlapping pass already holds the radio,
    // skip this later one rather than grabbing the tuner mid-copy. Leave the
    // snapshot/radio untouched so the holder's LOS restore still matches its
    // token. A scan/search or a manual retune releases the lock (see
    // _isAutoTuneLockHeld), letting the next pass take over normally.
    if (_isAutoTuneLockHeld() && _autoTunePrevState!.token !== token) {
      _notificationsStore().add({
        type: 'autotune',
        title: `${satName} PASS SKIPPED`,
        detail: 'Radio busy with an earlier pass — not retuned',
        noradId,
        satName,
      })
      return
    }

    // Snapshot the pre-AOS state so the LOS restore can put it back. Captured
    // before any mutation below. A scan/search counts as "not the prior idle
    // freq", so we record whether it was running and just stop on restore.
    _autoTunePrevState = {
      token,
      playing: playing.value,
      freqHz: currentFreqHz.value,
      mode: currentMode.value as SdrMode,
      tunedHz: hz,
      tunedMode: mode,
    }

    if (selectedRadioId.value && playing.value) {
      // Already running — just retune (+ keep the audio demod in sync).
      currentFreqHz.value = hz
      currentMode.value = mode
      freqInputVal.value = (hz / 1e6).toFixed(4)
      activeFreqDisplay.value = (hz / 1e6).toFixed(3) + ' MHz'
      sdrAudio.setMode(mode)
      const bw = defaultBwHz(mode)
      sdrAudio.setBandwidthHz(bw)
      bwHz.value = bw
      sessionStorage.setItem('sdrLastFreqHz', String(hz))
      sessionStorage.setItem('sdrLastMode', mode)
      sendCmd({ cmd: 'tune', frequency_hz: hz })
      sendCmd({ cmd: 'mode', mode })
      _notifyAutoTuned(satName, hz, mode, noradId)
      if (record) void _startAutoTuneRecording(satName, noradId)
      return
    }

    // Not playing: pick a radio. Prefer the currently-selected one, else the
    // last-used (sdrLastRadioId), else the first enabled known radio.
    let radio: SdrRadio | null = null
    if (selectedRadioId.value) {
      /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
      radio = knownRadios.value.find((r) => r.id === selectedRadioId.value) ?? null
      /* v8 ignore stop */
    }
    if (!radio) {
      const lastId = parseInt(sessionStorage.getItem('sdrLastRadioId') || '', 10)
      /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
      if (!isNaN(lastId))
        radio = knownRadios.value.find((r) => r.id === lastId && r.enabled) ?? null
      /* v8 ignore stop */
    }
    if (!radio) radio = knownRadios.value.find((r) => r.enabled) ?? null
    if (!radio) {
      _notifyAutoTuneFailed(satName)
      return
    }

    // Queue the tune to fire once the control socket is open.
    _pendingExternalTune = { hz, mode, satName, noradId, token, record }
    const sameRadio = selectedRadioId.value === radio.id
    const sockOpen = isSocketOpen()
    const sockConnecting = isSocketConnecting()
    if (sameRadio && sockOpen) {
      void _applyPendingExternalTune()
    } else if (sameRadio && sockConnecting) {
      // Socket already opening for this radio — its 'open' handler will drain the
      // pending tune. Re-selecting would early-return and never fire 'open'.
    } else {
      selectRadio(radio)
    }
  }

  async function _applyPendingExternalTune(): Promise<void> {
    const p = _pendingExternalTune
    // Callers gate on _pendingExternalTune / a selected radio, so these guards are
    // belt-and-braces for an unobservable teardown race.
    /* v8 ignore start */
    if (!p) return
    _pendingExternalTune = null
    if (!selectedRadioId.value) return
    /* v8 ignore stop */
    currentFreqHz.value = p.hz
    currentMode.value = p.mode
    freqInputVal.value = (p.hz / 1e6).toFixed(4)
    activeFreqDisplay.value = (p.hz / 1e6).toFixed(3) + ' MHz'
    // Await audio init: the worklet must be ready before _startAutoTuneRecording
    // (below) calls startRecording, which bails if the worklet hasn't loaded yet.
    // This is the "armed before the pass" path — the radio starts from stopped at
    // AOS, so without awaiting, record silently no-ops while the tune still fires.
    await sdrAudio.initAudio(selectedRadioId.value)
    sdrAudio.setMode(p.mode)
    const bw = defaultBwHz(p.mode)
    sdrAudio.setBandwidthHz(bw)
    bwHz.value = bw
    setPlayingState(true)
    sessionStorage.setItem('sdrLastFreqHz', String(p.hz))
    sessionStorage.setItem('sdrLastMode', p.mode)
    saveSettings()
    sendCmd({ cmd: 'tune', frequency_hz: p.hz })
    sendCmd({ cmd: 'mode', mode: p.mode })
    _notifyAutoTuned(p.satName, p.hz, p.mode, p.noradId)
    if (p.record) void _startAutoTuneRecording(p.satName, p.noradId)
  }

  // Applies a queued auto-tune once the control socket can accept commands
  // (called from the socket's 'open' handler).
  function drainPendingExternalTune(): void {
    if (_pendingExternalTune) void _applyPendingExternalTune()
  }

  // Start a recording for an auto-tuned pass and mark the snapshot so the LOS
  // restore stops it (and only it). The radio has just been tuned/started above,
  // so the recording captures the downlink from AOS. No-op if a recording is
  // already running (e.g. a manual REC the user started) — we don't take it over,
  // and we don't flag it as auto-started, so LOS leaves it alone.
  async function _startAutoTuneRecording(satName: string, noradId?: string): Promise<void> {
    if (isRecording.value) return
    const started = await startRecording()
    if (!started) return
    // _startAutoTuneRecording is only invoked after onExternalTune has captured the
    // snapshot, so _autoTunePrevState is always present here.
    /* v8 ignore start */
    if (_autoTunePrevState) _autoTunePrevState.startedRecording = true
    /* v8 ignore stop */
    _notificationsStore().add({
      type: 'autotune',
      title: `${satName} RECORDING`,
      detail: 'Recording pass',
      noradId,
      satName,
    })
  }

  function _notifyAutoTuned(satName: string, hz: number, mode: string, noradId?: string): void {
    _notificationsStore().add({
      type: 'autotune',
      title: `${satName} AUTO-TUNED`,
      detail: `Downlink ${(hz / 1e6).toFixed(3)} MHz ${mode} @ AOS`,
      noradId,
      satName,
    })
  }

  function _notifyAutoTuneFailed(satName: string): void {
    _notificationsStore().add({
      type: 'system',
      title: `${satName} AUTO-TUNE`,
      detail: 'No SDR radio configured — open the RADIO panel to add one',
    })
  }

  // LOS restore: undo an auto-tune once the pass ends, returning the radio to the
  // state captured at AOS. We only act if the radio is still parked on the
  // frequency/mode we auto-tuned to — if the user (or a newer pass) has retuned
  // since, the snapshot is stale and we leave things alone.
  function onExternalTuneRestore(e: Event): void {
    const detail = (e as CustomEvent<{ satName?: string; noradId?: string; token?: string }>).detail
    const snap = _autoTunePrevState
    if (!snap) return
    // Token mismatch means a later AOS overwrote the snapshot; that newer pass
    // owns the restore now, so ignore this stale LOS.
    if (detail?.token && snap.token && detail.token !== snap.token) return
    _autoTunePrevState = null

    const satName = detail?.satName || 'SATELLITE'
    const noradId = detail?.noradId

    // Bail if the user has taken manual control (retuned, scanned, searched, or
    // stopped) since the auto-tune — respect their state over the restore. Note
    // _isAutoTuneLockHeld reads _autoTunePrevState, which we cleared above, so
    // re-check against the captured snapshot directly here.
    if (scanActive.value || searchActive.value) return

    // Finalise an auto-started recording at LOS no matter what — "record the pass"
    // means the recording ends when the pass ends, even if the user retuned away mid-pass
    // (their new tune keeps playing, just not recording). Only stops a recording WE
    // began; a manual REC the user started never set startedRecording, so it's
    // untouched. Runs before the onTunedFreq bail below, which only governs whether
    // we put the *radio* back — not whether our recording should end.
    if (snap.startedRecording) void stopRecordingIfActive()

    const onTunedFreq =
      playing.value &&
      Math.round(currentFreqHz.value) === snap.tunedHz &&
      (currentMode.value as SdrMode) === snap.tunedMode
    if (!onTunedFreq) return

    if (!snap.playing) {
      // Radio was stopped/connected-but-idle before AOS — stop playback again.
      stop()
      _notifyAutoRestored(satName, null, null, noradId)
      return
    }

    // Was playing on another frequency before AOS — retune back to it.
    // (Reaching here requires playing=true, which implies a selected radio, so the
    // guard is defensive.)
    /* v8 ignore start */
    if (!selectedRadioId.value) return
    /* v8 ignore stop */
    currentFreqHz.value = snap.freqHz
    currentMode.value = snap.mode
    freqInputVal.value = (snap.freqHz / 1e6).toFixed(4)
    activeFreqDisplay.value = (snap.freqHz / 1e6).toFixed(3) + ' MHz'
    sdrAudio.setMode(snap.mode)
    const bw = defaultBwHz(snap.mode)
    sdrAudio.setBandwidthHz(bw)
    bwHz.value = bw
    sessionStorage.setItem('sdrLastFreqHz', String(snap.freqHz))
    sessionStorage.setItem('sdrLastMode', snap.mode)
    sendCmd({ cmd: 'tune', frequency_hz: snap.freqHz })
    sendCmd({ cmd: 'mode', mode: snap.mode })
    _notifyAutoRestored(satName, snap.freqHz, snap.mode, noradId)
  }

  function _notifyAutoRestored(
    satName: string,
    hz: number | null,
    mode: string | null,
    noradId?: string,
  ): void {
    _notificationsStore().add({
      type: 'autotune',
      title: `${satName} PASS ENDED`,
      detail:
        hz != null && mode != null
          ? `Restored SDR → ${(hz / 1e6).toFixed(3)} MHz ${mode}`
          : 'Stopped SDR (was idle before pass)',
      noradId,
      satName,
    })
  }

  return {
    onExternalTune,
    onExternalTuneRestore,
    drainPendingExternalTune,
  }
}
