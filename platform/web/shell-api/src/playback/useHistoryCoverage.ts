import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { fetchHistoryCoverage } from '@sentinel/shell-api/playback/historyApi'
import type { PlaybackSectionId } from '@sentinel/shell-api/playback/playbackSections'

/** A stretch of the timeline that holds recorded data, and which feed heard it. */
export interface CoverageSpan {
  start: number
  end: number
  source: string
}

/** Re-read this often while shown, so new recordings appear on the timeline. */
export const COVERAGE_REFRESH_MS = 60_000

/**
 * The recorded stretches of a section's retention window, kept fresh while
 * `active` is true (the replay panel is showing). A section with no recorded
 * coverage (Space recomputes any moment from orbital elements) reports none,
 * and its whole window counts as playable.
 */
export function useHistoryCoverage(
  sectionId: PlaybackSectionId,
  hasCoverage: boolean,
  active: Ref<boolean>,
): { spans: Ref<CoverageSpan[]>; sourceAt: (moment: number) => string | null } {
  const spans = ref<CoverageSpan[]>([])
  let refreshTimer: ReturnType<typeof setInterval> | undefined

  async function load(): Promise<void> {
    const coverage = await fetchHistoryCoverage(sectionId)
    if (!coverage) return
    spans.value = coverage.buckets.map(([start, , source]) => ({
      start,
      end: start + coverage.bucketMs,
      source,
    }))
  }

  if (hasCoverage) {
    watch(
      active,
      (isActive) => {
        clearInterval(refreshTimer)
        refreshTimer = undefined
        if (!isActive) return
        void load()
        refreshTimer = setInterval(() => void load(), COVERAGE_REFRESH_MS)
      },
      { immediate: true },
    )
    onScopeDispose(() => clearInterval(refreshTimer))
  }

  /** 'online' / 'off grid' for a moment inside recorded data, else null. */
  function sourceAt(moment: number): string | null {
    const span = spans.value.find((band) => band.start <= moment && moment < band.end)
    if (!span) return null
    return span.source === 'offgrid' ? 'off grid' : 'online'
  }

  return { spans, sourceAt }
}
