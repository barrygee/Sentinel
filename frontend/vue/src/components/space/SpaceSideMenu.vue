<template>
  <!-- Fixed icon rail pinned to the right edge, mirroring the left #map-sidebar-rail.
       Every control is always visible as an icon; the full label is the hover tooltip. -->
  <nav id="space-side-menu" aria-label="Space map controls">
    <button
      class="sm-btn sm-glyph"
      title="Zoom in"
      aria-label="Zoom in"
      data-tooltip="Zoom in"
      @click="mapRef.value?.getMap()?.zoomIn()"
    >
      +
    </button>
    <button
      class="sm-btn sm-glyph"
      title="Zoom out"
      aria-label="Zoom out"
      data-tooltip="Zoom out"
      @click="mapRef.value?.getMap()?.zoomOut()"
    >
      −
    </button>
    <button
      class="sm-btn"
      title="Go to my location"
      aria-label="Go to my location"
      data-tooltip="Go to my location"
      :class="{ active: locActive }"
      @click="goToLocation"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7.5" stroke="#c8ff00" stroke-width="1.8" />
        <circle cx="10" cy="10" r="2" fill="white" />
      </svg>
    </button>

    <!-- MAP LAYERS group: a click-to-expand accordion of the satellite overlays
         (ground track, footprint, day/night, place names). -->
    <button
      id="space-layers-btn"
      class="sm-btn"
      :class="{ active: layersAccordionOpen }"
      data-tooltip="MAP LAYERS"
      aria-label="Map layers"
      aria-controls="space-layers-panel"
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
    </button>

    <div v-show="layersAccordionOpen" id="space-layers-panel" class="sm-accordion-panel">
      <button
        class="sm-btn sm-sub-btn"
        data-tooltip="GROUND TRACK"
        aria-label="Ground track"
        :class="{ active: trackActive }"
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
      </button>
      <button
        class="sm-btn sm-sub-btn"
        data-tooltip="FOOTPRINT"
        aria-label="Footprint"
        :class="{ active: footprintActive }"
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
      </button>
      <button
        class="sm-btn sm-sub-btn"
        data-tooltip="DAY / NIGHT"
        aria-label="Day / night"
        :class="{ active: daynightActive }"
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
      </button>
      <button
        class="sm-btn sm-sub-btn"
        data-tooltip="LOCATIONS"
        aria-label="Locations"
        :class="{ active: namesActive }"
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
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSpaceStore } from '@/stores/space'
import { useUserLocation } from '@/composables/useUserLocation'
import { useDisclosure } from '@/composables/useDisclosure'
import type SpaceMap from './SpaceMap.vue'

// markRaw proxy from SpaceView — .current is non-reactive, preventing re-renders during teardown
const props = defineProps<{ mapRef: { current: InstanceType<typeof SpaceMap> | null } }>()

const mapRef = {
  get value() {
    return props.mapRef.current
  },
}

const spaceStore = useSpaceStore()
const { location: userLocation } = useUserLocation()

const locActive = computed(() => userLocation.value !== null)

const trackActive = computed(() => spaceStore.overlayStates.groundTrack)
const footprintActive = computed(() => spaceStore.overlayStates.footprint)
const daynightActive = computed(() => spaceStore.overlayStates.daynight)
const namesActive = computed(() => spaceStore.overlayStates.names)

// The satellite overlays expand from a single MAP LAYERS icon accordion; the
// group button is highlighted (green) while its panel is open.
const { open: layersAccordionOpen, toggle: toggleLayersAccordion } = useDisclosure()

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

<style>
/* Fixed icon rail mirroring #map-sidebar-rail, pinned to the right edge. */
#space-side-menu {
  position: fixed;
  top: var(--nav-height);
  bottom: var(--footer-height);
  right: 0;
  width: 44px;
  background: rgba(10, 13, 20, 0.98);
  z-index: 1003;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  box-sizing: border-box;
}

#space-side-menu .sm-btn {
  height: 40px;
  width: 100%;
  flex-shrink: 0;
  background: none;
  border: none;
  color: #fff;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 0;
  transition: color 0.15s;
}

#space-side-menu .sm-btn.sm-glyph {
  font-size: 18px;
  font-weight: 300;
}

/* Hover matches the left side panel's buttons: a subtle grey background + muted
   icon. Active stays green and wins the icon colour even while hovered. */
#space-side-menu .sm-btn:hover {
  color: var(--color-text-muted);
  background: var(--color-border);
}

#space-side-menu .sm-btn.active {
  color: var(--color-accent);
}

#space-side-menu .sm-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

/* Match the left side panel's icon size (19px), regardless of each SVG's own
   width/height attributes; width auto keeps non-square icons in proportion. */
#space-side-menu .sm-btn svg {
  display: block;
  height: 19px;
  width: auto;
}

/* MAP LAYERS accordion: sub-items stack vertically on a grey panel (the side
   panel's grey), pushing nothing below since it's the last group. */
#space-side-menu .sm-accordion-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: var(--color-border);
}

/* Sub-items sit on the grey panel, so their hover needs a stronger background. */
#space-side-menu .sm-sub-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Hover tooltip — opens to the left of the right-edge rail. */
#space-side-menu .sm-btn[data-tooltip]::before {
  content: attr(data-tooltip);
  position: absolute;
  right: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
  background: #000;
  color: var(--color-text-muted);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  padding: 0 14px;
  height: 28px;
  display: flex;
  align-items: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 10001;
}

#space-side-menu .sm-btn[data-tooltip]:hover::before {
  opacity: 1;
}

/* Touch screens: hover tooltips aren't useful. */
@media (max-width: 768px) {
  #space-side-menu .sm-btn[data-tooltip]::before {
    display: none !important;
  }
}

/* ≤480px: the left rail becomes a full-width bottom bar — lift the right rail
   clear of it so the two don't overlap in the bottom-right corner. */
@media (max-width: 480px) {
  #space-side-menu {
    bottom: calc(var(--footer-height) + 44px);
  }
}
</style>
