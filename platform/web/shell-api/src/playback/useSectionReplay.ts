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
 * `dispose` if the map unmounts while replaying.
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
  onScopeDispose(() => {
    if (playback.sections[sectionId].mode === 'replay') handlers.dispose?.()
  })
}
