<template>
  <!-- The map-annotation overlays first (range rings, A2A refuelling, AWACS), then
       terrain. The aircraft filter is the left sidebar's sub-tabs (MapSidebar). -->
  <MapSideRail
    container-id="side-menu"
    accessible-name="Air map controls"
    layers-button-id="sm-layers-btn"
    layers-panel-id="layers-panel"
    :location-active="locActive"
    @zoom-in="getMap()?.zoomIn()"
    @zoom-out="getMap()?.zoomOut()"
    @go-to-location="goToLocation"
  >
    <template #layers>
      <MapRailRangeRingsButton
        :active="airStore.overlayStates.rangeRings"
        @click="mapRef.value?.getRangeRings()?.handleClickPublic()"
      />
      <MapRailLayerButton
        tooltip="A2A REFUELING"
        accessible-name="A2A refueling"
        :active="airStore.overlayStates.aara"
        @click="mapRef.value?.getAara()?.toggle()"
      >
        <svg
          width="14"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <!-- Fuel droplet — the air-to-air refuelling track. -->
          <path
            d="M12 2 C7 9 5 12 5 15 a7 7 0 1 0 14 0 c0 -3 -2 -6 -7 -13 z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </MapRailLayerButton>
      <MapRailLayerButton
        tooltip="AWACS"
        accessible-name="AWACS"
        :active="airStore.overlayStates.awacs"
        @click="mapRef.value?.getAwacs()?.toggle()"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <!-- Mirrors the AWACS map overlay: a circle with a semi-transparent fill. -->
          <circle
            cx="12"
            cy="12"
            r="8"
            fill="currentColor"
            fill-opacity="0.2"
            stroke="currentColor"
            stroke-width="1.6"
          />
        </svg>
      </MapRailLayerButton>
      <MapRailTerrainButton id="sm-terrain-btn" />
    </template>
  </MapSideRail>
</template>

<script setup lang="ts">
import MapRailLayerButton from '@sentinel/map-kit/controls/map-rail/MapRailLayerButton.vue'
import MapRailRangeRingsButton from '@sentinel/map-kit/controls/map-rail/MapRailRangeRingsButton.vue'
import MapRailTerrainButton from '@sentinel/map-kit/controls/map-rail/MapRailTerrainButton.vue'
import MapSideRail from '@sentinel/map-kit/controls/map-rail/MapSideRail.vue'
import { ref, computed } from 'vue'
import { useAirStore } from './stores/air'
import { useUserLocation } from '@sentinel/map-kit/composables/useUserLocation'
import type AirMap from './AirMap.vue'

// Receives a markRaw proxy so Vue never re-renders this component when the map
// mounts/unmounts — accessing .current is non-reactive by design.
const props = defineProps<{
  mapRef: { current: InstanceType<typeof AirMap> | null }
}>()

// Non-reactive accessor — reads through the proxy at call-time only
const mapRef = {
  get value() {
    return props.mapRef.current
  },
}

const airStore = useAirStore()
const { location: userLocation } = useUserLocation()

const cleared = ref(false)
const locActive = computed(() => userLocation.value !== null)

// ---- Map access helpers ----
function getMap() {
  const m = mapRef.value as { getMap?: () => import('maplibre-gl').Map | null } | null
  return m?.getMap?.() ?? null
}
// ---- Location ----
function goToLocation() {
  const m = getMap()
  const loc = userLocation.value
  if (!m || !loc) return
  m.flyTo({ center: [loc.lon, loc.lat], zoom: Math.max(m.getZoom(), 10), duration: 800 })
}

// ---- Clear overlays ----
// Currently unwired (no template binding); retained for the clear-overlays control.
/* v8 ignore start -- dead code: no template binding and not exposed, so there is
   no path to invoke this from a test. Kept for the clear-overlays control. */
function _toggleClear() {
  const ctrl =
    (mapRef.value?.getClearControl?.() as
      | import('./controls/clear-overlays/ClearOverlaysControl').ClearOverlaysControl
      | null) ?? null
  if (!ctrl) return
  ctrl.toggle()
  cleared.value = ctrl._cleared
}
/* v8 ignore stop */
</script>
