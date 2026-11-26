import { computed, onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import { globeFeedUrl, type GlobeFeedRequest } from './globeFeedQuery'
import type { GlobeLayerId, GlobeObjectsResponse, LayerResult } from './globeFeedTypes'

/** How often the feed is polled while the page is visible. */
export const GLOBE_POLL_INTERVAL_MS = 5_000

/**
 * A request change (a layer switched on, the view settling somewhere new)
 * waits this long before fetching, so a burst of changes makes one request.
 */
const CHANGE_DEBOUNCE_MS = 250

/** What {@link useGlobeObjects} returns. */
export interface GlobeObjectsHandle {
  /** The latest result per requested layer (a layer switched off drops out at once). */
  layers: Ref<Partial<Record<GlobeLayerId, LayerResult>>>
  /** True when the last request failed outright (the globe service itself is unreachable). */
  feedUnreachable: Ref<boolean>
}

/**
 * Polls the globe's combined feed, `GET /api/globe/objects`, every
 * {@link GLOBE_POLL_INTERVAL_MS} for the lifetime of the calling component.
 *
 * Only the layers that are on are asked for, with the view bbox (vessels),
 * the home location (aircraft) and the chosen satellites. A change to any of
 * them fetches again straight away (debounced). Polling stops while the tab
 * is hidden and on unmount, and a request still in flight is aborted then.
 *
 * @param request the reactive inputs of the next request.
 */
export function useGlobeObjects(request: Ref<GlobeFeedRequest>): GlobeObjectsHandle {
  const latest = shallowRef<Partial<Record<GlobeLayerId, LayerResult>>>({})
  const feedUnreachable = shallowRef(false)
  const url = computed(() => globeFeedUrl(request.value))
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let inFlight: AbortController | null = null
  let active = false

  // A layer that is switched off disappears at once, not at the next answer.
  const layers = computed(() => {
    const wanted = new Set(request.value.layers)
    return Object.fromEntries(
      Object.entries(latest.value).filter(([layer]) => wanted.has(layer as GlobeLayerId)),
    ) as Partial<Record<GlobeLayerId, LayerResult>>
  })

  const schedule = (delayMs: number): void => {
    clearTimeout(pollTimer)
    if (active && !document.hidden) pollTimer = setTimeout(() => void poll(), delayMs)
  }

  async function poll(): Promise<void> {
    inFlight?.abort()
    const target = url.value
    if (!target) {
      latest.value = {}
      feedUnreachable.value = false
      return
    }
    const controller = new AbortController()
    inFlight = controller
    try {
      const response = await fetch(target, { signal: controller.signal })
      if (!response.ok) throw new Error(`globe feed answered ${response.status}`)
      const body = (await response.json()) as GlobeObjectsResponse
      if (controller.signal.aborted) return
      latest.value = body.layers ?? {}
      feedUnreachable.value = false
    } catch {
      // An abort is ours (a newer request or unmount); anything else means the
      // globe service is down or restarting: keep the last objects, say so.
      if (controller.signal.aborted) return
      feedUnreachable.value = true
    } finally {
      if (inFlight === controller) {
        inFlight = null
        schedule(GLOBE_POLL_INTERVAL_MS)
      }
    }
  }

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      clearTimeout(pollTimer)
      inFlight?.abort()
      inFlight = null
    } else {
      schedule(0)
    }
  }

  watch(url, () => schedule(CHANGE_DEBOUNCE_MS))
  useDocumentEvent('visibilitychange', onVisibilityChange)

  onMounted(() => {
    active = true
    schedule(0)
  })

  onBeforeUnmount(() => {
    active = false
    clearTimeout(pollTimer)
    inFlight?.abort()
    inFlight = null
  })

  return { layers, feedUnreachable }
}
