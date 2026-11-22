<template>
  <!-- The satellite overlays: ground track, footprint, day/night and place names. -->
  <MapSideRail
    container-id="space-side-menu"
    accessible-name="Space map controls"
    layers-button-id="space-layers-btn"
    layers-panel-id="space-layers-panel"
    :location-active="locActive"
    @zoom-in="mapRef.value?.getMap()?.zoomIn()"
    @zoom-out="mapRef.value?.getMap()?.zoomOut()"
    @go-to-location="goToLocation"
  >
    <template #layers>
      <MapRailLayerButton
        tooltip="GROUND TRACK"
        accessible-name="Ground track"
        :active="trackActive"
        @click="toggleTrack"
      >
        <svg
          width="18"
          height="16"
          viewBox="0 0 24 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M2 14 C6 10, 10 6, 14 6 S20 8 22 4"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="3,2"
            fill="none"
          />
        </svg>
      </MapRailLayerButton>
      <MapRailLayerButton
        tooltip="FOOTPRINT"
        accessible-name="Footprint"
        :active="footprintActive"
        @click="toggleFootprint"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <!-- Satellite beaming a coverage cone down to its ground footprint. -->
          <circle cx="12" cy="3.5" r="2" fill="currentColor" />
          <path
            d="M10.5 5 L5 15.5"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <path
            d="M13.5 5 L19 15.5"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <ellipse
            cx="12"
            cy="17"
            rx="7.5"
            ry="2.8"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-dasharray="3,2"
            fill="none"
          />
        </svg>
      </MapRailLayerButton>
      <MapRailLayerButton
        tooltip="DAY / NIGHT"
        accessible-name="Day / night"
        :active="daynightActive"
        @click="toggleDaynight"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <!-- Half-lit globe — the day/night terminator. -->
          <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8" />
          <path d="M12 2.5 A9.5 9.5 0 0 1 12 21.5 Z" fill="currentColor" />
        </svg>
      </MapRailLayerButton>
      <MapRailLayerButton
        tooltip="LOCATION NAMES"
        accessible-name="Location name labels"
        :active="namesActive"
        @click="toggleNames"
      >
        <svg
          width="15"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 22.5 C12 22.5 20 13.5 20 8.5 A8 8 0 1 0 4 8.5 C4 13.5 12 22.5 12 22.5Z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
            fill="none"
          />
          <circle cx="12" cy="8.5" r="2.6" stroke="currentColor" stroke-width="1.8" fill="none" />
        </svg>
      </MapRailLayerButton>
    </template>
  </MapSideRail>
</template>

<script setup lang="ts">
import MapRailLayerButton from '@sentinel/map-kit/controls/map-rail/MapRailLayerButton.vue'
import MapSideRail from '@sentinel/map-kit/controls/map-rail/MapSideRail.vue'
import { computed } from 'vue'
import { useSpaceStore } from './stores/space'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import { useUserLocation } from '@sentinel/map-kit/composables/useUserLocation'
import type SpaceMap from './SpaceMap.vue'

// markRaw proxy from SpaceView — .current is non-reactive, preventing re-renders during teardown
const props = defineProps<{ mapRef: { current: InstanceType<typeof SpaceMap> | null } }>()

const mapRef = {
  get value() {
    return props.mapRef.current
  },
}

const spaceStore = useSpaceStore()
const basemapStore = useBasemapStore()
const { location: userLocation } = useUserLocation()

const locActive = computed(() => userLocation.value !== null)

const trackActive = computed(() => spaceStore.overlayStates.groundTrack)
const footprintActive = computed(() => spaceStore.overlayStates.footprint)
const daynightActive = computed(() => spaceStore.overlayStates.daynight)
// Place names are a shared base-map layer (see stores/basemap.ts), so this
// mirrors the same flag the Air and Land maps drive.
const namesActive = computed(() => basemapStore.layers.names)

function goToLocation(): void {
  // Trigger location fly — MapSidebar will dispatch an event or the satelliteControl handles it
  document.dispatchEvent(new CustomEvent('space-go-to-location'))
}

function toggleTrack(): void {
  mapRef.value?.getSatelliteControl()?.toggleTrack()
}

function toggleFootprint(): void {
  mapRef.value?.getSatelliteControl()?.toggleFootprint()
}

function toggleDaynight(): void {
  mapRef.value?.getDaynightControl()?.toggleDaynight()
}

function toggleNames(): void {
  mapRef.value?.getNamesControl()?.handleClickPublic()
}
</script>
