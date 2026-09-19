<template>
  <!-- Fixed icon rail pinned to the right edge, mirroring the left #map-sidebar-rail.
       Every control from the full menu is always visible as an icon; the full label
       is the button's accessible name and its hover tooltip. The shell (container,
       accordion mechanics, collapse/touch behaviour) lives in IconRail/
       IconRailAccordion — this component owns only its buttons' content and the
       map-control/store behaviour behind them. -->
  <IconRail
    container-id="side-menu"
    accessible-name="Air map controls"
    :collapsed="!appStore.sideMenuOpen"
  >
    <!-- Zoom + location -->
    <BaseIconButton
      class="sm-btn sm-glyph"
      style="--ba-rail-transition: color 0.15s ease"
      tooltip-side="left"
      tooltip="ZOOM IN"
      accessible-name="Zoom in"
      @click="getMap()?.zoomIn()"
    >
      +
    </BaseIconButton>
    <BaseIconButton
      class="sm-btn sm-glyph"
      style="--ba-rail-transition: color 0.15s ease"
      tooltip-side="left"
      tooltip="ZOOM OUT"
      accessible-name="Zoom out"
      @click="getMap()?.zoomOut()"
    >
      −
    </BaseIconButton>
    <BaseIconButton
      class="sm-btn"
      style="--ba-rail-transition: color 0.15s ease"
      :class="{ active: locActive }"
      :active="locActive"
      tooltip-side="left"
      tooltip="GO TO MY LOCATION"
      accessible-name="Go to my location"
      @click="goToLocation"
    >
      <MyLocationIcon />
    </BaseIconButton>

    <!-- LAYERS group: a click-to-expand accordion of every map overlay shown
         below the icon — the map-annotation overlays first (range ring, A2A
         refuelling, AWACS), then the data/base-map layers (ground vehicles,
         towers, location names, airports, military bases). -->
    <IconRailAccordion panel-id="layers-panel">
      <template #trigger="{ open: layersAccordionOpen, toggle: toggleLayersAccordion }">
        <BaseIconButton
          id="sm-layers-btn"
          class="sm-btn"
          style="--ba-rail-transition: color 0.15s ease"
          :class="{ active: layersAccordionOpen }"
          :active="layersAccordionOpen"
          tooltip-side="left"
          tooltip="MAP LAYERS"
          accessible-name="Map layers"
          aria-controls="layers-panel"
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
        <!-- RANGE RING -->
        <BaseIconButton
          class="sm-btn sm-sub-btn"
          style="
            --ba-rail-hover-bg: rgba(255, 255, 255, 0.2);
            --ba-rail-transition: color 0.15s ease;
          "
          :class="{ active: airStore.overlayStates.rangeRings }"
          :active="airStore.overlayStates.rangeRings"
          tooltip-side="left"
          tooltip="RANGE RING"
          accessible-name="Range ring"
          @click="mapRef.value?.getRangeRings()?.handleClickPublic()"
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

        <!-- A2A REFUELING -->
        <BaseIconButton
          class="sm-btn sm-sub-btn"
          style="
            --ba-rail-hover-bg: rgba(255, 255, 255, 0.2);
            --ba-rail-transition: color 0.15s ease;
          "
          :class="{ active: airStore.overlayStates.aara }"
          :active="airStore.overlayStates.aara"
          tooltip-side="left"
          tooltip="A2A REFUELING"
          accessible-name="A2A refueling"
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
        </BaseIconButton>

        <!-- AWACS -->
        <BaseIconButton
          class="sm-btn sm-sub-btn"
          style="
            --ba-rail-hover-bg: rgba(255, 255, 255, 0.2);
            --ba-rail-transition: color 0.15s ease;
          "
          :class="{ active: airStore.overlayStates.awacs }"
          :active="airStore.overlayStates.awacs"
          tooltip-side="left"
          tooltip="AWACS"
          accessible-name="AWACS"
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
        </BaseIconButton>
        <!-- TERRAIN: shaded relief + contour lines from the local elevation
             archive. A shared base-map layer (basemap store), so the choice
             follows the operator to the other maps. Disabled, with the tooltip
             saying why, when the archive is not installed on this server. -->
        <BaseIconButton
          id="sm-terrain-btn"
          class="sm-btn sm-sub-btn"
          style="
            --ba-rail-hover-bg: rgba(255, 255, 255, 0.2);
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
import { ref, computed } from 'vue'
import { useAirStore } from '@/stores/air'
import { useAppStore } from '@/stores/app'
import { useBasemapStore } from '@/stores/basemap'
import TerrainIcon from '@/components/shared/TerrainIcon.vue'
import { useUserLocation } from '@/composables/useUserLocation'
import MyLocationIcon from '@/components/shared/MyLocationIcon.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import IconRail from '@/components/base/IconRail.vue'
import IconRailAccordion from '@/components/base/IconRailAccordion.vue'
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
const appStore = useAppStore()
const basemapStore = useBasemapStore()

/** Flip the shared terrain layer; every map watches the store and follows. */
function toggleTerrain(): void {
  basemapStore.setLayer('terrain', !basemapStore.layers.terrain)
}
const { location: userLocation } = useUserLocation()

const cleared = ref(false)
const locActive = computed(() => userLocation.value !== null)

// LAYERS expands a vertical icon accordion on click; the group button is
// highlighted (green) while its panel is open. The open/toggle state lives
// inside IconRailAccordion (see its #trigger scoped-slot binding in the
// template). The aircraft ALL / CIVIL / MILITARY filter is no longer on this
// rail — it is the left sidebar's sub-tabs beneath FILTER (MapSidebar).

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

<style>
/* Shell (fixed container, accordion panel layout, collapse + touch-tooltip
   behaviour) now lives in IconRail/IconRailAccordion — see
   src/components/base/IconRail.vue and IconRailAccordion.vue. Button chrome
   (size, colour, hover/active, focus, tooltip) lives in the BaseIconButton
   atom. Only this rail's own button-content deltas and the out-of-scope 3D
   controls widget remain here. */
#side-menu .sm-btn.sm-glyph {
  font-size: 18px;
  font-weight: 300;
}

/* Sub-items inherit the rail-button look (white icon, green on hover/active,
   left-opening tooltip) via BaseIconButton; the grey panel background (owned by
   IconRailAccordion) is what sets the open sub-menu apart, and each sub-button's
   own --ba-rail-hover-bg override (set inline in the template) gives it the
   stronger hover fill needed to read against that grey. */

/* 3D controls — pinned bottom-right, shifted left to clear the 44px rail. This
   widget sits outside IconRail entirely (see the template comment above) so it
   keeps its own fixed layout and touch-tooltip suppression. */
</style>
