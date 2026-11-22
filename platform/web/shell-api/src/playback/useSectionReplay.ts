import { onScopeDispose, watch } from 'vue'
import type { PlaybackSectionId } from '@sentinel/shell-api/playback/playbackSections'
import { usePlaybackStore } from '@sentinel/shell-api/stores/playback'

/** What a section's map does when its replay starts, jumps or ends. */
export interface SectionReplayHandlers {
  /** Swap the live feed for the recording. */
  enter: () => void
  /** Back to the live feed. */
  exit: () => void
  /** The cursor jumped (seek, step): draw the new moment now. */
  jumped?: () => void
  /**
   * The map is going away mid-replay (the section was left): stop anything
   * that would outlive it, such as a store's replay timer. Replay itself stays
   * on, and `enter` runs again when the map comes back.
   */
  dispose?: () => void
}

/**
 * Connects a section's map to its replay state: calls `enter`/`exit` as the
 * section goes in and out of replay — straight away too when the map mounts
 * mid-replay (the section was left and reopened) — `jumped` on each seek, and
 * `dispose` if the map unmounts while replaying. It also runs the playback loop.
 * Call from the map component's setup; the watchers end with it.
 */
export function useSectionReplay(
  sectionId: PlaybackSectionId,
  handlers: SectionReplayHandlers,
): void {
  const playback = usePlaybackStore()
  watch(
    () => playback.sections[sectionId].mode,
    (mode, previousMode) => {
      if (mode === 'replay') handlers.enter()
      else if (previousMode === 'replay') handlers.exit()
    },
    { immediate: true },
  )
  watch(
    () => playback.sections[sectionId].seekVersion,
    () => {
      if (playback.sections[sectionId].mode === 'replay') handlers.jumped?.()
    },
  )
  usePlaybackLoop(sectionId)
  onScopeDispose(() => {
    if (playback.sections[sectionId].mode === 'replay') handlers.dispose?.()
  })
}

/**
 * While the section plays, move its cursor on every animation frame by the
 * elapsed wall time × speed (`playback.advance`, which returns to live on
 * reaching the present). It runs with the map, not the panel, so playback
 * carries on with the side panel closed.
 */
function usePlaybackLoop(sectionId: PlaybackSectionId): void {
  const playback = usePlaybackStore()
  let animationFrame: number | null = null
  let lastFrameAt: number | null = null

  function stop(): void {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    animationFrame = null
    lastFrameAt = null
  }

  function onFrame(timestamp: number): void {
    if (lastFrameAt !== null) playback.advance(sectionId, timestamp - lastFrameAt)
    lastFrameAt = timestamp
    animationFrame = playback.sections[sectionId].playing ? requestAnimationFrame(onFrame) : null
  }

  watch(
    () => playback.sections[sectionId].playing,
    (playing) => {
      stop()
      if (playing) animationFrame = requestAnimationFrame(onFrame)
    },
    { immediate: true },
  )
  onScopeDispose(stop)
}
