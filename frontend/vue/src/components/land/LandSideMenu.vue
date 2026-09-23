<template>
  <!-- Fixed icon rail pinned to the right edge, mirroring the Air and Space side
       menus — zoom, location, then the MAP LAYERS accordion. The data layers
       (APRS, cameras, repeaters) are chosen as lists from the left sidebar's
       FILTER sub-tabs and switched on/off in Settings › LAND › Map Layers, and
       place names are a Settings switch too, so this rail holds only map
       navigation and annotation.
       Buttons drive the map/controls via handlers passed from LandView; the
       shell (rail, accordion, collapse, tooltips) lives in
       IconRail/IconRailAccordion/BaseIconButton. -->
  <IconRail
    container-id="land-side-menu"
    accessible-name="Land map controls"
    :collapsed="!appStore.sideMenuOpen"
  >
    <BaseIconButton
      class="sm-btn sm-glyph"
      title="Zoom in"
      tooltip-side="left"
      tooltip="Zoom in"
      accessible-name="Zoom in"
      @click="zoomIn"
    >
      +
    </BaseIconButton>
    <BaseIconButton
      class="sm-btn sm-glyph"
      title="Zoom out"
      tooltip-side="left"
      tooltip="Zoom out"
      accessible-name="Zoom out"
      @click="zoomOut"
    >
      −
    </BaseIconButton>
    <BaseIconButton
      class="sm-btn"
      title="Go to my location"
      tooltip-side="left"
      tooltip="Go to my location"
      accessible-name="Go to my location"
      :class="{ active: locationActive }"
      :active="locationActive"
      @click="goToLocation"
    >
      <MyLocationIcon />
    </BaseIconButton>

    <!-- MAP LAYERS group: the map-annotation overlay (range rings) first, then
         terrain, matching the Air rail's panel order. -->
    <IconRailAccordion panel-id="land-layers-panel">
      <template #trigger="{ open: layersAccordionOpen, toggle: toggleLayersAccordion }">
        <BaseIconButton
          id="land-layers-btn"
          class="sm-btn"
          tooltip-side="left"
          tooltip="MAP LAYERS"
          accessible-name="Map layers"
          :class="{ active: layersAccordionOpen }"
          :active="layersAccordionOpen"
          aria-controls="land-layers-panel"
          :aria-expanded="layersAccordionOpen"
          @click="toggleLayersAccordion"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 3 L21 8 L12 13 L3 8 Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
              fill="none"
            />
            <path d="M3 12 L12 17 L21 12" stroke="currentColor" stroke-width="1.6" fill="none" />
            <path d="M3 16 L12 21 L21 16" stroke="currentColor" stroke-width="1.6" fill="none" />
          </svg>
        </BaseIconButton>
      </template>
      <template #panel>
        <BaseIconButton
          class="sm-btn sm-sub-btn"
          style="
            --ba-rail-hover-bg: rgba(var(--rail-ink-rgb), 0.2);
            --ba-rail-transition: color 0.15s ease;
          "
          tooltip-side="left"
          tooltip="RANGE RINGS"
          accessible-name="Range rings"
          :class="{ active: rangeRingsActive }"
          :active="rangeRingsActive"
          @click="toggleRangeRings"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
            <circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.8" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </BaseIconButton>

        <!-- TERRAIN: shaded relief + contour lines from the local elevation
             archive. A shared base-map layer (basemap store), so the choice
             follows the operator to the other maps. Disabled, with the tooltip
             saying why, when the archive is not installed on this server. -->
        <BaseIconButton
          id="land-sm-terrain-btn"
          class="sm-btn sm-sub-btn"
          style="
            --ba-rail-hover-bg: rgba(var(--rail-ink-rgb), 0.2);
            --ba-rail-transition: color 0.15s ease;
          "
          :class="{ active: basemapStore.layers.terrain }"
          :active="basemapStore.layers.terrain"
          :disabled="!basemapStore.terrainAvailable"
          tooltip-side="left"
          :tooltip="basemapStore.terrainAvailable ? 'TERRAIN' : 'TERRAIN — TILES NOT INSTALLED'"
          accessible-name="Terrain relief and contour lines"
          @click="toggleTerrain"
        >
          <TerrainIcon />
        </BaseIconButton>
      </template>
    </IconRailAccordion>
  </IconRail>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useBasemapStore } from '@/stores/basemap'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import IconRail from '@/components/base/IconRail.vue'
import IconRailAccordion from '@/components/base/IconRailAccordion.vue'
import MyLocationIcon from '@/components/shared/MyLocationIcon.vue'
import TerrainIcon from '@/components/shared/TerrainIcon.vue'

defineProps<{
  zoomIn: () => void
  zoomOut: () => void
  goToLocation: () => void
  toggleRangeRings: () => void
  rangeRingsActive: boolean
  locationActive: boolean
}>()

const appStore = useAppStore()
// Terrain is a shared base-map layer, so the active state is read straight
// off the cross-domain store rather than passed in from LandView.
const basemapStore = useBasemapStore()

/** Flip the shared terrain layer; every map watches the store and follows. */
function toggleTerrain(): void {
  basemapStore.setLayer('terrain', !basemapStore.layers.terrain)
}
</script>

<style>
/* Only the glyph-button content delta remains local; the rail shell + button
   chrome come from IconRail + BaseIconButton (see SpaceSideMenu for the same
   pattern). */
#land-side-menu .sm-btn.sm-glyph {
  font-size: 18px;
  font-weight: 300;
}
</style>
