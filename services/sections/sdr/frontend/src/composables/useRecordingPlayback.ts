import { ref, watch, type Ref } from 'vue'
import type { SdrRecording } from '../sdrRecordings'

/** What {@link useRecordingPlayback} gives the RECORDINGS tab. */
export interface RecordingPlayback {
  /** The recording playing now, or null. Only one plays at a time. */
  playingRecordingId: Ref<number | null>
  currentTimeSeconds: Ref<number>
  durationSeconds: Ref<number>
  /** A row's `<audio>` function ref: registers (or, with null, forgets) its element. */
  setAudioElement: (recordingId: number, element: HTMLAudioElement | null) => void
  /** Plays a recording from the start (stopping any other), or stops it if it is playing. */
  togglePlay: (recording: SdrRecording) => void
  onAudioMetadata: (recordingId: number) => void
  onAudioTimeUpdate: (recordingId: number) => void
  onAudioEnded: (recordingId: number) => void
  /** Moves the playing recording to a fraction (0–1) of its length. */
  seekToFraction: (fraction: number) => void
}

function isFiniteDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0
}

/**
 * Playback of saved recordings through each row's hidden `<audio>` element:
 * which one plays, its position and length (for the block progress bar), and
 * seeking.
 *
 * @param onPlaybackActiveChange Called with true when a recording starts
 *   playing from silence and false when the last one stops, so the panel can
 *   mute the live SDR audio meanwhile (signal/waterfall/spectrum keep running).
 */
export function useRecordingPlayback(
  onPlaybackActiveChange: (active: boolean) => void,
): RecordingPlayback {
  const playingRecordingId = ref<number | null>(null)
  const currentTimeSeconds = ref(0)
  const durationSeconds = ref(0)
  const audioElements = new Map<number, HTMLAudioElement>()

  watch(playingRecordingId, (recordingId, previousRecordingId) => {
    if ((recordingId !== null) !== (previousRecordingId !== null))
      onPlaybackActiveChange(recordingId !== null)
  })

  function setAudioElement(recordingId: number, element: HTMLAudioElement | null): void {
    if (element) audioElements.set(recordingId, element)
    else audioElements.delete(recordingId)
  }

  function togglePlay(recording: SdrRecording): void {
    const audio = audioElements.get(recording.id)
    /* v8 ignore start -- defensive: every saved row renders its own <audio> whose function ref
       registers it, so the element is always present for a row whose play button can be clicked. */
    if (!audio) return
    /* v8 ignore stop */
    if (playingRecordingId.value === recording.id) {
      audio.pause()
      audio.currentTime = 0
      playingRecordingId.value = null
    } else {
      if (playingRecordingId.value !== null) {
        const previousAudio = audioElements.get(playingRecordingId.value)
        /* v8 ignore start -- defensive: the previously-playing id always has its <audio>
           registered in the ref map. */
        if (previousAudio) {
          previousAudio.pause()
          previousAudio.currentTime = 0
        }
        /* v8 ignore stop */
      }
      playingRecordingId.value = recording.id
      currentTimeSeconds.value = 0
      // Seed duration from metadata if already loaded, else fall back to the
      // recorded duration_s so the end time is populated immediately.
      durationSeconds.value = isFiniteDuration(audio.duration)
        ? audio.duration
        : recording.duration_s || 0
      audio.play()
    }
  }

  function onAudioMetadata(recordingId: number): void {
    const audio = audioElements.get(recordingId)
    /* v8 ignore start -- defensive: the event fires from the row's own registered <audio>. */
    if (!audio) return
    /* v8 ignore stop */
    if (playingRecordingId.value === recordingId && isFiniteDuration(audio.duration))
      durationSeconds.value = audio.duration
  }

  function onAudioTimeUpdate(recordingId: number): void {
    if (playingRecordingId.value !== recordingId) return
    const audio = audioElements.get(recordingId)
    /* v8 ignore start -- defensive: the event fires from the row's own registered <audio>. */
    if (!audio) return
    /* v8 ignore stop */
    currentTimeSeconds.value = audio.currentTime
    // Streamed WAVs may only expose a finite duration once playback begins.
    if (isFiniteDuration(audio.duration) && audio.duration !== durationSeconds.value)
      durationSeconds.value = audio.duration
  }

  function onAudioEnded(recordingId: number): void {
    if (playingRecordingId.value === recordingId) {
      playingRecordingId.value = null
      currentTimeSeconds.value = 0
    }
  }

  function seekToFraction(fraction: number): void {
    if (playingRecordingId.value === null || durationSeconds.value <= 0) return
    const audio = audioElements.get(playingRecordingId.value)
    /* v8 ignore start -- defensive: the seek bar only renders for the playing row, whose
       <audio> is registered. */
    if (!audio) return
    /* v8 ignore stop */
    audio.currentTime = fraction * durationSeconds.value
  }

  return {
    playingRecordingId,
    currentTimeSeconds,
    durationSeconds,
    setAudioElement,
    togglePlay,
    onAudioMetadata,
    onAudioTimeUpdate,
    onAudioEnded,
    seekToFraction,
  }
}
