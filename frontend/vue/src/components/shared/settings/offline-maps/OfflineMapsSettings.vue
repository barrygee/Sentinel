<template>
  <div class="oma-shell">
    <OfflineAreaMap
      ref="areaMapRef"
      :selection="hasArea ? draftBounds : null"
      :regions="completedRegionBounds"
      @draw-complete="onDrawComplete"
      @armed-change="drawArmed = $event"
    />

    <div class="oma-form">
      <AreaSelector
        :armed="drawArmed"
        :get-current-view-bounds="getCurrentViewBounds"
        @toggle-draw="onToggleDraw"
        @area-selected="onDrawComplete"
      />

      <BboxFields :bounds="draftBounds" @update:bounds="onBoundsFieldsUpdate" />

      <DepthPicker
        v-model="maxZoomModel"
        :min-zoom="OFFLINE_MIN_ZOOM"
        :max-zoom="OFFLINE_MAX_ZOOM"
        :terrain-max-zoom="terrainMaxZoom"
      />

      <ContentChecks
        :include-basemap="store.draft.includeBasemap"
        :include-terrain="store.draft.includeTerrain"
        :max-zoom="store.draft.maxZoom"
        :terrain-max-zoom="terrainMaxZoom"
        @update:include-basemap="store.setDraftIncludeBasemap"
        @update:include-terrain="store.setDraftIncludeTerrain"
      />

      <div class="oma-label-field">
        <label class="oma-label-label" for="oma-label-input">LABEL</label>
        <input
          id="oma-label-input"
          type="text"
          class="oma-label-input"
          maxlength="60"
          placeholder="e.g. Lake District"
          :value="store.draft.label"
          @input="store.setDraftLabel(($event.target as HTMLInputElement).value)"
        />
      </div>

      <DownloadEstimate
        :estimate="store.draftEstimate"
        :free-bytes="store.status?.free_bytes ?? 0"
      />

      <p v-if="downloadDisabledReason" class="oma-disabled-reason" role="alert">
        {{ downloadDisabledReason }}
      </p>
      <p v-if="store.submitError" class="oma-disabled-reason" role="alert">
        {{ store.submitError }}
      </p>

      <BaseButton
        type="button"
        variant="primary"
        :disabled="downloadDisabledReason !== null || store.submitting"
        @click="onDownload"
      >
        DOWNLOAD
      </BaseButton>

      <RegionList
        :regions="store.regions"
        :total-bytes="store.totalDownloadedBytes"
        @select-region="onSelectRegion"
        @delete-region="store.deleteRegion"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `OfflineMapsSettings` — the shell composing every Offline Maps sub-piece
 * (owner decision: this is the ONLY place the feature lives — no controls on
 * the domain maps). Registered in `SettingsPanel.vue`'s `ALL_SETTINGS` under
 * `section: 'app'`.
 *
 * Owns the wiring between pieces that can't reach each other directly: the
 * map's imperative draw surface (`OfflineAreaMap`'s exposed ref) and the
 * form's buttons (`AreaSelector`), and the store that is everyone else's
 * single source of truth for the draft/regions/status.
 */
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { OFFLINE_MAX_ZOOM, OFFLINE_MIN_ZOOM, useOfflineMapsStore } from '@/stores/offlineMaps'
import { OFFLINE_DISK_MARGIN_RATIO } from '@/utils/offlineMapEstimate'
import BaseButton from '@/components/base/BaseButton.vue'
import OfflineAreaMap from './OfflineAreaMap.vue'
import AreaSelector from './AreaSelector.vue'
import BboxFields from './BboxFields.vue'
import DepthPicker from './DepthPicker.vue'
import ContentChecks from './ContentChecks.vue'
import DownloadEstimate from './DownloadEstimate.vue'
import RegionList from './RegionList.vue'
import type { LngLatBounds } from './rectangleDrawHandler'
import { isBboxValid } from './bboxValidation'
import type { OfflineRegion } from '@/services/offlineMapsApi'

const appStore = useAppStore()
const store = useOfflineMapsStore()

const areaMapRef = ref<InstanceType<typeof OfflineAreaMap> | null>(null)
const drawArmed = ref(false)

const hasArea = computed(() => store.hasDraftArea)
const draftBounds = computed<LngLatBounds>(() => ({
  west: store.draft.west,
  south: store.draft.south,
  east: store.draft.east,
  north: store.draft.north,
}))

const terrainMaxZoom = computed(() => store.status?.terrain_max_zoom ?? 12)

const completedRegionBounds = computed<LngLatBounds[]>(() =>
  store.regions
    .filter((region) => region.status === 'complete')
    .map((region) => ({
      west: region.west,
      south: region.south,
      east: region.east,
      north: region.north,
    })),
)

const maxZoomModel = computed({
  get: () => store.draft.maxZoom,
  set: (value: number) => store.setDraftMaxZoom(value),
})

const downloadDisabledReason = computed<string | null>(() => {
  if (!store.hasDraftArea) return 'Draw or enter an area first.'
  if (!isBboxValid(draftBounds.value)) return 'Fix the highlighted area bounds before downloading.'
  if (!store.draft.includeBasemap && !store.draft.includeTerrain) {
    return 'Tick Basemap, Terrain, or both.'
  }
  if (!appStore.isOnline) return 'Downloads need a connection — you are off grid.'
  if (store.status && (!store.status.sources_configured || !store.status.pmtiles_available)) {
    return 'The offline tile source is not available on this server.'
  }
  const estimate = store.draftEstimate
  if (
    estimate &&
    store.status &&
    estimate.totalBytes * OFFLINE_DISK_MARGIN_RATIO > store.status.free_bytes
  ) {
    return 'This exceeds the free disk space available.'
  }
  return null
})

function onToggleDraw(): void {
  if (drawArmed.value) areaMapRef.value?.cancelDraw()
  else areaMapRef.value?.armDraw()
}

function onDrawComplete(bounds: LngLatBounds): void {
  store.setDraftBbox(bounds.west, bounds.south, bounds.east, bounds.north)
}

function onBoundsFieldsUpdate(bounds: LngLatBounds): void {
  store.setDraftBbox(bounds.west, bounds.south, bounds.east, bounds.north)
}

function getCurrentViewBounds(): LngLatBounds | null {
  /* v8 ignore start -- the map renders unconditionally beside the buttons, so
     its ref is always set by the time USE CURRENT VIEW can be clicked; the
     guard only satisfies the template ref's nullable type. */
  if (!areaMapRef.value) return null
  /* v8 ignore stop */
  return areaMapRef.value.currentViewBounds()
}

function onSelectRegion(region: OfflineRegion): void {
  areaMapRef.value?.flyToBounds({
    west: region.west,
    south: region.south,
    east: region.east,
    north: region.north,
  })
}

async function onDownload(): Promise<void> {
  await store.createRegionFromDraft()
}

onMounted(() => {
  // A refresh, not a bootstrap: `App.vue` already fetched status/regions (and
  // started polling anything outstanding) at app start, whether or not
  // Settings was ever opened. Calling these again here just brings the panel
  // up to date with anything that changed while it was closed — it is not
  // what starts or stops polling, which is why there is no matching
  // onUnmounted() to undo it.
  void store.fetchStatus()
  void store.fetchRegions()
})
</script>

<style scoped>
.oma-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.oma-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.oma-label-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.oma-label-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: rgba(var(--ink-rgb), 0.65);
}

.oma-label-input {
  border: none;
  background: var(--surface);
  border-radius: 0;
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  color: inherit;
  box-shadow: inset 0 -1px 0 var(--settings-field-line);
}

.oma-disabled-reason {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--danger);
}

@media (min-width: 768px) {
  .oma-shell {
    flex-direction: row;
    align-items: flex-start;
  }

  .oma-shell > .offline-area-map {
    flex: 1 1 50%;
  }

  .oma-form {
    flex: 1 1 50%;
  }
}
</style>
