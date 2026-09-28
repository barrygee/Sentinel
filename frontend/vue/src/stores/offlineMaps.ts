import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { usePersistedObject, usePersistedRef } from './_persist'
import {
  createOfflineRegion,
  deleteOfflineRegion,
  estimateOfflineArea as requestServerEstimate,
  getOfflineMapStatus,
  getOfflineRegion,
  listOfflineRegions,
  OfflineMapsApiError,
  type OfflineAreaEstimate,
  type OfflineMapStatus,
  type OfflineRegion,
} from '@/services/offlineMapsApi'
import { estimateOfflineArea, type OfflineAreaEstimateResult } from '@/utils/offlineMapEstimate'

/** How often outstanding (queued/running) regions are polled, in ms — see D5:
 *  one-directional and low-frequency, so polling was chosen over SSE/WebSocket. */
const REGION_POLL_INTERVAL_MS = 1500

/** Depth (max zoom) is clamped to this range by the backend; the slider matches it. */
export const OFFLINE_MIN_ZOOM = 6
export const OFFLINE_MAX_ZOOM = 14

const DRAFT_STORAGE_KEY = 'sentinel_offlineMapsDraft'
const LAST_CREATED_REGION_STORAGE_KEY = 'sentinel_offlineMapsLastCreatedRegionId'

const NON_TERMINAL_STATUSES = new Set(['queued', 'running'])

/** The area/depth/content selection the operator is building, before it is queued.
 *  A plain bbox rather than `null` corners: an unset draft is simply "no area drawn yet",
 *  which the map/fields read as empty via `hasDraftArea`, so every consumer has one shape
 *  to hold. */
export interface OfflineMapDraft {
  west: number
  south: number
  east: number
  north: number
  maxZoom: number
  includeBasemap: boolean
  includeTerrain: boolean
  label: string
}

const DRAFT_DEFAULTS: OfflineMapDraft = {
  west: 0,
  south: 0,
  east: 0,
  north: 0,
  // Street level with buildings. Inside the bundled UK archive a lower depth
  // loses nothing, but anywhere else the map stops gaining detail at this zoom.
  maxZoom: 14,
  includeBasemap: true,
  includeTerrain: true,
  label: '',
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonTerminal(region: OfflineRegion): boolean {
  return NON_TERMINAL_STATUSES.has(region.status)
}

/**
 * Offline map downloads — the store behind Settings › App Settings › Offline
 * Maps (`docs/plans/offline-map-downloads.md`). Holds:
 *
 * - `status`: the configured sources, free disk space and the calibration
 *   table the live estimate is computed from.
 * - `regions`: every known downloaded/downloading area, for the list and the
 *   map outlines.
 * - `draft`: the area/depth/content selection being built, kept here (not in
 *   component refs) so closing and reopening Settings — which teleports/
 *   remounts the panel — keeps it, per the project's "state that must survive
 *   teleport remounts belongs in the store" rule.
 * - `lastCreatedRegionId`: the most recently queued region, persisted only so
 *   the settings map can scroll/fly to it after a reload — it plays no part in
 *   deciding what gets polled (see below).
 * - `tiersVersion`: `status.tiers_version` mirrored here for convenience —
 *   domain maps watch it to know when to refresh their offline tile cache.
 *
 * Polling is driven entirely by `regions` itself, not by "the" active job: the
 * backend can run several jobs queued behind each other, and Settings may not
 * even be mounted while they finish. `fetchRegions()` is called once at app
 * bootstrap (`App.vue`); if that (or `createRegionFromDraft`, or a later
 * bootstrap-independent poll tick) turns up any `queued`/`running` region, a
 * single interval polls all of them until none remain — components may still
 * call `fetchRegions()`/`startPollingKnownRegions()` again on mount to force a
 * refresh, but nothing they do is required for polling to keep running or to
 * stop; only "any non-terminal region left in `regions`" decides that.
 */
export const useOfflineMapsStore = defineStore('offlineMaps', () => {
  const status = ref<OfflineMapStatus | null>(null)
  const regions = ref<OfflineRegion[]>([])
  const draft = usePersistedObject<OfflineMapDraft>(DRAFT_STORAGE_KEY, DRAFT_DEFAULTS)
  const lastCreatedRegionId = usePersistedRef<string>(
    LAST_CREATED_REGION_STORAGE_KEY,
    '',
    (candidate): candidate is string => typeof candidate === 'string',
  )
  /** Set while a region create request is in flight, so the form can disable itself. */
  const submitting = ref(false)
  /** The most recent rejection from creating a region (422/507/409/503), for the form to show. */
  const submitError = ref<string | null>(null)

  const tiersVersion = computed(() => status.value?.tiers_version ?? null)
  const hasDraftArea = computed(
    () => draft.value.west !== draft.value.east || draft.value.south !== draft.value.north,
  )
  const totalDownloadedBytes = computed(() =>
    regions.value
      .filter((region) => region.status === 'complete')
      .reduce((total, region) => total + (region.size_bytes ?? 0), 0),
  )

  let pollTimer: ReturnType<typeof setInterval> | undefined
  /** Guards a poll tick against overlap if a round trip runs long. */
  let pollInFlight = false

  /** Refresh configured sources / free space / calibration table. Call on app load. */
  async function fetchStatus(): Promise<void> {
    try {
      status.value = await getOfflineMapStatus()
    } catch {
      /* offline / transient — keep the last-known status */
    }
  }

  /**
   * Refresh the region list (newest first, per the endpoint's own ordering),
   * then start polling if that turned up anything still in progress. Safe to
   * call repeatedly (app bootstrap, and again whenever Settings opens).
   */
  async function fetchRegions(): Promise<void> {
    try {
      regions.value = await listOfflineRegions()
      startPollingKnownRegions()
    } catch {
      /* offline / transient — keep the last-known list */
    }
  }

  /** Live client-side estimate for the current draft, using `status.avg_tile_bytes`. */
  const draftEstimate = computed<OfflineAreaEstimateResult | null>(() => {
    if (!status.value || !hasDraftArea.value) return null
    return estimateOfflineArea({
      west: draft.value.west,
      south: draft.value.south,
      east: draft.value.east,
      north: draft.value.north,
      maxZoom: draft.value.maxZoom,
      includeBasemap: draft.value.includeBasemap,
      includeTerrain: draft.value.includeTerrain,
      avgTileBytes: status.value.avg_tile_bytes,
    })
  })

  /** The authoritative server-side estimate, only used pre-queue (see `createRegionFromDraft`). */
  async function fetchServerEstimate(): Promise<OfflineAreaEstimate | null> {
    if (!hasDraftArea.value) return null
    try {
      return await requestServerEstimate({
        west: draft.value.west,
        south: draft.value.south,
        east: draft.value.east,
        north: draft.value.north,
        max_zoom: draft.value.maxZoom,
        include_basemap: draft.value.includeBasemap,
        include_terrain: draft.value.includeTerrain,
      })
    } catch {
      return null
    }
  }

  function setDraftBbox(west: number, south: number, east: number, north: number): void {
    if (![west, south, east, north].every(isFiniteNumber)) return
    draft.value.west = west
    draft.value.south = south
    draft.value.east = east
    draft.value.north = north
  }

  /** Forget the drawn/typed area (back to "no area selected"). Depth, contents
   *  and label are kept, since they're choices about the next download. */
  function clearDraftArea(): void {
    draft.value.west = DRAFT_DEFAULTS.west
    draft.value.south = DRAFT_DEFAULTS.south
    draft.value.east = DRAFT_DEFAULTS.east
    draft.value.north = DRAFT_DEFAULTS.north
  }

  function setDraftMaxZoom(maxZoom: number): void {
    draft.value.maxZoom = Math.min(
      OFFLINE_MAX_ZOOM,
      Math.max(OFFLINE_MIN_ZOOM, Math.round(maxZoom)),
    )
  }

  function setDraftIncludeBasemap(include: boolean): void {
    draft.value.includeBasemap = include
  }

  function setDraftIncludeTerrain(include: boolean): void {
    draft.value.includeTerrain = include
  }

  function setDraftLabel(label: string): void {
    draft.value.label = label
  }

  /** Begin polling every currently-known non-terminal region — a no-op if one is
   *  already running, or if nothing needs it. Idempotent and safe to call from
   *  anywhere (app bootstrap, a component mounting, a region being created). */
  function startPollingKnownRegions(): void {
    if (pollTimer !== undefined) return
    if (!regions.value.some(isNonTerminal)) return
    pollTimer = setInterval(() => void pollKnownRegions(), REGION_POLL_INTERVAL_MS)
    void pollKnownRegions()
  }

  function stopPolling(): void {
    // clearInterval(undefined) is a no-op, so no "is there a timer" check is needed.
    clearInterval(pollTimer)
    pollTimer = undefined
  }

  /**
   * One poll tick: refreshes every currently non-terminal region. A single
   * region's poll failing (a transient network error) must not end tracking
   * of the others, or of itself — only a confirmed 404 (the row is genuinely
   * gone) removes a region; anything else is left as-is to retry next tick.
   */
  async function pollKnownRegions(): Promise<void> {
    if (pollInFlight) return
    const pendingIds = regions.value.filter(isNonTerminal).map((region) => region.id)
    if (pendingIds.length === 0) {
      stopPolling()
      return
    }
    pollInFlight = true
    try {
      let anyReachedTerminal = false
      for (const regionId of pendingIds) {
        try {
          const region = await getOfflineRegion(regionId)
          upsertRegion(region)
          if (!isNonTerminal(region)) anyReachedTerminal = true
        } catch (error) {
          if (error instanceof OfflineMapsApiError && error.status === 404) {
            regions.value = regions.value.filter((region) => region.id !== regionId)
          }
          // Any other failure (network blip, 5xx): leave the region as-is and
          // retry it on the next tick rather than dropping it from the list.
        }
      }
      // A completed/failed/cancelled job may have changed the served tiers (a
      // completed one always does) — one status refresh per tick covers every
      // region that finished this tick, rather than one per region.
      if (anyReachedTerminal) await fetchStatus()
    } finally {
      pollInFlight = false
      if (!regions.value.some(isNonTerminal)) stopPolling()
    }
  }

  function upsertRegion(region: OfflineRegion): void {
    const index = regions.value.findIndex((existing) => existing.id === region.id)
    if (index === -1) regions.value = [region, ...regions.value]
    else
      regions.value = regions.value.map((existing) =>
        existing.id === region.id ? region : existing,
      )
  }

  /**
   * Queue the current draft as a new download. Throws nothing — a rejection
   * (422/507/409/503 — the last including "too many outstanding jobs") is
   * captured in `submitError` for the form to render verbatim, matching the
   * rest of the settings surface's stage/commit controls, which never let a
   * caught API error become an unhandled rejection.
   */
  async function createRegionFromDraft(): Promise<boolean> {
    if (submitting.value || !hasDraftArea.value) return false
    submitting.value = true
    submitError.value = null
    try {
      const region = await createOfflineRegion({
        west: draft.value.west,
        south: draft.value.south,
        east: draft.value.east,
        north: draft.value.north,
        max_zoom: draft.value.maxZoom,
        include_basemap: draft.value.includeBasemap,
        include_terrain: draft.value.includeTerrain,
        label: draft.value.label.trim() || 'Untitled area',
      })
      upsertRegion(region)
      lastCreatedRegionId.value = region.id
      startPollingKnownRegions()
      return true
    } catch (error) {
      submitError.value =
        error instanceof OfflineMapsApiError ? error.message : 'Could not start the download.'
      return false
    } finally {
      submitting.value = false
    }
  }

  /** Cancel a queued/running download, or delete a finished region's files. */
  async function deleteRegion(regionId: string): Promise<void> {
    try {
      await deleteOfflineRegion(regionId)
    } catch (error) {
      // A 404 means the row is already gone (e.g. a cancel that raced
      // completion), so drop it as if the delete succeeded. Any other failure
      // leaves the row listed, because its files are still on disk.
      if (!(error instanceof OfflineMapsApiError && error.status === 404)) return
    }
    regions.value = regions.value.filter((region) => region.id !== regionId)
    await fetchStatus()
  }

  return {
    status,
    regions,
    draft,
    lastCreatedRegionId,
    submitting,
    submitError,
    tiersVersion,
    hasDraftArea,
    totalDownloadedBytes,
    draftEstimate,
    fetchStatus,
    fetchRegions,
    fetchServerEstimate,
    setDraftBbox,
    clearDraftArea,
    setDraftMaxZoom,
    setDraftIncludeBasemap,
    setDraftIncludeTerrain,
    setDraftLabel,
    startPollingKnownRegions,
    createRegionFromDraft,
    deleteRegion,
  }
})

export type OfflineMapsStore = ReturnType<typeof useOfflineMapsStore>
