import { computed, ref, type Ref } from 'vue'
import { usePersistedFlag } from './persistedSetting'
import type { DecodeEvent } from './sdrTypes'

// Cap the in-memory decoded-event log so a long session can't grow unbounded.
const DECODE_EVENTS_MAX = 200

// Cap the raw dsd-fme log buffer. Lines arrive far faster than call rows (the
// control channel emits many status lines per second), so this is kept tighter
// to bound memory and the rendered list.
const DECODE_LOGS_MAX = 300

// dsd-fme colourises its output with ANSI CSI escape sequences. Strip them so the
// log view shows clean text instead of "[33m"/"[0m" litter. Anchored on the ESC
// control char so real bracketed tokens (e.g. "[slot2]") are never touched.
// eslint-disable-next-line no-control-regex -- matching the ESC control char is the intent
const ANSI_ESCAPE_PATTERN = /\[[0-9;]*[A-Za-z]/g
function stripAnsi(line: string): string {
  return line.replace(ANSI_ESCAPE_PATTERN, '').trimEnd()
}

/**
 * The SDR store's decode feed slice: the digital-voice decode toggle, the
 * mute-while-decoding option, and the live decoded-event and dsd-fme log
 * buffers the decoder dock shows. `aprsEnabled` comes from the background
 * decoder slice: the dock shows APRS packets while APRS decode is on.
 */
export function useSdrDecodeFeed(aprsEnabled: Ref<boolean>) {
  // ── Digital decode (dsd-fme sidecar) ──────────────────────────────────────
  // User toggle for digital-mode decoding. Persisted in the `sdr` settings
  // namespace (as `digitalDecodeDefault`); localStorage is a fast-path cache so
  // the button reflects the last state instantly on load, then the DB hydrate
  // reconciles it. Default OFF.
  const digitalEnabledSetting = usePersistedFlag({
    storageKey: 'sdrDigitalEnabled',
    defaultValue: false,
    settingKey: 'digitalDecodeDefault',
  })

  // ── Decode audio muting ───────────────────────────────────────────────────
  // Settings → SDR → DECODING → "Mute Audio While Decoding". When ON (the
  // default, and the behaviour before this setting existed) the analog audio of
  // a radio is muted while that radio decodes digital voice or APRS — the raw
  // channel is noise to the ear. Absent/invalid ⇒ ON, so existing installs keep
  // muting.
  const muteAudioSetting = usePersistedFlag({
    storageKey: 'sdrMuteAudioWhileDecoding',
    defaultValue: true,
    settingKey: 'muteAudioWhileDecoding',
  })

  // Which decoded-event stream the dock is showing for the viewed radio. APRS
  // when APRS decode is on (its packet table + raw log), otherwise the voice
  // call table. Drives the dock's column layout.
  const decodeStreamKind = computed<'voice' | 'aprs'>(() => (aprsEnabled.value ? 'aprs' : 'voice'))

  // Whether the decoder dock (panels below the waterfall) should be shown: true
  // while EITHER voice or APRS decode is active. The waterfall also raises its
  // bottom by the dock height when this is true.
  const decodeDockOpen = computed<boolean>(
    () => digitalEnabledSetting.value.value || aprsEnabled.value,
  )

  // Live decoded-event log (newest first), plus the latest sync / decoder
  // reachability state. Non-persisted — this is live session data.
  const decodeEvents = ref<DecodeEvent[]>([])
  const decodeSync = ref(false)
  const decoderReachable = ref(false)
  // Most-recently decoded protocol (e.g. "DMR", "P25"), upper-cased by the
  // sidecar parser. Drives the decoded-voice playback sample rate, which differs
  // per mode (dsd-fme upsamples most modes' UDP audio to 48 kHz but emits DMR at
  // native 8 kHz). Empty until the first mode-bearing event arrives.
  const decodedMode = ref('')

  // Backend-measured playback sample rate (Hz) for decoded voice. Null until the
  // backend has measured dsd-fme's actual UDP output rate (see
  // DigitalDecodeBridge._measure_audio_rate); the decode-audio player falls back
  // to a default until then. Measured per session, so it is reset on clear.
  const decodedAudioRate = ref<number | null>(null)

  // Raw dsd-fme output lines (newest first), shown in the Decoder log view.
  // Non-persisted live session data, like decodeEvents.
  const decodeLogs = ref<string[]>([])

  // Ingest a batch of decoded frames from the decode WebSocket in a SINGLE
  // reactive update. A busy control channel emits dozens of dsd-fme log lines a
  // second; folding a whole frame's worth of messages into one mutation (one
  // array rebuild per buffer, not one per message) is what keeps the decoder
  // dock from re-rendering on every message and starving the spectrum/waterfall
  // and decoded-audio scheduling on the shared main thread. Events arrive
  // oldest-first; both buffers are kept newest-first and capped.
  //
  // Per frame: sync/reachability/mode fields update the live indicators
  // (last-in-batch wins, matching sequential arrival) regardless of frame type;
  // `type: "log"` frames carry a raw dsd-fme line and go only to the log buffer;
  // `decode_status` frames update indicators only; every other frame is a call
  // row.
  function pushDecodeEventBatch(events: DecodeEvent[]) {
    if (events.length === 0) return
    const freshLogs: string[] = []
    const freshRows: DecodeEvent[] = []
    for (const event of events) {
      if (typeof event.decoder_reachable === 'boolean')
        decoderReachable.value = event.decoder_reachable
      if (typeof event.sync === 'boolean') decodeSync.value = event.sync
      if (event.mode) decodedMode.value = event.mode
      if (typeof event.audio_sample_rate === 'number')
        decodedAudioRate.value = event.audio_sample_rate
      if (event.type === 'log') {
        const cleaned = event.line ? stripAnsi(event.line) : ''
        if (cleaned) freshLogs.push(cleaned)
        continue
      }
      if (event.type === 'decode_status') continue
      freshRows.push({ ...event, ts: event.ts || Date.now() })
    }
    // Reverse so the batch's newest frame lands at the front, then prepend the
    // existing (already newest-first) buffer and cap.
    if (freshLogs.length > 0)
      decodeLogs.value = [...freshLogs.reverse(), ...decodeLogs.value].slice(0, DECODE_LOGS_MAX)
    if (freshRows.length > 0)
      decodeEvents.value = [...freshRows.reverse(), ...decodeEvents.value].slice(
        0,
        DECODE_EVENTS_MAX,
      )
  }

  // Ingest a single decoded frame. Thin wrapper over pushDecodeEventBatch so the
  // routing/capping logic lives in one place; the WebSocket path batches a
  // frame's worth of events via pushDecodeEventBatch directly.
  function pushDecodeEvent(event: DecodeEvent) {
    pushDecodeEventBatch([event])
  }

  function setDecodeStatus(status: { decoder_reachable?: boolean; sync?: boolean }) {
    if (typeof status.decoder_reachable === 'boolean')
      decoderReachable.value = status.decoder_reachable
    if (typeof status.sync === 'boolean') decodeSync.value = status.sync
  }

  // Reset the live decode state — called when digital decode is disabled or the
  // radio changes, so a new session starts clean.
  function clearDecode() {
    decodeEvents.value = []
    decodeLogs.value = []
    decodeSync.value = false
    decoderReachable.value = false
    decodedMode.value = ''
    decodedAudioRate.value = null
  }

  // Clear only the event log (the user's "clear" button), leaving the live
  // sync / reachability indicators intact since the decoder is still connected.
  function clearDecodeEvents() {
    decodeEvents.value = []
  }

  // Clear only the raw log buffer (the log view's own "clear" button).
  function clearDecodeLogs() {
    decodeLogs.value = []
  }

  return {
    digitalEnabled: digitalEnabledSetting.value,
    setDigitalEnabled: digitalEnabledSetting.set,
    hydrateDigitalEnabledFromDb: digitalEnabledSetting.hydrateFromDb,
    muteAudioWhileDecoding: muteAudioSetting.value,
    setMuteAudioWhileDecoding: muteAudioSetting.set,
    hydrateMuteAudioWhileDecodingFromDb: muteAudioSetting.hydrateFromDb,
    decodeStreamKind,
    decodeDockOpen,
    decodeEvents,
    decodeLogs,
    decodeSync,
    decoderReachable,
    decodedMode,
    decodedAudioRate,
    pushDecodeEvent,
    pushDecodeEventBatch,
    setDecodeStatus,
    clearDecode,
    clearDecodeEvents,
    clearDecodeLogs,
  }
}
