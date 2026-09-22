<template>
  <div id="map-wrap" data-domain="sea">
    <h1 class="sr-only">Sea — live vessel tracking</h1>
    <SeaMap ref="seaMapRef" />
    <SeaSideMenu
      :zoom-in="zoomIn"
      :zoom-out="zoomOut"
      :go-to-location="goToLocation"
      :toggle-range-rings="toggleRangeRings"
      :range-rings-active="seaStore.overlayStates.rangeRings"
      :location-active="locationActive"
    />
    <NoUrlOverlay domain="sea" />
    <SeaSourceNotice :feed="seaStore.feed" />
    <!-- msb-pane-search lives in MapSidebar, a sibling of <RouterView> in
         App.vue — see useSidebarPaneTarget for why this waits rather than
         teleporting unconditionally. -->
    <Teleport v-if="searchPaneReady" :to="sidebarPaneSelector('search')">
      <SeaFilter @locate="locateVessel" />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import SeaMap from './SeaMap.vue'
import SeaSideMenu from './SeaSideMenu.vue'
import SeaFilter from './SeaFilter.vue'
import SeaSourceNotice from './SeaSourceNotice.vue'
import NoUrlOverlay from '@/components/shared/NoUrlOverlay.vue'
import { sidebarPaneSelector } from '@/constants/sidebarPanes'
import { useSidebarPaneTarget } from '@/composables/useSidebarPaneTarget'
import { useUserLocation } from '@/composables/useUserLocation'
import { useOffgridAisDecode } from '@/composables/useOffgridAisDecode'
import { useSeaStore } from '@/stores/sea'

/** Zoom level the map flies to when centring on the user's location. */
const LOCATE_ZOOM = 10

const seaStore = useSeaStore()
const seaMapRef = ref<InstanceType<typeof SeaMap> | null>(null)
const { ready: searchPaneReady } = useSidebarPaneTarget('search')
const { location: userLocation } = useUserLocation()
const locationActive = computed(() => userLocation.value !== null)
// Off grid, the vessels come from an SDR rather than AISStream: opening Sea
// tunes the designated radio to the AIS channels and starts decoding. It keeps
// running after this view unmounts — see the composable for why.
useOffgridAisDecode()

function getMap() {
  return seaMapRef.value?.getMap() ?? null
}

// ── side-menu handlers ─────────────────────────────────────────────────────
function zoomIn() {
  getMap()?.zoomIn()
}
function zoomOut() {
  getMap()?.zoomOut()
}
function goToLocation() {
  const map = getMap()
  const location = userLocation.value
  if (!map || !location) return
  map.flyTo({
    center: [location.lon, location.lat],
    zoom: Math.max(map.getZoom(), LOCATE_ZOOM),
    duration: 800,
  })
}
// The overlay is store-driven: the rail writes the store and the map's control
// follows it, so Settings › SEA › Map Layers and the rail can never disagree.
function toggleRangeRings() {
  seaStore.setOverlay('rangeRings', !seaStore.overlayStates.rangeRings)
}

// "Show on map" from the FILTER pane: select the vessel and fly to it.
function locateVessel(mmsi: string) {
  seaMapRef.value?.getVesselsControl()?.selectByMmsi(mmsi, { flyTo: true })
}
</script>
