import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { useRecordingPlayback } from './useRecordingPlayback'
import type { SdrRecording } from '../sdrRecordings'

function makeRecording(id: number, durationSeconds = 60): SdrRecording {
  return {
    id,
    name: `rec${id}`,
    notes: '',
    frequency_hz: 1e8,
    mode: 'AM',
    duration_s: durationSeconds,
    file_size_bytes: 1,
    started_at: '',
    has_iq_file: false,
    radio_id: 1,
    radio_name: '',
  }
}

// A stand-in <audio>: only the members the composable touches.
interface FakeAudio {
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  currentTime: number
  duration: number
}

function fakeAudio(duration = NaN): FakeAudio {
  return { play: vi.fn(), pause: vi.fn(), currentTime: 0, duration }
}

function createPlayback() {
  const onActiveChange = vi.fn()
  const playback = useRecordingPlayback(onActiveChange)
  const audios = new Map<number, FakeAudio>()
  function register(id: number, duration = NaN): FakeAudio {
    const audio = fakeAudio(duration)
    audios.set(id, audio)
    playback.setAudioElement(id, audio as unknown as HTMLAudioElement)
    return audio
  }
  return { playback, onActiveChange, register, audios }
}

describe('useRecordingPlayback — play / stop', () => {
  it('starts with nothing playing', () => {
    const { playback } = createPlayback()
    expect(playback.playingRecordingId.value).toBeNull()
    expect(playback.currentTimeSeconds.value).toBe(0)
    expect(playback.durationSeconds.value).toBe(0)
  })

  it('plays a recording from the start', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    playback.togglePlay(makeRecording(1))
    expect(audio.play).toHaveBeenCalledOnce()
    expect(playback.playingRecordingId.value).toBe(1)
    expect(playback.currentTimeSeconds.value).toBe(0)
  })

  it('stops the playing recording and rewinds it on a second toggle', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    playback.togglePlay(makeRecording(1))
    audio.currentTime = 12
    playback.togglePlay(makeRecording(1))
    expect(audio.pause).toHaveBeenCalledOnce()
    expect(audio.currentTime).toBe(0)
    expect(playback.playingRecordingId.value).toBeNull()
  })

  it('stops and rewinds the previous recording when another starts', () => {
    const { playback, register } = createPlayback()
    const first = register(1)
    const second = register(2)
    playback.togglePlay(makeRecording(1))
    first.currentTime = 20
    playback.togglePlay(makeRecording(2))
    expect(first.pause).toHaveBeenCalledOnce()
    expect(first.currentTime).toBe(0)
    expect(second.play).toHaveBeenCalledOnce()
    expect(playback.playingRecordingId.value).toBe(2)
  })

  it('ignores a toggle for a recording with no audio element', () => {
    const { playback } = createPlayback()
    playback.togglePlay(makeRecording(5))
    expect(playback.playingRecordingId.value).toBeNull()
  })

  it('forgets an element registered with null', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    playback.setAudioElement(1, null)
    playback.togglePlay(makeRecording(1))
    expect(audio.play).not.toHaveBeenCalled()
    expect(playback.playingRecordingId.value).toBeNull()
  })
})

describe('useRecordingPlayback — duration', () => {
  it('seeds the duration from loaded metadata', () => {
    const { playback, register } = createPlayback()
    register(1, 42.5)
    playback.togglePlay(makeRecording(1, 60))
    expect(playback.durationSeconds.value).toBe(42.5)
  })

  it.each([
    ['NaN (metadata not loaded)', NaN],
    ['Infinity (streamed)', Infinity],
    ['0', 0],
  ])('falls back to the recorded duration_s when the element reports %s', (_label, duration) => {
    const { playback, register } = createPlayback()
    register(1, duration)
    playback.togglePlay(makeRecording(1, 60))
    expect(playback.durationSeconds.value).toBe(60)
  })

  it('falls back to 0 when duration_s is missing too', () => {
    const { playback, register } = createPlayback()
    register(1)
    playback.togglePlay({ ...makeRecording(1), duration_s: undefined as unknown as number })
    expect(playback.durationSeconds.value).toBe(0)
  })

  it('takes the duration from metadata that loads while playing', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    playback.togglePlay(makeRecording(1, 60))
    audio.duration = 58
    playback.onAudioMetadata(1)
    expect(playback.durationSeconds.value).toBe(58)
  })

  it('ignores metadata from a row that is not playing', () => {
    const { playback, register } = createPlayback()
    register(1)
    register(2, 99)
    playback.togglePlay(makeRecording(1, 60))
    playback.onAudioMetadata(2)
    expect(playback.durationSeconds.value).toBe(60)
  })

  it('ignores metadata with no finite duration', () => {
    const { playback, register } = createPlayback()
    register(1)
    playback.togglePlay(makeRecording(1, 60))
    playback.onAudioMetadata(1)
    expect(playback.durationSeconds.value).toBe(60)
  })
})

describe('useRecordingPlayback — progress', () => {
  it('follows the playing element’s position', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    playback.togglePlay(makeRecording(1, 60))
    audio.currentTime = 15
    playback.onAudioTimeUpdate(1)
    expect(playback.currentTimeSeconds.value).toBe(15)
  })

  it('picks up a duration that only becomes finite once playback runs', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    playback.togglePlay(makeRecording(1, 60))
    audio.duration = 61.2
    playback.onAudioTimeUpdate(1)
    expect(playback.durationSeconds.value).toBe(61.2)
  })

  it('keeps the duration when the element still reports none', () => {
    const { playback, register } = createPlayback()
    register(1)
    playback.togglePlay(makeRecording(1, 60))
    playback.onAudioTimeUpdate(1)
    expect(playback.durationSeconds.value).toBe(60)
  })

  it('ignores time updates from a row that is not playing', () => {
    const { playback, register } = createPlayback()
    register(1)
    const other = register(2)
    playback.togglePlay(makeRecording(1))
    other.currentTime = 30
    playback.onAudioTimeUpdate(2)
    expect(playback.currentTimeSeconds.value).toBe(0)
  })

  it('clears the playing state when the playing recording ends', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    playback.togglePlay(makeRecording(1))
    audio.currentTime = 30
    playback.onAudioTimeUpdate(1)
    playback.onAudioEnded(1)
    expect(playback.playingRecordingId.value).toBeNull()
    expect(playback.currentTimeSeconds.value).toBe(0)
  })

  it('ignores the end of a recording that is not playing', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    register(2)
    playback.togglePlay(makeRecording(1))
    audio.currentTime = 30
    playback.onAudioTimeUpdate(1)
    playback.onAudioEnded(2)
    expect(playback.playingRecordingId.value).toBe(1)
    expect(playback.currentTimeSeconds.value).toBe(30)
  })
})

describe('useRecordingPlayback — seek', () => {
  it('moves the playing element to the fraction of its duration', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    playback.togglePlay(makeRecording(1, 80))
    playback.seekToFraction(0.25)
    expect(audio.currentTime).toBe(20)
  })

  it('does nothing when nothing is playing', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    playback.seekToFraction(0.5)
    expect(audio.currentTime).toBe(0)
  })

  it('does nothing while the duration is unknown (0)', () => {
    const { playback, register } = createPlayback()
    const audio = register(1)
    playback.togglePlay(makeRecording(1, 0))
    // Leave it mid-way so a seek (which would compute 0.5 × 0 = 0) is visible.
    audio.currentTime = 7
    playback.seekToFraction(0.5)
    expect(audio.currentTime).toBe(7)
  })
})

describe('useRecordingPlayback — live audio muting', () => {
  it('reports active when playback starts and inactive when it stops', async () => {
    const { playback, register, onActiveChange } = createPlayback()
    register(1)
    playback.togglePlay(makeRecording(1))
    await nextTick()
    expect(onActiveChange).toHaveBeenLastCalledWith(true)
    playback.togglePlay(makeRecording(1))
    await nextTick()
    expect(onActiveChange).toHaveBeenLastCalledWith(false)
    expect(onActiveChange).toHaveBeenCalledTimes(2)
  })

  it('does not report again when switching straight from one recording to another', async () => {
    const { playback, register, onActiveChange } = createPlayback()
    register(1)
    register(2)
    playback.togglePlay(makeRecording(1))
    await nextTick()
    playback.togglePlay(makeRecording(2))
    await nextTick()
    expect(onActiveChange).toHaveBeenCalledTimes(1)
    expect(onActiveChange).toHaveBeenCalledWith(true)
  })

  it('reports inactive when the playing recording ends', async () => {
    const { playback, register, onActiveChange } = createPlayback()
    register(1)
    playback.togglePlay(makeRecording(1))
    await nextTick()
    playback.onAudioEnded(1)
    await nextTick()
    expect(onActiveChange).toHaveBeenLastCalledWith(false)
  })
})
