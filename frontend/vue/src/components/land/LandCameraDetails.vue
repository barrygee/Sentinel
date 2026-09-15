<template>
  <div class="land-camera-details">
    <!-- The still is the point of the row: full width of the pane, the same
         black letterbox as the map popup, refreshed while the row is open. -->
    <div class="land-camera-details-preview">
      <img
        v-if="camera.properties.imageUrl"
        :src="imageSrc"
        :alt="`${camera.properties.name} — latest camera image`"
        class="land-camera-details-image"
      />
      <div v-else class="land-camera-details-no-image">
        {{ stateLabel(camera.properties.state) }}
      </div>
    </div>
    <BaseDataGrid title="CAMERA" :columns="3">
      <BaseDataCell label="STATE" :value="stateLabel(camera.properties.state)" />
      <BaseDataCell label="SOURCE" :value="camera.properties.sourceName" />
      <BaseDataCell label="UPDATED" :value="updatedLabel" />
    </BaseDataGrid>
    <BaseDataGrid title="LOCATION" :columns="3">
      <BaseDataCell label="LATITUDE" :value="latitude.toFixed(5)" />
      <BaseDataCell label="LONGITUDE" :value="longitude.toFixed(5)" />
      <BaseDataCell label="VIEW" :value="camera.properties.view ?? '—'" />
    </BaseDataGrid>
    <BaseDataGrid v-if="camera.properties.description" title="NOTES" :columns="2">
      <BaseDataCell label="DESCRIPTION" :value="camera.properties.description" wide />
    </BaseDataGrid>
    <div class="land-camera-details-actions">
      <BaseButton variant="ghost" bordered @click.stop="emit('locate', camera.properties.id)">
        SHOW ON MAP
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `LandCameraDetails` — the accordion body for one traffic camera in the Land
 * FILTER pane, the counterpart of `SeaVesselDetails`: the live still first,
 * then the same BaseDataGrid sections the other panes use for position and
 * provenance, then SHOW ON MAP.
 *
 * The image is re-requested (cache-busted) at the feed's own cadence while
 * the row is open, floored so a fast feed cannot be hammered by a row left
 * expanded, and stopped when the row collapses.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
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

const emit = defineEmits<{ locate: [featureId: string] }>()

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
.land-camera-details {
  display: flex;
  flex-direction: column;
  padding-bottom: 12px;
}
.land-camera-details-preview {
  margin: 0 24px 10px;
  background: #000;
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
.land-camera-details-actions {
  display: flex;
  justify-content: flex-end;
  padding: 8px 24px 0;
}
</style>
