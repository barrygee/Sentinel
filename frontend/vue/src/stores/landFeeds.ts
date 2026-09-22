import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as landFeedsApi from '@/services/landFeedsApi'
import type {
  CameraFeatureCollection,
  FeedConfig,
  FeedCredentialInput,
  FeedTestResult,
  FeedWithStatus,
} from '@/types/landFeeds'

/** Shortest interval a feed is ever polled at, regardless of its configured
 *  `refreshSeconds` — matches the backend poller's own floor (see the P0
 *  contract) so the frontend never hammers a feed faster than the backend
 *  actually refreshes it. */
const MIN_POLL_SECONDS = 15

/** How often the feed *list* itself (enabled/disabled, refresh interval,
 *  credential-configured flag) is re-read while polling is active, so an
 *  edit made in another tab/device is picked up without a reload. */
const FEED_LIST_REFRESH_MS = 30_000

/**
 * Land "live feeds" store — the configured feeds, their runtime status, and
 * their polled GeoJSON snapshots (traffic cameras in P0; more feature kinds
 * arrive with later phases).
 *
 * Polling is ref-counted like `land.ts`'s APRS polling: `startPolling()` is
 * meant to be called only while the Land view is mounted *and* the relevant
 * map layer is switched on (the control that owns the layer is the caller),
 * so an idle tab never fetches camera images no one is looking at.
 */
/** A geographic bounding box in plain degrees — simpler than MapLibre's own
 *  `LngLatBounds` type so the store (and anything reading it, like the
 *  sidebar's CAMERAS list) has no MapLibre dependency. */
export interface ViewportBounds {
  west: number
  south: number
  east: number
  north: number
}

export const useLandFeedsStore = defineStore('landFeeds', () => {
  const feeds = ref<FeedWithStatus[]>([])
  const featuresByFeed = ref<Record<string, CameraFeatureCollection>>({})

  // The Land map's current visible bounds, kept here (not in the map control)
  // so `LandFilter`'s CAMERAS section can bbox-filter the same way the map's
  // own markers do, without needing a MapLibre instance of its own — the same
  // "state that must survive teleport belongs in the store" reasoning as the
  // rest of the Land pane state (see `land.ts`'s SEARCH pane fields).
  const viewportBounds = ref<ViewportBounds | null>(null)
  function setViewportBounds(bounds: ViewportBounds): void {
    viewportBounds.value = bounds
  }

  let pollers = 0
  const featureTimers = new Map<string, ReturnType<typeof setInterval>>()
  let feedListTimer: ReturnType<typeof setInterval> | null = null

  /** Re-read the feed list (config + status) from the backend. */
  async function loadFeeds(): Promise<void> {
    feeds.value = await landFeedsApi.listFeeds()
  }

  /** Fetch one feed's latest feature snapshot, replacing what is held for it. */
  async function refresh(feedId: string): Promise<void> {
    const collection = await landFeedsApi.getFeatures(feedId)
    // Merge only after the await: feeds refresh concurrently, and spreading the
    // map before the fetch resolved let whichever finished last drop the
    // other's features.
    featuresByFeed.value = { ...featuresByFeed.value, [feedId]: collection }
  }

  /**
   * Reconcile per-feed polling timers against the current feed list: one
   * timer per *enabled* feed, at its own `refreshSeconds` (floored), started
   * with an immediate fetch; timers for feeds that were removed or disabled
   * since the last sync are cleared.
   */
  function syncTimers(): void {
    const enabledIds = new Set<string>()
    for (const feed of feeds.value) {
      if (!feed.enabled) continue
      enabledIds.add(feed.id)
      if (featureTimers.has(feed.id)) continue
      void refresh(feed.id)
      const intervalMs = Math.max(MIN_POLL_SECONDS, feed.refreshSeconds) * 1000
      featureTimers.set(
        feed.id,
        setInterval(() => void refresh(feed.id), intervalMs),
      )
    }
    for (const [feedId, timer] of featureTimers) {
      if (!enabledIds.has(feedId)) {
        clearInterval(timer)
        featureTimers.delete(feedId)
      }
    }
  }

  /** Begin polling (ref-counted). The first caller loads the feed list,
   *  starts per-feed timers, and re-syncs the list periodically; later
   *  callers just increment the count. */
  async function startPolling(): Promise<void> {
    pollers += 1
    if (pollers > 1) return
    await loadFeeds()
    syncTimers()
    feedListTimer = setInterval(() => {
      void loadFeeds().then(syncTimers)
    }, FEED_LIST_REFRESH_MS)
  }

  /** Stop polling when the last consumer leaves (ref-counted). */
  function stopPolling(): void {
    pollers = Math.max(0, pollers - 1)
    if (pollers > 0) return
    if (feedListTimer !== null) {
      clearInterval(feedListTimer)
      feedListTimer = null
    }
    for (const timer of featureTimers.values()) clearInterval(timer)
    featureTimers.clear()
  }

  /** Persist the whole feed list (Settings › LAND › LIVE CAMERA FEEDS' APPLY step),
   *  then re-read status and re-sync polling against the new list. */
  async function saveFeeds(list: FeedConfig[]): Promise<void> {
    await landFeedsApi.saveFeeds(list)
    await loadFeeds()
    if (pollers > 0) syncTimers()
  }

  const credentials = {
    get: (feedId: string) => landFeedsApi.getCredentialStatus(feedId),
    async set(feedId: string, body: FeedCredentialInput): Promise<void> {
      await landFeedsApi.setCredential(feedId, body)
      await loadFeeds()
    },
    async clear(feedId: string): Promise<void> {
      await landFeedsApi.clearCredential(feedId)
      await loadFeeds()
    },
  }

  function test(feedId: string): Promise<FeedTestResult> {
    return landFeedsApi.testFeed(feedId)
  }

  return {
    feeds,
    featuresByFeed,
    viewportBounds,
    setViewportBounds,
    loadFeeds,
    refresh,
    startPolling,
    stopPolling,
    saveFeeds,
    credentials,
    test,
  }
})
