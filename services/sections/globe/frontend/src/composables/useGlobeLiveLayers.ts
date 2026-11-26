import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import {
  DRAWN_LAYERS,
  type Bbox,
  type DrawnLayerId,
  type LayerItems,
  type LayerResult,
} from '../feeds/globeFeedTypes'
import type { GlobeFeedRequest } from '../feeds/globeFeedQuery'
import { aircraftObject, aprsObject, vesselObject } from '../feeds/globeObjects'
import { layerNotices, type LayerNotice } from '../feeds/layerNotices'
import { useGlobeObjects } from '../feeds/useGlobeObjects'
import type { LatLon } from '../globe/geo'
import type { GlobeObject } from '../globe/globeObject'
import { useGlobeLayerSettings } from './useGlobeLayerSettings'

/** An item of any drawn layer, tagged with its layer. */
export type LayerItem = {
  [Layer in DrawnLayerId]: { layer: Layer; item: LayerItems[Layer] }
}[DrawnLayerId]

/** What {@link useGlobeLiveLayers} returns. */
export interface GlobeLiveLayers {
  /** Which layers are on (`globe.layers`). */
  visible: ComputedRef<Record<DrawnLayerId, boolean>>
  /** Shows or hides a layer, and saves it. */
  setLayer: (layer: DrawnLayerId, visible: boolean) => void
  /** Each layer's drawable objects. */
  objects: ComputedRef<Record<DrawnLayerId, GlobeObject[]>>
  /** Objects per layer, or null while a layer is off, loading or unavailable. */
  counts: ComputedRef<Record<DrawnLayerId, number | null>>
  /** Why layers are empty, for the notices. */
  notices: ComputedRef<LayerNotice[]>
  /** The feed item behind an object key, if it is still in the feed. */
  findItem: (key: string) => LayerItem | null
}

const TO_OBJECT: { [Layer in DrawnLayerId]: (item: LayerItems[Layer]) => GlobeObject } = {
  air: aircraftObject,
  sea: vesselObject,
  aprs: aprsObject,
}

/** Failures that are usually over by the next poll: keep showing what was there. */
const TRANSIENT_REASONS = new Set(['timeout', 'error'])
/** How long a layer keeps its last good objects through transient failures. */
const STALE_KEEP_MS = 60_000

function perLayer<Value>(make: (layer: DrawnLayerId) => Value): Record<DrawnLayerId, Value> {
  return Object.fromEntries(DRAWN_LAYERS.map((layer) => [layer, make(layer)])) as Record<
    DrawnLayerId,
    Value
  >
}

/**
 * The globe's live layers: the saved toggles, the combined feed polled for
 * the layers that are on (aircraft round `home`, vessels in `viewBbox`), and
 * the feed turned into drawable objects, counts and notices. Call from a
 * component's setup.
 */
export function useGlobeLiveLayers(
  home: Ref<LatLon | null>,
  viewBbox: Ref<Bbox | null>,
): GlobeLiveLayers {
  const settings = useGlobeLayerSettings()
  const visible = computed(() => perLayer((layer) => settings.layers.value[layer]))

  const request = computed<GlobeFeedRequest>(() => ({
    layers: DRAWN_LAYERS.filter((layer) => visible.value[layer]),
    viewBbox: viewBbox.value,
    home: home.value,
    satellites: [],
  }))
  const feed = useGlobeObjects(request)

  // Each layer's last good answer, so one slow or failed answer doesn't empty it.
  const lastGood = ref<Partial<Record<DrawnLayerId, { result: LayerResult; atMs: number }>>>({})
  watch(feed.layers, (layers) => {
    const nowMs = Date.now()
    const kept = { ...lastGood.value }
    for (const layer of DRAWN_LAYERS) {
      const result = layers[layer]
      if (!result) delete kept[layer]
      else if (result.status === 'ok') kept[layer] = { result, atMs: nowMs }
    }
    lastGood.value = kept
  })

  /** The feed's answer per layer, with a transient failure replaced by the last good items. */
  const results = computed(() => {
    const nowMs = Date.now()
    const merged: Partial<Record<DrawnLayerId, LayerResult<LayerItems[DrawnLayerId]>>> = {}
    for (const layer of DRAWN_LAYERS) {
      const result = feed.layers.value[layer]
      if (!result) continue
      const previous = lastGood.value[layer]
      const transient =
        result.status === 'unavailable' && TRANSIENT_REASONS.has(result.reason ?? '')
      merged[layer] = (
        transient && previous && nowMs - previous.atMs <= STALE_KEEP_MS
          ? { ...previous.result, meta: { ...previous.result.meta, staleReason: result.reason } }
          : result
      ) as LayerResult<LayerItems[DrawnLayerId]>
    }
    return merged
  })

  // Each ok layer's items with their drawable objects, mapped once per answer.
  const entries = computed(() =>
    perLayer((layer) => {
      const result = results.value[layer]
      if (result?.status !== 'ok') return []
      const toObject = TO_OBJECT[layer] as (item: LayerItems[DrawnLayerId]) => GlobeObject
      return result.items.map((item) => ({
        object: toObject(item),
        found: { layer, item } as LayerItem,
      }))
    }),
  )

  const objects = computed(() =>
    perLayer((layer) => entries.value[layer].map((entry) => entry.object)),
  )

  // Items keyed the way objects are, so a selection can find its data again.
  const itemsByKey = computed(
    () =>
      new Map(
        DRAWN_LAYERS.flatMap((layer) =>
          entries.value[layer].map((entry) => [entry.object.key, entry.found] as const),
        ),
      ),
  )

  const counts = computed(() =>
    perLayer((layer) => {
      const result = results.value[layer]
      return result?.status === 'ok' ? result.items.length : null
    }),
  )

  const notices = computed(() =>
    layerNotices(
      results.value as Partial<Record<DrawnLayerId, LayerResult>>,
      feed.feedUnreachable.value,
    ),
  )

  return {
    visible,
    setLayer: settings.setLayer,
    objects,
    counts,
    notices,
    findItem: (key) => itemsByKey.value.get(key) ?? null,
  }
}
