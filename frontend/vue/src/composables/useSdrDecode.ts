// SDR digital-decode composable — app-level singleton.
//
// Owns the two decode WebSockets that complement the control/IQ sockets in
// useSdrAudio:
//   /ws/sdr/{id}/decode        — decoded events (JSON) → the Pinia store
//   /ws/sdr/{id}/decode/audio  — decoded voice PCM (binary, s16 mono; 48 kHz for
//                                most modes, 8 kHz for DMR — see _decodeAudioRate)
//
// Decoded voice is already demodulated by dsd-fme, so — unlike the IQ pipeline
// in useSdrAudio — there is no NCO/LPF/discriminator here. We simply schedule
// the incoming PCM onto AudioBufferSourceNodes tagged with the mode's source
// rate; the AudioContext resamples to its own rate on playback. Kept as plain
// module-level state (never reactive)
// for the same reason useSdrAudio is: proxy-wrapping breaks the audio APIs.

import { useSdrStore } from '@/stores/sdr'
import type { DecodeEvent } from '@/stores/sdr'

// Sample rate of dsd-fme's decoded-voice UDP "blaster" output. The rate is
// mode-dependent: dsd-fme upsamples most modes' synthesised voice to 48 kHz
// before blasting it, but emits DMR at its native 8 kHz. Playing DMR's 8 kHz
// frames as 48 kHz ran the audio ~6x too fast ("squeaky"); playing the upsampled
// modes as 8 kHz ran them ~6x too slow. So the rate is chosen per decoded mode.
const DEFAULT_DECODE_AUDIO_SR = 48000
const NATIVE_8K_MODES = new Set(['DMR'])

// Resolve the playback sample rate for the currently-decoding mode. Modes dsd-fme
// emits at native 8 kHz over UDP play at 8 kHz; everything else (upsampled to
// 48 kHz) plays at 48 kHz. Unknown/empty mode falls back to the 48 kHz default.
function _decodeAudioRate(mode: string): number {
  return NATIVE_8K_MODES.has(mode.toUpperCase()) ? 8000 : DEFAULT_DECODE_AUDIO_SR
}

let _eventsWs: WebSocket | null = null
let _audioWs: WebSocket | null = null
let _radioId: number | null = null
let _active = false

let _ctx: AudioContext | null = null
let _gain: GainNode | null = null
let _volume = 1
// Next start time for scheduled PCM, so consecutive chunks play gap-free.
let _playHead = 0

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
  const audioBuffer = _ctx.createBuffer(1, sampleCount, _decodeAudioRate(useSdrStore().decodedMode))
  audioBuffer.getChannelData(0).set(samples)
  const source = _ctx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(_gain!)
  const startAt = Math.max(_ctx.currentTime, _playHead)
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
    useSdrStore().pushDecodeEvent(parsed)
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
