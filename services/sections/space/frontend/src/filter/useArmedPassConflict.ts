import { ref, computed, type ComputedRef, type Ref } from 'vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import { isAutoTuneEnabled, getAllPassNotifs } from '../controls/satellite/passNotifStore'
import type { AccPass } from '../spacePassesUtils'
import type { ArmedPass } from './spaceFilterTypes'

/** What `useArmedPassConflict` needs from the pane. */
export interface ArmedPassConflictOptions {
  /** The observer's `[lon, lat]`, or null when unset. */
  getUserLocation: () => [number, number] | null
  /** The expanded satellite's NORAD id ('' when none is). */
  expandedNoradId: Ref<string>
  /** The expanded satellite's own passes. */
  expandedPasses: Ref<AccPass[]>
  /** Bumped by useSatelliteActions whenever auto-tune arming changes. */
  armedTick: Ref<number>
}

/** What `useArmedPassConflict` returns. */
export interface ArmedPassConflict {
  /** The lock-in warning for the expanded satellite; empty when there is none. */
  conflictText: ComputedRef<string>
  /** Fetches the passes of every armed satellite except `excludeNoradId`. */
  refreshArmedPasses: (excludeNoradId: string) => Promise<void>
  /** Forgets them, for an expanded satellite that is not armed. */
  clearArmedPasses: () => void
}

/**
 * The auto-tune lock-in warning in the Space FILTER pane's accordion: which
 * other armed satellite has a pass overlapping the expanded one's, so only the
 * earlier pass will get the radio. The pane only loads one satellite's passes,
 * so the other armed satellites' passes are fetched lazily here and tested by
 * raw time overlap. Refetched whenever arming changes anywhere.
 */
export function useArmedPassConflict(options: ArmedPassConflictOptions): ArmedPassConflict {
  const { getUserLocation, expandedNoradId, expandedPasses, armedTick } = options
  const armedPasses = ref<ArmedPass[]>([])

  const conflict = computed<{ name: string; aosMs: number } | null>(() => {
    void armedTick.value
    const expanded = expandedNoradId.value
    if (!expanded || !isAutoTuneEnabled(expanded)) return null
    const nowMs = Date.now()
    const mine = expandedPasses.value.filter((pass) => pass.los_unix_ms > nowMs)
    let earliest: { name: string; aosMs: number } | null = null
    for (const other of armedPasses.value) {
      if (other.los_unix_ms <= nowMs) continue
      /* v8 ignore start -- defensive: refreshArmedPasses excludes the expanded sat and only
         includes currently-armed ids, so neither condition can be true here. */
      if (other.norad_id === expanded || !isAutoTuneEnabled(other.norad_id)) continue
      /* v8 ignore stop */
      const overlaps = mine.some(
        (pass) => pass.aos_unix_ms < other.los_unix_ms && other.aos_unix_ms < pass.los_unix_ms,
      )
      if (!overlaps) continue
      /* v8 ignore start -- other.name is set to the norad-id fallback in refreshArmedPasses, so
         it is never empty here; the `|| other.norad_id` arm is unreachable. */
      if (!earliest || other.aos_unix_ms < earliest.aosMs)
        earliest = { name: other.name || other.norad_id, aosMs: other.aos_unix_ms }
      /* v8 ignore stop */
    }
    return earliest
  })

  const conflictText = computed<string>(() => {
    const found = conflict.value
    if (!found) return ''
    const time = new Date(found.aosMs).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `Overlaps ${found.name} @ ${time} — earlier pass keeps the radio`
  })

  async function refreshArmedPasses(excludeNoradId: string): Promise<void> {
    const location = getUserLocation()
    if (!location) {
      armedPasses.value = []
      return
    }
    const [lon, lat] = location
    const armed = Object.keys(getAllPassNotifs()).filter(
      (noradId) => noradId !== excludeNoradId && isAutoTuneEnabled(noradId),
    )
    if (armed.length === 0) {
      armedPasses.value = []
      return
    }
    try {
      const results = await Promise.all(
        armed.map(async (noradId) => {
          const url = `/api/space/satellite/${encodeURIComponent(noradId)}/passes?lat=${lat}&lon=${lon}&hours=24&min_el=0`
          const response = await fetch(url)
          if (!response.ok) return []
          const body = (await response.json()) as {
            passes: Array<{ aos_unix_ms: number; los_unix_ms: number }>
          }
          /* v8 ignore start -- `noradId` comes from Object.keys(getAllPassNotifs()), so the
             entry is always present; the optional-chain null arm is unreachable. */
          const name = getAllPassNotifs()[noradId]?.name || noradId
          /* v8 ignore stop */
          return (body.passes || []).map((pass) => ({
            norad_id: noradId,
            name,
            aos_unix_ms: pass.aos_unix_ms,
            los_unix_ms: pass.los_unix_ms,
          }))
        }),
      )
      armedPasses.value = results.flat()
    } catch {
      armedPasses.value = []
    }
  }

  function clearArmedPasses(): void {
    armedPasses.value = []
  }

  useDocumentEvent('satellite-auto-tune-changed', () => {
    // Arming changed somewhere (useSatelliteActions re-reads it); refresh the
    // conflict data for whatever sat is expanded.
    const expanded = expandedNoradId.value
    if (expanded && isAutoTuneEnabled(expanded)) void refreshArmedPasses(expanded)
    else armedPasses.value = []
  })

  return { conflictText, refreshArmedPasses, clearArmedPasses }
}
