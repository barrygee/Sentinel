<template>
  <MapLibreMap
    ref="mapRef"
    :style-url="styleUrl"
    :center="spaceStore.mapCenter ?? [0, 30]"
    :zoom="spaceStore.mapZoom ?? 2"
    @map-created="onMapCreated"
    @style-loaded="onStyleLoaded"
  />
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import type { Map } from 'maplibre-gl'
import { useAppStore } from '@/stores/app'
import { useSpaceStore } from '@/stores/space'
import { useConnectivity } from '@/composables/useConnectivity'
import MapLibreMap from '@/components/shared/MapLibreMap.vue'

const appStore = useAppStore()
const spaceStore = useSpaceStore()
const mapRef = ref<InstanceType<typeof MapLibreMap> | null>(null)

const STYLE_ONLINE  = '/assets/fiord-online.json'
const STYLE_OFFLINE = '/assets/fiord.json'

const styleUrl = computed(() => appStore.isOnline ? STYLE_ONLINE : STYLE_OFFLINE)

useConnectivity((online) => {
  const m = mapRef.value?.getMap()
  if (m) m.setStyle(online ? STYLE_ONLINE : STYLE_OFFLINE)
})

function onMapCreated(_map: Map) {}

function onStyleLoaded(_map: Map) {
  // TODO (Phase 4): instantiate SPACE IControl classes here
  // e.g. issControl = new IssControl(_map, spaceStore, trackingStore)
}

onBeforeUnmount(() => {
  const m = mapRef.value?.getMap()
  if (m) {
    const center = m.getCenter()
    spaceStore.saveMapState([center.lng, center.lat], m.getZoom())
  }
})
</script>
