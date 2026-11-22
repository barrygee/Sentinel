import { computed } from 'vue'
import {
  DEFAULT_REPLAY_OFFSET_MS,
  type PlaybackRate,
  type PlaybackSectionId,
} from '@sentinel/shell-api/playback/playbackSections'
import { usePlaybackStore } from '@sentinel/shell-api/stores/playback'

/** How far a step back or forward moves. */
export const REPLAY_STEP_MS = 60_000

/**
 * The replay panel's actions for one section. Any of them used while the
 * section is live starts replay first — the timeline at "now" is just its
 * live end, so dragging back, stepping back, typing a date or pressing play
 * all go back in time without a separate "start replay" step.
 */
export function useReplayControls(sectionId: PlaybackSectionId) {
  const playback = usePlaybackStore()
  const section = computed(() => playback.sections[sectionId])
  const replaying = computed(() => section.value.mode === 'replay')

  /** Jump to a moment, entering replay if live. */
  function seek(moment: number): void {
    if (replaying.value) playback.seek(sectionId, moment)
    else playback.enterReplay(sectionId, moment)
  }

  /** Step by `deltaMs` from the replayed moment (from now, when live). */
  function step(deltaMs: number): void {
    const from = replaying.value ? section.value.cursorMs : Date.now()
    seek(from + deltaMs)
  }

  /** Play or pause; playing from live starts an hour back so there is movement to see. */
  function togglePlaying(): void {
    if (!replaying.value) {
      playback.enterReplay(sectionId, Date.now() - DEFAULT_REPLAY_OFFSET_MS)
      playback.setPlaying(sectionId, true)
      return
    }
    playback.setPlaying(sectionId, !section.value.playing)
  }

  function setRate(rate: PlaybackRate): void {
    playback.setRate(sectionId, rate)
  }

  function goLive(): void {
    playback.exitReplay(sectionId)
  }

  return { section, replaying, seek, step, togglePlaying, setRate, goLive }
}
