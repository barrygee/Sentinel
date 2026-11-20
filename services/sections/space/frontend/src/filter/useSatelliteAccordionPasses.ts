import { ref, onUnmounted, type Ref } from 'vue'
import type { AccPass } from '../spacePassesUtils'

/** What `useSatelliteAccordionPasses` returns. */
export interface SatelliteAccordionPasses {
  /** The expanded satellite's passes in the next 24 hours, soonest first. */
  passes: Ref<AccPass[]>
  /** True while they are being computed. */
  loading: Ref<boolean>
  /** The UPCOMING PASSES status line: progress, an error, or when they were computed. */
  status: Ref<string>
  /** Clears the last satellite's passes and shows "computing" for a newly opened one. */
  begin: () => void
  /** Fetches a satellite's passes from the observer's location. */
  load: (noradId: string) => Promise<void>
  /** Drops the passes and stops any fetch and refresh tick, for a closed accordion. */
  stop: () => void
}

/**
 * The pass predictions for the satellite expanded in the Space FILTER pane:
 * one abortable fetch per opening, then a one-second tick that re-emits the
 * list so its countdowns stay live.
 *
 * @param getUserLocation the observer's `[lon, lat]`, or null when unset.
 */
export function useSatelliteAccordionPasses(
  getUserLocation: () => [number, number] | null,
): SatelliteAccordionPasses {
  const passes = ref<AccPass[]>([])
  const loading = ref(false)
  const status = ref('COMPUTING PASSES…')
  let fetchAbort: AbortController | null = null
  let tickInterval: ReturnType<typeof setInterval> | null = null

  function begin(): void {
    passes.value = []
    status.value = 'COMPUTING PASSES…'
    loading.value = true
  }

  function startTick(): void {
    /* v8 ignore start -- defensive: startTick only runs after a successful fetch, and stop
       clears tickInterval before any subsequent open, so it is always null here. */
    if (tickInterval) clearInterval(tickInterval)
    /* v8 ignore stop */
    tickInterval = setInterval(() => {
      passes.value = [...passes.value]
    }, 1000)
  }

  async function load(noradId: string): Promise<void> {
    /* v8 ignore start -- defensive: every opening is preceded by stop (which aborts and
       nulls fetchAbort), and the restore path runs only once on load, so fetchAbort is
       always null on entry. The pane has no periodic refresh that would re-enter while a
       fetch is live. */
    if (fetchAbort) {
      fetchAbort.abort()
    }
    /* v8 ignore stop */
    fetchAbort = new AbortController()
    const abort = fetchAbort
    const location = getUserLocation()
    if (!location) {
      status.value = 'SET LOCATION TO CALCULATE PASSES'
      loading.value = false
      return
    }
    const [lon, lat] = location
    try {
      const url = `/api/space/satellite/${encodeURIComponent(noradId)}/passes?lat=${lat}&lon=${lon}&hours=24&min_el=0`
      const response = await fetch(url, { signal: abort.signal })
      if (abort.signal.aborted) return
      if (!response.ok) {
        status.value = 'COULD NOT LOAD PASSES'
        loading.value = false
        return
      }
      const body = (await response.json()) as { passes: AccPass[]; computed_at: string }
      const computedAt = new Date(body.computed_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      status.value = `NEXT 24H · UPDATED ${computedAt}`
      passes.value = body.passes || []
      loading.value = false
      startTick()
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return
      status.value = 'NETWORK ERROR'
      loading.value = false
    }
  }

  function stop(): void {
    passes.value = []
    if (fetchAbort) {
      fetchAbort.abort()
      fetchAbort = null
    }
    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
  }

  onUnmounted(() => {
    if (fetchAbort) fetchAbort.abort()
    if (tickInterval) clearInterval(tickInterval)
  })

  return { passes, loading, status, begin, load, stop }
}
