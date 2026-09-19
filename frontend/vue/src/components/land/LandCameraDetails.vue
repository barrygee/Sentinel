<template>
  <div class="land-camera-details">
    <!-- The still is the point of the row: full width of the pane, the same
         black letterbox as the map popup, refreshed while the row is open. -->
    <!-- The still is a button: it opens the camera's live view in a popup on
         the map, flying there first — the same popup a marker click opens. -->
    <button
      v-if="camera.properties.imageUrl"
      type="button"
      class="land-camera-details-preview land-camera-details-preview-btn"
      :title="`Show ${camera.properties.name} on the map`"
      @click.stop="emit('preview', camera.properties.id)"
    >
      <img
        :src="imageSrc"
        :alt="`${camera.properties.name} — latest camera image; opens the live view on the map`"
        class="land-camera-details-image"
      />
    </button>
    <div v-else class="land-camera-details-preview">
      <div class="land-camera-details-no-image">
        {{ stateLabel(camera.properties.state) }}
      </div>
    </div>
    <BaseDataGrid title="CAMERA" :columns="2">
      <BaseDataCell label="STATE" :value="stateLabel(camera.properties.state)" />
      <BaseDataCell label="UPDATED" :value="updatedLabel" />
      <!-- Free text wraps to its full width rather than being cut at a
           column edge: a source name, a view line or a description is
           unreadable ellipsised, so each takes the whole row. -->
      <div class="land-camera-details-prose">
        <BaseDataCell label="SOURCE" :value="camera.properties.sourceName" wide />
      </div>
    </BaseDataGrid>
    <BaseDataGrid title="LOCATION" :columns="2">
      <BaseDataCell label="LATITUDE" :value="latitude.toFixed(5)" />
      <BaseDataCell label="LONGITUDE" :value="longitude.toFixed(5)" />
      <div v-if="camera.properties.view" class="land-camera-details-prose">
        <BaseDataCell label="VIEW" :value="camera.properties.view" wide />
      </div>
    </BaseDataGrid>
    <BaseDataGrid v-if="camera.properties.description" title="NOTES" :columns="2">
      <div class="land-camera-details-prose">
        <BaseDataCell label="DESCRIPTION" :value="camera.properties.description" wide />
      </div>
    </BaseDataGrid>
  </div>
</template>

<script setup lang="ts">
/**
 * `LandCameraDetails` — the accordion body for one traffic camera in the Land
 * FILTER pane, the counterpart of `SeaVesselDetails`: the live still first
 * (a button that opens the camera's popup on the map), then the same
 * BaseDataGrid sections the other panes use for position and provenance.
 *
 * The image is re-requested (cache-busted) at the feed's own cadence while
 * the row is open, floored so a fast feed cannot be hammered by a row left
 * expanded, and stopped when the row collapses.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseDataCell from '@/components/base/BaseDataCell.vue'
import BaseDataGrid from '@/components/base/BaseDataGrid.vue'
import { imageUrl } from '@/services/landFeedsApi'
import type { CameraFeature, CameraFeatureState } from '@/types/landFeeds'

/** Never re-fetch a still more often than this, whatever the feed says. */
const MIN_REFRESH_MS = 15_000

const props = withDefaults(
  defineProps<{
    camera: CameraFeature
    /** The feed's configured interval, in seconds — drives the refresh timer. */
    refreshSeconds?: number
  }>(),
  { refreshSeconds: 60 },
)

const emit = defineEmits<{ preview: [featureId: string] }>()

const cacheBust = ref(Date.now())
let refreshTimer: ReturnType<typeof setInterval> | undefined

const imageSrc = computed(() => {
  const [feedId, ref] = splitFeatureId(props.camera.properties.id, props.camera.properties.sourceId)
  return imageUrl(feedId, ref, cacheBust.value)
})

const longitude = computed(() => props.camera.geometry.coordinates[0])
const latitude = computed(() => props.camera.geometry.coordinates[1])

const updatedLabel = computed(() => {
  const updatedAt = props.camera.properties.updatedAt
  if (!updatedAt) return `every ~${props.refreshSeconds}s`
  const parsed = new Date(updatedAt)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
})

onMounted(() => {
  const intervalMs = Math.max(MIN_REFRESH_MS, props.refreshSeconds * 1000)
  refreshTimer = setInterval(() => {
    cacheBust.value = Date.now()
  }, intervalMs)
})

onBeforeUnmount(() => {
  // Always set in onMounted; clearInterval tolerates undefined regardless.
  clearInterval(refreshTimer)
})

function stateLabel(state: CameraFeatureState): string {
  return state.toUpperCase()
}

/** "feedId:providerRef" → both halves (the ref may itself contain colons). */
function splitFeatureId(featureId: string, feedId: string): [string, string] {
  const separatorIndex = featureId.indexOf(':')
  /* v8 ignore start -- defensive: the backend always joins feedId:providerId */
  if (separatorIndex === -1) return [feedId, featureId]
  /* v8 ignore stop */
  return [featureId.slice(0, separatorIndex), featureId.slice(separatorIndex + 1)]
}
</script>

<style scoped>
/* Wrapping, prose-weight values — the same treatment the APRS row gives its
   packet fields — for the cells that hold a sentence rather than a reading. */
.land-camera-details-prose {
  display: contents;
  --ba-cell-value-white-space: normal;
  --ba-cell-value-word-break: break-word;
  --ba-cell-align: flex-start;
  --ba-cell-value-font-size: 13px;
  --ba-cell-value-font-weight: 400;
  --ba-cell-value-line-height: 1.45;
  --ba-cell-value-letter-spacing: normal;
  --ba-cell-value-color: rgba(255, 255, 255, 0.82);
}
.land-camera-details {
  display: flex;
  flex-direction: column;
  padding-bottom: 12px;
}
.land-camera-details-preview {
  margin: 0 24px 10px;
  background: #000;
}
.land-camera-details-preview-btn {
  display: block;
  width: calc(100% - 48px);
  padding: 0;
  border: none;
  cursor: pointer;
}
.land-camera-details-preview-btn:focus-visible {
  outline: 2px solid #c8ff00;
  outline-offset: 2px;
}
.land-camera-details-image {
  display: block;
  width: 100%;
  height: auto;
}
.land-camera-details-no-image {
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Barlow Condensed', 'Barlow', sans-serif;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
}
</style>
