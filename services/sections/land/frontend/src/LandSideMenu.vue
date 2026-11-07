<template>
  <!-- The data layers (APRS, repeaters) are chosen as lists from the left sidebar's
       FILTER sub-tabs and switched on/off in Settings › LAND › Map Layers, and place
       names are a Settings switch too, so this rail holds only map navigation and
       annotation. Buttons drive the map via handlers passed from LandView. -->
  <MapSideRail
    container-id="land-side-menu"
    accessible-name="Land map controls"
    layers-button-id="land-layers-btn"
    layers-panel-id="land-layers-panel"
    :location-active="locationActive"
    @zoom-in="zoomIn"
    @zoom-out="zoomOut"
    @go-to-location="goToLocation"
  >
    <template #layers>
      <MapRailRangeRingsButton :active="rangeRingsActive" @click="toggleRangeRings" />
      <MapRailTerrainButton id="land-sm-terrain-btn" />
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
