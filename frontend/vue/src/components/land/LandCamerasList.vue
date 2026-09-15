<template>
  <section class="land-cameras-list" aria-labelledby="land-cameras-list-title">
    <h2 id="land-cameras-list-title" class="land-cameras-list-title">CAMERAS</h2>
    <p v-if="cameras.length === 0" class="land-cameras-list-empty">{{ emptyMessage }}</p>
    <ul v-else class="land-cameras-list-items">
      <li v-for="camera in cameras" :key="camera.properties.id">
        <button type="button" class="land-cameras-list-item" @click="select(camera)">
          <span class="land-cameras-list-item-name">{{ camera.properties.name }}</span>
          <span
            class="land-cameras-list-item-state"
            :class="`land-cameras-list-item-state--${camera.properties.state}`"
          >
            {{ stateLabel(camera.properties.state) }}
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/**
 * `LandCamerasList` — the FILTER pane's CAMERAS section: every traffic camera
 * currently in the map's viewport, mirroring what `TrafficCamerasControl`
 * plots (same bbox, read from the shared `landFeeds` store rather than a
 * MapLibre instance of its own — see that store's `viewportBounds`).
 *
 * Clicking a row dispatches `land-camera-selected`, which
 * `TrafficCamerasControl` listens for to fly the map to that camera and open
 * its popup — the same list↔map parity mechanism `AprsStationsControl` uses
 * in the opposite direction via `aprs-station-selected`.
 */
import { computed } from 'vue'
import { useLandStore } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
import type { CameraFeature, CameraFeatureState } from '@/types/landFeeds'

const landStore = useLandStore()
const landFeedsStore = useLandFeedsStore()

const cameras = computed<CameraFeature[]>(() => {
  if (!landStore.trafficCamerasLayerVisible) return []
  const allFeatures = Object.values(landFeedsStore.featuresByFeed).flatMap(
    (collection) => collection.features,
  )
  const bounds = landFeedsStore.viewportBounds
  if (!bounds) return allFeatures
  return allFeatures.filter((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates
    return (
      longitude >= bounds.west &&
      longitude <= bounds.east &&
      latitude >= bounds.south &&
      latitude <= bounds.north
    )
  })
})

const emptyMessage = computed(() =>
  landStore.trafficCamerasLayerVisible
    ? 'No traffic cameras in view'
    : 'Traffic cameras layer hidden',
)

function stateLabel(state: CameraFeatureState): string {
  return state.toUpperCase()
}

function select(camera: CameraFeature): void {
  document.dispatchEvent(
    new CustomEvent('land-camera-selected', { detail: { featureId: camera.properties.id } }),
  )
}
</script>

<style scoped>
.land-cameras-list {
  padding: 12px 24px 16px;
}
.land-cameras-list-title {
  margin: 0 0 8px;
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
}
.land-cameras-list-empty {
  margin: 0;
  font-family: var(--font-primary);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}
.land-cameras-list-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.land-cameras-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 6px;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-primary);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
  text-align: left;
}
.land-cameras-list-item:hover,
.land-cameras-list-item:focus-visible {
  background: rgba(255, 255, 255, 0.06);
}
.land-cameras-list-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.land-cameras-list-item-state {
  flex-shrink: 0;
  padding: 2px 8px;
  font-family: var(--font-condensed);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.32);
}
.land-cameras-list-item-state--live {
  color: #fff;
  background: var(--color-button-bg);
}
</style>
