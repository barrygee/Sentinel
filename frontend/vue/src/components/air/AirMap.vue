<template>
  <MapLibreMap
    ref="mapRef"
    :style-url="styleUrl"
    :center="airStore.mapCenter ?? [-2, 54]"
    :zoom="airStore.mapZoom ?? 6"
    :pitch="airStore.pitch"
    @map-created="onMapCreated"
    @style-loaded="onStyleLoaded"
  />
</template>

<script setup lang="ts">
// AIR map: creates MapLibre instance and mounts all AIR overlay controls.
// Controls remain plain TypeScript IControl subclasses — they receive Pinia store
// references instead of window.* globals.
import { ref, computed, onBeforeUnmount } from 'vue'
import type { Map } from 'maplibre-gl'
import { useAppStore } from '@/stores/app'
import { useAirStore } from '@/stores/air'
import { useConnectivity } from '@/composables/useConnectivity'
import MapLibreMap from '@/components/shared/MapLibreMap.vue'

const appStore = useAppStore()
const airStore = useAirStore()

const mapRef = ref<InstanceType<typeof MapLibreMap> | null>(null)

const STYLE_ONLINE  = '/assets/fiord-online.json'
const STYLE_OFFLINE = '/assets/fiord.json'

const styleUrl = computed(() => appStore.isOnline ? STYLE_ONLINE : STYLE_OFFLINE)

useConnectivity((online) => {
  const m = mapRef.value?.getMap()
  if (m) m.setStyle(online ? STYLE_ONLINE : STYLE_OFFLINE)
})

function onMapCreated(_map: Map) {
  // Map instance available — controls will be wired in onStyleLoaded
}

function onStyleLoaded(_map: Map) {
  // TODO (Phase 3): instantiate all AIR IControl classes here, passing store refs
  // e.g. adsbControl = new AdsbControl(_map, airStore, notificationsStore, trackingStore)
  //      _map.addControl(adsbControl, 'top-right')
}

onBeforeUnmount(() => {
  const m = mapRef.value?.getMap()
  if (m) {
    const center = m.getCenter()
    airStore.saveMapState([center.lng, center.lat], m.getZoom(), m.getPitch())
  }
})
</script>
