<template>
  <div id="map-wrap" data-domain="land">
    <MapLibreMap
      ref="mapRef"
      :style-url="styleUrl"
      :center="[-2, 54]"
      :zoom="6"
      @map-created="onMapCreated"
      @style-loaded="onStyleLoaded"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Map } from 'maplibre-gl'
import { useAppStore } from '@/stores/app'
import { useConnectivity } from '@/composables/useConnectivity'
import MapLibreMap from '@/components/shared/MapLibreMap.vue'

const appStore = useAppStore()
const mapRef = ref<InstanceType<typeof MapLibreMap> | null>(null)

const styleUrl = computed(() => appStore.isOnline ? '/assets/fiord-online.json' : '/assets/fiord.json')

useConnectivity((online) => {
  mapRef.value?.getMap()?.setStyle(online ? '/assets/fiord-online.json' : '/assets/fiord.json')
})

function onMapCreated(_map: Map) {}
function onStyleLoaded(_map: Map) {}
</script>
