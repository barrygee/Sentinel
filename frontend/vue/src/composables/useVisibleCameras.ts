import { computed, type ComputedRef } from 'vue'
import { useLandStore } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
import type { CameraFeature, FeedWithStatus } from '@/types/landFeeds'

/** One live-feed source and the cameras of it currently inside the map view. */
export interface VisibleCameraSource {
  feed: FeedWithStatus
  /** Cameras inside the viewport, in the order the feed lists them. */
  visible: CameraFeature[]
  /** Every camera the feed currently reports, viewport or not. */
  total: number
  /** The licence line the source requires to be shown alongside its images
   *  ('' when the feed carries none). */
  attribution: string
}

/**
 * The traffic cameras the Land map is plotting right now, grouped by source.
 *
 * Reads the shared `landFeeds` store — the same snapshot and the same viewport
 * bounds `TrafficCamerasControl` renders from — rather than a MapLibre
 * instance of its own, so the sidebar and the map always agree on which
 * cameras are "in view". An empty list when the layer is hidden mirrors the
 * APRS pane: hiding a layer empties both, instead of the panel listing things
 * that aren't on the map.
 *
 * Sources come out in the order the operator configured them; feeds that are
 * disabled or have nothing in view are still listed (with an empty `visible`)
 * so the pane can say so rather than silently drop a source.
 */
export function useVisibleCameras(): {
  sources: ComputedRef<VisibleCameraSource[]>
  visibleCameras: ComputedRef<CameraFeature[]>
  cameraById: (featureId: string) => CameraFeature | undefined
} {
  const landStore = useLandStore()
  const landFeedsStore = useLandFeedsStore()

  const sources = computed<VisibleCameraSource[]>(() => {
    if (!landStore.trafficCamerasLayerVisible) return []
    const bounds = landFeedsStore.viewportBounds
    return landFeedsStore.feeds
      .filter((feed) => feed.enabled)
      .map((feed) => {
        const features = landFeedsStore.featuresByFeed[feed.id]?.features ?? []
        const visible = bounds
          ? features.filter((feature) => {
              const [longitude, latitude] = feature.geometry.coordinates
              return (
                longitude >= bounds.west &&
                longitude <= bounds.east &&
                latitude >= bounds.south &&
                latitude <= bounds.north
              )
            })
          : features
        return {
          feed,
          visible,
          total: features.length,
          attribution: features[0]?.properties.attribution ?? '',
        }
      })
  })

  const visibleCameras = computed<CameraFeature[]>(() =>
    sources.value.flatMap((source) => source.visible),
  )

  function cameraById(featureId: string): CameraFeature | undefined {
    for (const collection of Object.values(landFeedsStore.featuresByFeed)) {
      const match = collection.features.find((feature) => feature.properties.id === featureId)
      if (match) return match
    }
    return undefined
  }

  return { sources, visibleCameras, cameraById }
}
