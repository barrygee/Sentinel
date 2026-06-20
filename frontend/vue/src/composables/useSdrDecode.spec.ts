import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSdrDecode } from './useSdrDecode'
import { useSdrStore } from '@/stores/sdr'

// ── Fakes for the WebSocket + Web Audio APIs (not in jsdom) ───────────────────
type Listener = (ev: unknown) => void

const sockets: FakeWebSocket[] = []

class FakeWebSocket {
  url: string
  binaryType = ''
  readyState = 1
  listeners: Record<string, Listener[]> = {}
  close = vi.fn(() => {
    this.readyState = 3
  })
  constructor(url: string) {
    this.url = url
    sockets.push(this)
  }
  addEventListener(type: string, cb: Listener) {
    ;(this.listeners[type] ||= []).push(cb)
  }
  emit(type: string, ev: unknown) {
    ;(this.listeners[type] || []).forEach((cb) => cb(ev))
  }
}

class FakeBufferSource {
  buffer: unknown = null
  connect = vi.fn()
  start = vi.fn()
}

class FakeAudioBuffer {
  duration: number
  _channel: Float32Array
  constructor(length: number, sampleRate: number) {
    this.duration = length / sampleRate
    this._channel = new Float32Array(length)
  }
  getChannelData() {
    return this._channel
  }
}

let lastCtx: FakeAudioContext | null = null

class FakeAudioContext {
  currentTime = 0
  destination = {}
  closed = false
  gainNode = { gain: { value: -1 }, connect: vi.fn(), disconnect: vi.fn() }
  resume = vi.fn(() => Promise.resolve())
  createGain = vi.fn(() => this.gainNode)
  createBuffer = vi.fn(
    (_channels: number, length: number, sampleRate: number) =>
      new FakeAudioBuffer(length, sampleRate),
  )
  createBufferSource = vi.fn(() => new FakeBufferSource())
  close = vi.fn(() => {
    this.closed = true
  })
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- capture the module-constructed instance
    lastCtx = this
  }
}

function lastSocket(): FakeWebSocket {
  return sockets[sockets.length - 1]
}

function s16Frame(values: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(values.length * 2)
  const view = new DataView(buffer)
  values.forEach((value, index) => view.setInt16(index * 2, value, true))
  return buffer
}

// Decode events are coalesced and flushed to the store once per animation frame.
// The composable registers its flush callback before this one, so by the time
// this resolves the buffered events have already been pushed.
function flushFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

describe('useSdrDecode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sockets.length = 0
    lastCtx = null
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    vi.stubGlobal('AudioContext', FakeAudioContext as unknown as typeof AudioContext)
  })
  afterEach(() => {
    // Tear down any active session so module state doesn't leak between tests.
    useSdrDecode().stop()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens the events and audio sockets on start', () => {
    const decode = useSdrDecode()
    decode.start(7)
    expect(decode.isActive()).toBe(true)
    expect(sockets).toHaveLength(2)
    expect(sockets[0].url).toContain('/ws/sdr/7/decode')
    expect(sockets[1].url).toContain('/ws/sdr/7/decode/audio')
    expect(sockets[1].binaryType).toBe('arraybuffer')
  })

  it('is idempotent for the same radio', () => {
    const decode = useSdrDecode()
    decode.start(7)
    decode.start(7)
    expect(sockets).toHaveLength(2)
  })

  it('resumes the audio context on start', () => {
    const decode = useSdrDecode()
    decode.start(7)
    expect(lastCtx?.resume).toHaveBeenCalled()
  })

  it('swallows a rejected resume', async () => {
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        resume = vi.fn(() => Promise.reject(new Error('blocked')))
      } as unknown as typeof AudioContext,
    )
    const decode = useSdrDecode()
    expect(() => decode.start(7)).not.toThrow()
    await Promise.resolve()
  })

  it('restarts cleanly when the radio changes', () => {
    const decode = useSdrDecode()
    decode.start(7)
    const firstAudio = sockets[1]
    decode.start(8)
    expect(firstAudio.close).toHaveBeenCalled()
    expect(lastSocket().url).toContain('/ws/sdr/8/decode/audio')
  })

  it('pushes parsed decode events to the store on the next frame', async () => {
    const decode = useSdrDecode()
    decode.start(1)
    const store = useSdrStore()
    sockets[0].emit('message', {
      data: JSON.stringify({ type: 'decode_event', mode: 'DMR', ts: 1 }),
    })
    // Buffered, not yet flushed: the store stays empty until the frame fires.
    expect(store.decodeEvents).toHaveLength(0)
    await flushFrame()
    expect(store.decodeEvents[0].mode).toBe('DMR')
  })

  it('coalesces a frame of events into a single store update, newest-first', async () => {
    const decode = useSdrDecode()
    decode.start(1)
    const store = useSdrStore()
    const pushSpy = vi.spyOn(store, 'pushDecodeEventBatch')
    for (const talkgroup of [1, 2, 3]) {
      sockets[0].emit('message', {
        data: JSON.stringify({ type: 'decode_event', talkgroup, ts: talkgroup }),
      })
    }
    await flushFrame()
    // One batched mutation for the whole frame, not one per message.
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(store.decodeEvents.map((event) => event.talkgroup)).toEqual([3, 2, 1])
  })

  it('ignores malformed event JSON', async () => {
    const decode = useSdrDecode()
    decode.start(1)
    const store = useSdrStore()
    sockets[0].emit('message', { data: 'not json' })
    await flushFrame()
    expect(store.decodeEvents).toHaveLength(0)
  })

  it('drops buffered events and cancels the pending flush on stop', async () => {
    const decode = useSdrDecode()
    decode.start(1)
    const store = useSdrStore()
    sockets[0].emit('message', {
      data: JSON.stringify({ type: 'decode_event', mode: 'DMR', ts: 1 }),
    })
    decode.stop()
    await flushFrame()
    expect(store.decodeEvents).toHaveLength(0)
  })

  it('schedules decoded PCM frames for playback', () => {
    const decode = useSdrDecode()
    decode.start(1)
    sockets[1].emit('message', { data: s16Frame([16384, -16384, 0, 32767]) })
    expect(lastCtx?.createBuffer).toHaveBeenCalledWith(1, 4, 48000)
    const source = lastCtx?.createBufferSource.mock.results[0].value as FakeBufferSource
    expect(source.start).toHaveBeenCalled()
    expect(source.connect).toHaveBeenCalledWith(lastCtx?.gainNode)
  })

  it('falls back to 48 kHz until the backend reports a measured rate', () => {
    const decode = useSdrDecode()
    decode.start(1)
    const store = useSdrStore()
    // No measured rate yet (decodedAudioRate null), regardless of decoded mode.
    for (const mode of ['DMR', 'dmr', 'P25']) {
      store.pushDecodeEvent({ type: 'decode_event', mode, ts: 1 })
      sockets[1].emit('message', { data: s16Frame([1, 2, 3, 4]) })
      expect(lastCtx?.createBuffer).toHaveBeenLastCalledWith(1, 4, 48000)
    }
  })

  it('plays decoded voice at the backend-measured rate once reported', () => {
    const decode = useSdrDecode()
    decode.start(1)
    const store = useSdrStore()
    // Backend measured dsd-fme's actual UDP rate and reported it; play at it.
    store.pushDecodeEvent({ type: 'decode_status', audio_sample_rate: 16000, ts: 1 })
    sockets[1].emit('message', { data: s16Frame([1, 2, 3, 4]) })
    expect(lastCtx?.createBuffer).toHaveBeenLastCalledWith(1, 4, 16000)
  })

  it('ignores empty PCM frames', () => {
    const decode = useSdrDecode()
    decode.start(1)
    sockets[1].emit('message', { data: new ArrayBuffer(0) })
    expect(lastCtx?.createBufferSource).not.toHaveBeenCalled()
  })

  it('ignores non-binary audio messages', () => {
    const decode = useSdrDecode()
    decode.start(1)
    sockets[1].emit('message', { data: 'text' })
    expect(lastCtx?.createBufferSource).not.toHaveBeenCalled()
  })

  it('advances the play head so consecutive frames are scheduled in order', () => {
    const decode = useSdrDecode()
    decode.start(1)
    sockets[1].emit('message', { data: s16Frame([1, 2, 3, 4]) }) // 4/48000 s
    sockets[1].emit('message', { data: s16Frame([5, 6, 7, 8]) })
    const sources = lastCtx?.createBufferSource.mock.results.map((r) => r.value as FakeBufferSource)
    expect(sources?.[0].start.mock.calls[0][0]).toBe(0)
    expect(sources?.[1].start.mock.calls[0][0]).toBeCloseTo(4 / 48000)
  })

  it('leads the play head by the jitter cushion on the first/underrun frame', () => {
    const decode = useSdrDecode()
    decode.start(1)
    // Clock has advanced past the (zeroed) play head: an underrun. The frame
    // should be scheduled a cushion (0.2 s) ahead of the clock, not flush to it.
    lastCtx!.currentTime = 5
    sockets[1].emit('message', { data: s16Frame([1, 2]) })
    const source = lastCtx?.createBufferSource.mock.results[0].value as FakeBufferSource
    expect(source.start.mock.calls[0][0]).toBeCloseTo(5.2)
  })

  it('resyncs to the cushion when the play head drifts too far ahead (overrun)', () => {
    const decode = useSdrDecode()
    decode.start(1)
    // A 72000-sample 48 kHz frame is 1.5 s long, pushing the play head >1 s ahead
    // of the clock (still at 0). The next frame must drop back to the cushion
    // rather than scheduling 1.5 s out.
    const longFrame = s16Frame(new Array(72000).fill(1))
    sockets[1].emit('message', { data: longFrame })
    sockets[1].emit('message', { data: s16Frame([1, 2]) })
    const sources = lastCtx?.createBufferSource.mock.results.map((r) => r.value as FakeBufferSource)
    expect(sources?.[0].start.mock.calls[0][0]).toBe(0) // first frame: no underrun at t=0
    expect(sources?.[1].start.mock.calls[0][0]).toBeCloseTo(0.2) // resynced to cushion
  })

  it('stop closes sockets and the audio context', () => {
    const decode = useSdrDecode()
    decode.start(1)
    const eventsSocket = sockets[0]
    const audioSocket = sockets[1]
    const ctx = lastCtx
    decode.stop()
    expect(eventsSocket.close).toHaveBeenCalled()
    expect(audioSocket.close).toHaveBeenCalled()
    expect(ctx?.close).toHaveBeenCalled()
    expect(decode.isActive()).toBe(false)
  })

  it('stop is safe to call when not started', () => {
    const decode = useSdrDecode()
    expect(() => decode.stop()).not.toThrow()
  })

  it('ignores a PCM frame that arrives after stop tore down the context', () => {
    const decode = useSdrDecode()
    decode.start(1)
    const audioSocket = sockets[1]
    const ctx = lastCtx
    decode.stop()
    ctx?.createBufferSource.mockClear()
    audioSocket.emit('message', { data: s16Frame([1, 2]) })
    expect(ctx?.createBufferSource).not.toHaveBeenCalled()
  })

  it('setVolume clamps and applies gain when active', () => {
    const decode = useSdrDecode()
    decode.start(1)
    decode.setVolume(5)
    expect(lastCtx?.gainNode.gain.value).toBe(2) // clamped to max 2
    decode.setVolume(-1)
    expect(lastCtx?.gainNode.gain.value).toBe(0)
  })

  it('setVolume is safe with no active context', () => {
    const decode = useSdrDecode()
    expect(() => decode.setVolume(1)).not.toThrow()
  })
})
