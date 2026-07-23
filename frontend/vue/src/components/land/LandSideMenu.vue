<template>
  <!-- Fixed icon rail pinned to the right edge, mirroring the Air and Space side
       menus. Buttons drive the map/controls via handlers passed from LandView;
       the shell (rail, collapse, tooltips) lives in IconRail/BaseIconButton. -->
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
    <BaseIconButton
      class="sm-btn"
      title="Range rings"
      tooltip-side="left"
      tooltip="Range rings"
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
    <BaseIconButton
      class="sm-btn"
      title="APRS stations"
      tooltip-side="left"
      tooltip="APRS stations"
      accessible-name="APRS stations"
      :class="{ active: aprsActive }"
      :active="aprsActive"
      @click="toggleAprs"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="11" r="1.6" fill="currentColor" stroke="none" />
        <path d="M5.2 8.2a4 4 0 0 1 5.6 0" />
        <path d="M3.4 6.4a6.6 6.6 0 0 1 9.2 0" />
      </svg>
    </BaseIconButton>
  </IconRail>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import IconRail from '@/components/base/IconRail.vue'
import MyLocationIcon from '@/components/shared/MyLocationIcon.vue'

defineProps<{
  zoomIn: () => void
  zoomOut: () => void
  goToLocation: () => void
  toggleRangeRings: () => void
  toggleAprs: () => void
  rangeRingsActive: boolean
  aprsActive: boolean
  locationActive: boolean
}>()

const appStore = useAppStore()
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
