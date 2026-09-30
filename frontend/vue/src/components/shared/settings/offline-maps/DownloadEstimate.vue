<template>
  <div class="oma-estimate">
    <div
      class="oma-estimate-headline"
      :class="{ 'oma-estimate-headline--warning': exceedsFreeSpace }"
    >
      <span class="oma-estimate-size">Up to {{ formatByteSize(estimate?.totalBytes ?? 0) }}</span>
      <span class="oma-estimate-tiles"
        >· {{ formatTileCount(totalTiles) }} tile{{ totalTiles === 1 ? '' : 's' }}</span
      >
    </div>
    <dl class="oma-estimate-breakdown">
      <div class="oma-estimate-row">
        <dt>Basemap</dt>
        <dd>Up to {{ formatByteSize(estimate?.basemapBytes ?? 0) }}</dd>
      </div>
      <div class="oma-estimate-row">
        <dt>Terrain</dt>
        <dd>Up to {{ formatByteSize(estimate?.terrainBytes ?? 0) }}</dd>
      </div>
      <div class="oma-estimate-row">
        <dt>Free space</dt>
        <dd>{{ formatByteSize(freeBytes) }}</dd>
      </div>
    </dl>
    <p v-if="exceedsFreeSpace" class="oma-estimate-warning" role="alert">
      This exceeds the free disk space available — reduce the area, depth, or contents to continue.
    </p>
    <!-- Announces only the debounced, settled value — a raw drag/slider stream would otherwise
         flood a screen reader with a new number on every frame. -->
    <p class="sr-only" aria-live="polite">{{ announced }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * `DownloadEstimate` — the live "Up to 1.2 GB · 184,300 tiles" preview, split into
 * basemap/terrain against free disk space, per the plan's "no size cap"
 * decision (Q3): the estimate is the only signal, and it turns to a warning
 * style — the sole reason Download is disabled — when it exceeds free space.
 *
 * Recomputes on every drag frame/field edit/checkbox toggle (the parent
 * passes a fresh `estimate` each time via the store's `draftEstimate`), but
 * the `aria-live` announcement is debounced ~500 ms so a screen reader hears
 * one settled sentence rather than a number for every intermediate frame.
 *
 * Every figure is labelled "Up to": the per-tile sizes behind it are a worst
 * case (they ignore the archive storing identical sea tiles once, and terrain
 * having none over open sea), so a coastal area can download at well under
 * half of it. A worst case is what the free-space check needs.
 */
import { onUnmounted, ref, watch } from 'vue'
import {
  formatByteSize,
  formatTileCount,
  OFFLINE_DISK_MARGIN_RATIO,
  type OfflineAreaEstimateResult,
} from '@/utils/offlineMapEstimate'

const ANNOUNCE_DEBOUNCE_MS = 500

const props = defineProps<{
  estimate: OfflineAreaEstimateResult | null
  freeBytes: number
}>()

const totalTiles = ref(0)
watch(
  () => props.estimate,
  (estimate) => {
    totalTiles.value = (estimate?.basemapTiles ?? 0) + (estimate?.terrainTiles ?? 0)
  },
  { immediate: true },
)

const exceedsFreeSpace = ref(false)
watch(
  () => [props.estimate?.totalBytes, props.freeBytes] as const,
  ([totalBytes, freeBytes]) => {
    exceedsFreeSpace.value = (totalBytes ?? 0) * OFFLINE_DISK_MARGIN_RATIO > freeBytes
  },
  { immediate: true },
)

const announced = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.estimate,
  (estimate) => {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const tiles = (estimate?.basemapTiles ?? 0) + (estimate?.terrainTiles ?? 0)
      announced.value = estimate
        ? `Estimated download: up to ${formatByteSize(estimate.totalBytes)}, ${formatTileCount(tiles)} tiles.`
        : 'No area selected yet.'
    }, ANNOUNCE_DEBOUNCE_MS)
  },
  { immediate: true },
)

onUnmounted(() => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
})
</script>

<style scoped>
.oma-estimate {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.oma-estimate-headline {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: var(--settings-text-value);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink);
}

.oma-estimate-headline--warning {
  color: var(--danger);
}

.oma-estimate-tiles {
  font-size: var(--settings-text-body);
  font-weight: 400;
  color: rgba(var(--ink-rgb), 0.6);
}

.oma-estimate-breakdown {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.oma-estimate-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--settings-text-body);
  line-height: 1.5;
  color: rgba(var(--ink-rgb), 0.6);
}

.oma-estimate-row dt,
.oma-estimate-row dd {
  margin: 0;
}

.oma-estimate-warning {
  margin: 0;
  font-size: var(--settings-text-small);
  font-weight: 500;
  line-height: 1.45;
  color: var(--danger-hover);
}
</style>
