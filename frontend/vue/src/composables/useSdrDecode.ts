// SDR digital-decode composable — app-level singleton.
//
// Owns the two decode WebSockets that complement the control/IQ sockets in
// useSdrAudio:
//   /ws/sdr/{id}/decode        — decoded events (JSON) → the Pinia store
//   /ws/sdr/{id}/decode/audio  — decoded voice PCM (binary, s16 mono, 48 kHz)
//
// Decoded voice is already demodulated by dsd-fme, so — unlike the IQ pipeline
// in useSdrAudio — there is no NCO/LPF/discriminator here. We simply schedule
// the incoming PCM onto AudioBufferSourceNodes at the blaster's source rate; the
// AudioContext resamples to its own rate on playback. Kept as plain module-level
// state (never reactive) for the same reason useSdrAudio is: proxy-wrapping
// breaks the audio APIs.

import { useSdrStore } from '@/stores/sdr'
import type { DecodeEvent } from '@/stores/sdr'

// Fallback playback rate for decoded voice, used only until the backend reports
// the rate it actually MEASURED from dsd-fme's UDP output (store.decodedAudioRate
// — see DigitalDecodeBridge._measure_audio_rate). dsd-fme's blaster rate varies
// by build/protocol and isn't carried in the stream, so we never assume a fixed
// rate for real playback; this default just covers the sub-second warmup before
// the first measurement arrives. (History: hardcoding 8 kHz played voice ~6x too
// slow / "stretched", 48 kHz played it too fast / "chipmunk" — hence: measure.)
const DECODE_AUDIO_SR = 48000

let _eventsWs: WebSocket | null = null
let _audioWs: WebSocket | null = null
let _radioId: number | null = null
let _active = false

// Decode events (JSON) arrive far faster than the UI needs to repaint: a busy
// control channel emits dozens of dsd-fme log lines a second, each relayed as
// its own WS message. Pushing every one straight into the reactive store
// re-renders the decoder dock — re-running its per-row work — on each message,
// saturating the main thread that also paints the spectrum/waterfall and
// schedules decoded audio (the freeze + slow-audio symptom). So coalesce
// incoming events and flush them to the store in ONE batched mutation per
// animation frame. (The decoded-audio socket is deliberately NOT batched — its
// PCM is scheduled immediately in _schedulePcm so playback stays gap-free.)
let _eventBuffer: DecodeEvent[] = []
let _flushHandle: number | null = null

function _flushEventBuffer() {
  _flushHandle = null
  const batch = _eventBuffer
  _eventBuffer = []
  useSdrStore().pushDecodeEventBatch(batch)
}

function _queueDecodeEvent(event: DecodeEvent) {
  _eventBuffer.push(event)
  // Schedule a single flush per frame; further events this frame just append.
  if (_flushHandle === null) _flushHandle = requestAnimationFrame(_flushEventBuffer)
}

let _ctx: AudioContext | null = null
let _gain: GainNode | null = null
let _volume = 1
// Next start time for scheduled PCM, so consecutive chunks play gap-free.
let _playHead = 0

// Decoded-voice jitter buffer. Frames reach us over the UDP→backend→WS relay
// with timing jitter, and the shared main thread can delay the scheduling
// callback. Starting each frame exactly at the previous one's end (or flush
// against currentTime on the first/late frame) leaves no slack, so any late
// frame underruns the output and clicks — the "jumpy" symptom. Leading the play
// head by this much when starting fresh or recovering from an underrun absorbs
// normal jitter at the cost of a little latency (fine for monitored voice).
const DECODE_JITTER_BUFFER_SEC = 0.2
// Ceiling on how far ahead of real time the play head may run. If the decoder's
// clock is slightly fast — or it bursts a backlog after reconnecting — the queue
// grows and latency creeps up without bound; resync to the cushion instead.
const DECODE_MAX_LEAD_SEC = 1.0

function _wsProto(): string {
  /* v8 ignore start -- the wss arm only runs under https, which jsdom never is */
  return location.protocol === 'https:' ? 'wss' : 'ws'
  /* v8 ignore stop */
}

function _initAudio() {
  // Always called from start() after stop() has cleared any prior context, so
  // _ctx is null here; create a fresh context + gain node.
  _ctx = new AudioContext()
  _gain = _ctx.createGain()
  _gain.gain.value = _volume
  _gain.connect(_ctx.destination)
  _playHead = 0
  // Some browsers start the context suspended even when created in a gesture;
  // resume so scheduled PCM is actually heard. start() is called from the
  // DIGITAL click handler, so this counts as a user-gesture resume.
  _ctx.resume().catch(() => {})
}

// Decode one binary PCM frame (s16 LE mono) and schedule it for playback at the
// current mode's source rate (see _decodeAudioRate). A late frame can arrive
// after stop() tore the context down, hence the guard (_gain is always set
// alongside _ctx by _initAudio).
function _schedulePcm(buffer: ArrayBuffer) {
  if (!_ctx) return
  const sampleCount = buffer.byteLength >> 1
  if (sampleCount === 0) return
  const view = new DataView(buffer)
  const samples = new Float32Array(sampleCount)
  for (let index = 0; index < sampleCount; index++) {
    samples[index] = view.getInt16(index * 2, true) / 32768
  }
  // Play at the backend-measured rate once known, else the warmup fallback.
  const sampleRate = useSdrStore().decodedAudioRate ?? DECODE_AUDIO_SR
  const audioBuffer = _ctx.createBuffer(1, sampleCount, sampleRate)
  audioBuffer.getChannelData(0).set(samples)
  const source = _ctx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(_gain!)
  const now = _ctx.currentTime
  // Re-arm the jitter cushion on the first frame / an underrun (nothing queued
  // ahead of the clock) or an overrun (the queue has drifted too far ahead),
  // otherwise continue scheduling gap-free from the current play head.
  if (_playHead < now || _playHead > now + DECODE_MAX_LEAD_SEC) {
    _playHead = now + DECODE_JITTER_BUFFER_SEC
  }
  const startAt = _playHead
  source.start(startAt)
  _playHead = startAt + audioBuffer.duration
}

function _openEvents(radioId: number) {
  const ws = new WebSocket(`${_wsProto()}://${location.host}/ws/sdr/${radioId}/decode`)
  _eventsWs = ws
  ws.addEventListener('message', (ev: MessageEvent) => {
    let parsed: DecodeEvent
    try {
      parsed = JSON.parse(ev.data as string)
    } catch {
      return
    }
    _queueDecodeEvent(parsed)
  })
}

function _openAudio(radioId: number) {
  const ws = new WebSocket(`${_wsProto()}://${location.host}/ws/sdr/${radioId}/decode/audio`)
  ws.binaryType = 'arraybuffer'
  _audioWs = ws
  ws.addEventListener('message', (ev: MessageEvent) => {
    if (ev.data instanceof ArrayBuffer) _schedulePcm(ev.data)
  })
}

export function useSdrDecode() {
  // Open the decode + decode-audio sockets and start playing decoded voice.
  function start(radioId: number) {
    if (_active && _radioId === radioId) return
    stop()
    _radioId = radioId
    _active = true
    _initAudio()
    _openEvents(radioId)
    _openAudio(radioId)
  }

  // Close both sockets and tear down the decode AudioContext.
  function stop() {
    _active = false
    _radioId = null
    // Drop any frame still buffered for the next flush and cancel its pending
    // animation frame, so a stopped session can't leak events into the store
    // (or into a fresh session started in the same frame).
    if (_flushHandle !== null) {
      cancelAnimationFrame(_flushHandle)
      _flushHandle = null
    }
    _eventBuffer = []
    if (_eventsWs) {
      _eventsWs.close()
      _eventsWs = null
    }
    if (_audioWs) {
      _audioWs.close()
      _audioWs = null
    }
    if (_gain) {
      _gain.disconnect()
      _gain = null
    }
    if (_ctx) {
      _ctx.close()
      _ctx = null
    }
  }

  function setVolume(volume: number) {
    _volume = Math.max(0, Math.min(2, volume))
    if (_gain) _gain.gain.value = _volume
  }

  function isActive() {
    return _active
  }

  return { start, stop, setVolume, isActive }
}
