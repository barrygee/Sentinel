<template>
  <!-- The range rings and terrain are the overlays worth flipping mid-task. Vessel
       labels, ferry routes and ports are set in Settings > SEA > Map Layers; live
       vessels and place names are always on at sea, narrowed with the sidebar's
       FILTER tab. Buttons drive the map via handlers passed from SeaView. -->
  <MapSideRail
    container-id="sea-side-menu"
    accessible-name="Sea map controls"
    layers-button-id="sea-sm-layers-btn"
    layers-panel-id="sea-layers-panel"
    :location-active="locationActive"
    @zoom-in="zoomIn"
    @zoom-out="zoomOut"
    @go-to-location="goToLocation"
  >
    <template #layers>
      <MapRailRangeRingsButton :active="rangeRingsActive" @click="toggleRangeRings" />
      <MapRailTerrainButton id="sea-sm-terrain-btn" />
    </template>
  </MapSideRail>
</template>

<script setup lang="ts">
import MapRailRangeRingsButton from '@sentinel/map-kit/controls/map-rail/MapRailRangeRingsButton.vue'
import MapRailTerrainButton from '@sentinel/map-kit/controls/map-rail/MapRailTerrainButton.vue'
import MapSideRail from '@sentinel/map-kit/controls/map-rail/MapSideRail.vue'

defineProps<{
  zoomIn: () => void
  zoomOut: () => void
  goToLocation: () => void
  toggleRangeRings: () => void
  rangeRingsActive: boolean
  locationActive: boolean
}>()
</script>
