<template>
  <MapRailLayerButton
    :tooltip="basemapStore.terrainAvailable ? 'TERRAIN' : 'TERRAIN — TILES NOT INSTALLED'"
    accessible-name="Terrain contour lines"
    :active="basemapStore.layers.terrain"
    :disabled="!basemapStore.terrainAvailable"
    @click="toggleTerrain"
  >
    <TerrainIcon />
  </MapRailLayerButton>
</template>

<script setup lang="ts">
/**
 * `MapRailTerrainButton` — contour lines from the local elevation archive. A
 * shared base-map layer, so the choice follows the operator to the other maps.
 * Disabled, with the tooltip saying why, when the archive isn't installed.
 */
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import TerrainIcon from '@sentinel/ui/icons/TerrainIcon.vue'
import MapRailLayerButton from '@sentinel/map-kit/controls/map-rail/MapRailLayerButton.vue'

const basemapStore = useBasemapStore()

/** Flip the shared terrain layer; every map watches the store and follows. */
function toggleTerrain(): void {
  basemapStore.setLayer('terrain', !basemapStore.layers.terrain)
}
</script>
