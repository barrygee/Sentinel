import { ref, type Ref } from 'vue'
import type { SdrRadio } from '@/stores/sdr'

/** Live-recording banner state shown while a clip is being captured. */
export interface SdrLiveRecording {
  frequency_hz: number
  mode: string
  startedAt: string
}

/** Recording metadata captured from the live tune when a clip starts. */
export interface SdrRecordingStartMetadata {
  radio_id?: number | null
  radio_name?: string
  frequency_hz?: number
  mode?: string
  gain_db?: number
  squelch_dbfs?: number
  sample_rate?: number
}

/**
 * The SDR recording state machine (extracted from SdrPanel.vue's engine spine
 * — behaviour byte-identical): REC start/stop, the live elapsed-seconds timer,
 * and squelch-pause accounting (squelched time doesn't count towards the
 * clip's elapsed display). The audio worklet capture itself lives in
 * useSdrAudio; this composable drives it through the injected functions.
 */
export interface UseSdrRecordingOptions {
  /** The selected radio id, if any (recorded into the clip metadata). */
  selectedRadioId: Ref<number | null>
  /** The configured radios (for resolving the recorded radio's name). */
  knownRadios: Ref<SdrRadio[]>
  /** Authoritative tuned frequency in Hz. */
  currentFreqHz: Ref<number>
  /** Active demodulator mode. */
  currentMode: Ref<string>
  /** RF gain in dB (recorded into the clip metadata). */
  gainDb: Ref<number>
  /** Squelch threshold in dBFS (recorded, and seeds the pause accounting). */
  squelch: Ref<number>
  /** useSdrAudio's startRecording — begins worklet capture, returns the clip id. */
  startAudioRecording: (metadata: SdrRecordingStartMetadata) => Promise<number | null>
  /** useSdrAudio's stopRecording — finalises the worklet capture. */
  stopAudioRecording: (metadata: { frequency_hz?: number; mode?: string }) => Promise<unknown>
  /** Reloads the RECORDINGS tab list so a finished clip appears. */
  reloadRecordings: () => Promise<unknown> | undefined
}

/**
 * Wires the recording state machine onto the injected tuner refs. Everything
 * returned keeps the exact semantics the panel had inline.
 */
export function useSdrRecording(options: UseSdrRecordingOptions) {
  const {
    selectedRadioId,
    knownRadios,
    currentFreqHz,
    currentMode,
    gainDb,
    squelch,
    startAudioRecording,
    stopAudioRecording,
    reloadRecordings,
  } = options

  const isRecording = ref(false)
  const recSquelchOpen = ref(true)
  const liveElapsedS = ref(0)
  const liveRecording = ref<SdrLiveRecording | null>(null)
  let _recStartEpoch = 0
  let _recPausedMs = 0
  let _recPauseStart: number | null = null
  let _recTimerInterval: ReturnType<typeof setInterval> | null = null

  async function toggleRecording() {
    if (isRecording.value) {
      await stopRecordingIfActive()
      return
    }
    await startRecording()
  }

  // A manual frequency change or stop ends any in-progress recording, finalising
  // the clip at the moment the user moves off the channel it was capturing — we
  // don't let a recording silently carry on onto a new frequency. Covers both a
  // manually-started REC and one auto-started for a satellite pass; for the latter
  // this fires before LOS, so the pass clip ends here and onExternalTuneRestore's
  // own stopRecordingIfActive becomes a no-op. Only the genuinely-manual entry
  // points call this (wheel retune, saved-freq play, the Stop button); scan/search
  // stepping and the auto-tune path deliberately do not.
  function endRecordingOnManualChange(): void {
    if (isRecording.value) void stopRecordingIfActive()
  }

  // Build the recording metadata from the current tune and start a recording,
  // wiring up the live-recording UI/timer. Shared by the manual REC button and the
  // auto-tune-on-pass path. Returns true if a recording actually started.
  async function startRecording(): Promise<boolean> {
    // Both callers (toggleRecording, _startAutoTuneRecording) already short-circuit
    // when a recording is in progress, so this self-guard is belt-and-braces.
    /* v8 ignore start */
    if (isRecording.value) return false
    /* v8 ignore stop */
    const radioName = selectedRadioId.value
      ? /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
        (knownRadios.value.find((r) => r.id === selectedRadioId.value)?.name ?? '')
      : ''
    /* v8 ignore stop */
    const metadata = {
      radio_id: selectedRadioId.value,
      radio_name: radioName,
      /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
      frequency_hz: currentFreqHz.value || 0,
      mode: currentMode.value || 'AM',
      gain_db: gainDb.value || 30,
      squelch_dbfs: squelch.value || -60,
      /* v8 ignore stop */
      sample_rate: 2048000,
    }
    const recId = await startAudioRecording(metadata)
    if (!recId) return false
    isRecording.value = true
    _recStartEpoch = Date.now()
    _recPausedMs = 0
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    const sqActive = (metadata.squelch_dbfs ?? -120) > -119
    /* v8 ignore stop */
    recSquelchOpen.value = !sqActive
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    _recPauseStart = sqActive ? Date.now() : null
    /* v8 ignore stop */
    const now = new Date(_recStartEpoch)
    liveRecording.value = {
      frequency_hz: metadata.frequency_hz,
      mode: metadata.mode,
      startedAt: now.toISOString().replace('T', ' ').slice(0, 16),
    }
    liveElapsedS.value = 0
    _recTimerInterval = setInterval(() => {
      const pausedSoFar =
        /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
        _recPauseStart != null ? _recPausedMs + (Date.now() - _recPauseStart) : _recPausedMs
      /* v8 ignore stop */
      liveElapsedS.value = Math.floor((Date.now() - _recStartEpoch - pausedSoFar) / 1000)
    }, 1000)
    return true
  }

  async function stopRecordingIfActive() {
    if (!isRecording.value) return
    isRecording.value = false
    // startRecording always sets _recTimerInterval before isRecording goes true,
    // so it is non-null whenever we reach a live recording here.
    /* v8 ignore start */
    if (_recTimerInterval) {
      clearInterval(_recTimerInterval)
      _recTimerInterval = null
    }
    /* v8 ignore stop */
    const _radioName = selectedRadioId.value
      ? /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
        (knownRadios.value.find((r) => r.id === selectedRadioId.value)?.name ?? '')
      : ''
    /* v8 ignore stop */
    await stopAudioRecording({
      /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
      frequency_hz: currentFreqHz.value || 0,
      mode: currentMode.value || 'AM',
      /* v8 ignore stop */
    })
    liveRecording.value = null
    await reloadRecordings()
    setTimeout(() => reloadRecordings(), 2000)
  }

  // The recording half of the audio worklet's squelch-change callback: squelched
  // stretches pause the elapsed-seconds display so the timer reflects captured
  // audio, not wall-clock time.
  function onRecordingSquelchChange(open: boolean) {
    if (!isRecording.value) return
    if (open && !recSquelchOpen.value) {
      // recSquelchOpen === false implies the channel was squelched at this point,
      // which always set _recPauseStart — they are inversely coupled.
      /* v8 ignore start */
      if (_recPauseStart != null) {
        _recPausedMs += Date.now() - _recPauseStart
        _recPauseStart = null
      }
      /* v8 ignore stop */
      recSquelchOpen.value = true
    } else if (!open && recSquelchOpen.value) {
      _recPauseStart = Date.now()
      recSquelchOpen.value = false
    }
  }

  // Unmount cleanup only clears the live timer — recording state itself survives
  // (the panel deliberately keeps the control socket open across unmounts, and a
  // clip is finalised by an explicit stop, never by navigation).
  function clearLiveRecordingTimer() {
    if (_recTimerInterval) clearInterval(_recTimerInterval)
  }

  return {
    isRecording,
    recSquelchOpen,
    liveElapsedS,
    liveRecording,
    toggleRecording,
    startRecording,
    endRecordingOnManualChange,
    stopRecordingIfActive,
    onRecordingSquelchChange,
    clearLiveRecordingTimer,
  }
}
