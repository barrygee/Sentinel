<template>
  <!-- Fixed icon rail pinned to the right edge: zoom, location, then the MAP
       LAYERS accordion. The vessel FILTER categories live only on the left
       sidebar's FILTER tab (MapSidebar), so the rail does not repeat them.
       Buttons drive the map via handlers passed from SeaView; the shell (rail,
       accordion, collapse, tooltips) lives in IconRail / IconRailAccordion /
       BaseIconButton. -->
  <IconRail
    container-id="sea-side-menu"
    accessible-name="Sea map controls"
    :collapsed="!appStore.sideMenuOpen"
  >
    <BaseIconButton
      class="sm-btn sm-glyph"
      style="--ba-rail-transition: color 0.15s ease"
      tooltip-side="left"
      tooltip="ZOOM IN"
      accessible-name="Zoom in"
      @click="zoomIn"
    >
      +
    </BaseIconButton>
    <BaseIconButton
      class="sm-btn sm-glyph"
      style="--ba-rail-transition: color 0.15s ease"
      tooltip-side="left"
      tooltip="ZOOM OUT"
      accessible-name="Zoom out"
      @click="zoomOut"
    >
      −
    </BaseIconButton>
    <BaseIconButton
      class="sm-btn"
      style="--ba-rail-transition: color 0.15s ease"
      :class="{ active: locationActive }"
      :active="locationActive"
      tooltip-side="left"
      tooltip="GO TO MY LOCATION"
      accessible-name="Go to my location"
      @click="goToLocation"
    >
      <MyLocationIcon />
    </BaseIconButton>

    <!-- LAYERS group: the Sea overlays. Live vessels and place names are always
         on here (vessels are narrowed with the sidebar's FILTER tab), so
         neither has a toggle. -->
    <IconRailAccordion panel-id="sea-layers-panel">
      <template #trigger="{ open: layersAccordionOpen, toggle: toggleLayersAccordion }">
        <BaseIconButton
          id="sea-sm-layers-btn"
          class="sm-btn"
          style="--ba-rail-transition: color 0.15s ease"
          :class="{ active: layersAccordionOpen }"
          :active="layersAccordionOpen"
          tooltip-side="left"
          tooltip="MAP LAYERS"
          accessible-name="Map layers"
          aria-controls="sea-layers-panel"
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
              stroke-width="1.4"
              stroke-linejoin="round"
              fill="none"
            />
            <path d="M3 12 L12 17 L21 12" stroke="currentColor" stroke-width="1.4" fill="none" />
            <path d="M3 16 L12 21 L21 16" stroke="currentColor" stroke-width="1.4" fill="none" />
          </svg>
        </BaseIconButton>
      </template>
      <template #panel>
        <!-- VESSEL LABELS -->
        <BaseIconButton
          class="sm-btn sm-sub-btn"
          style="
            --ba-rail-hover-bg: rgba(255, 255, 255, 0.2);
            --ba-rail-transition: color 0.15s ease;
          "
          :class="{ active: labelsActive }"
          :active="labelsActive"
          tooltip-side="left"
          tooltip="VESSEL LABELS"
          accessible-name="Vessel labels"
          @click="toggleLabels"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect x="4" y="7" width="16" height="10" stroke="currentColor" stroke-width="1.5" />
            <path d="M7 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </BaseIconButton>
        <!-- RANGE RING -->
        <BaseIconButton
          class="sm-btn sm-sub-btn"
          style="
            --ba-rail-hover-bg: rgba(255, 255, 255, 0.2);
            --ba-rail-transition: color 0.15s ease;
          "
          :class="{ active: rangeRingsActive }"
          :active="rangeRingsActive"
          tooltip-side="left"
          tooltip="RANGE RING"
          accessible-name="Range ring"
          @click="toggleRangeRings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.5" />
            <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </BaseIconButton>
        <!-- FERRY ROUTES (dashed, from the base-map tiles) -->
        <BaseIconButton
          class="sm-btn sm-sub-btn"
          style="
            --ba-rail-hover-bg: rgba(255, 255, 255, 0.2);
            --ba-rail-transition: color 0.15s ease;
          "
          :class="{ active: ferryRoutesActive }"
          :active="ferryRoutesActive"
          tooltip-side="left"
          tooltip="FERRY ROUTES"
          accessible-name="Ferry routes"
          @click="toggleFerryRoutes"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="5" cy="18" r="2.2" stroke="currentColor" stroke-width="1.5" />
            <circle cx="19" cy="6" r="2.2" stroke="currentColor" stroke-width="1.5" />
            <path
              d="M7 16 17 8"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-dasharray="2.5 2.5"
            />
          </svg>
        </BaseIconButton>
        <!-- PORTS (known ports with their VHF channels) -->
        <BaseIconButton
          class="sm-btn sm-sub-btn"
          style="
            --ba-rail-hover-bg: rgba(255, 255, 255, 0.2);
            --ba-rail-transition: color 0.15s ease;
          "
          :class="{ active: portsActive }"
          :active="portsActive"
          tooltip-side="left"
          tooltip="PORTS"
          accessible-name="Port markers"
          @click="togglePorts"
        >
          <SeaFamilyGlyph category="ports" />
        </BaseIconButton>
      </template>
    </IconRailAccordion>
  </IconRail>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import MyLocationIcon from '@/components/shared/MyLocationIcon.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import IconRail from '@/components/base/IconRail.vue'
import IconRailAccordion from '@/components/base/IconRailAccordion.vue'
import SeaFamilyGlyph from './SeaFamilyGlyph.vue'

defineProps<{
  zoomIn: () => void
  zoomOut: () => void
  goToLocation: () => void
  toggleLabels: () => void
  toggleRangeRings: () => void
  toggleFerryRoutes: () => void
  togglePorts: () => void
  labelsActive: boolean
  rangeRingsActive: boolean
  ferryRoutesActive: boolean
  portsActive: boolean
  locationActive: boolean
}>()

const appStore = useAppStore()
</script>

<style>
#sea-side-menu .sm-btn.sm-glyph {
  font-size: 18px;
  font-weight: 300;
}
</style>
