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

    <button
      class="sm-btn"
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
      class="sm-btn"
      data-tooltip="FOOTPRINT"
      aria-label="Footprint"
      :class="{ active: footprintActive }"
      @click="toggleFootprint"
    >
      <svg
        width="18"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-dasharray="3,2"
          fill="none"
        />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    </button>

    <button
      class="sm-btn"
      data-tooltip="DAY / NIGHT"
      aria-label="Day / night"
      :class="{ active: daynightActive }"
      @click="toggleDaynight"
    >
      <svg
        width="15"
        height="16"
        viewBox="0 0 20 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M15 2C10 2 5 6.5 5 12s5 10 10 10c-6 0-11-4.5-11-10S9 2 15 2z"
          fill="currentColor"
        />
      </svg>
    </button>
    <button
      class="sm-btn"
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
          d="M12 22C12 22 19 14 19 9A7 7 0 1 0 5 9C5 14 12 22 12 22Z"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
          fill="none"
        />
        <circle cx="12" cy="9" r="2.4" stroke="currentColor" stroke-width="1.6" fill="none" />
      </svg>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSpaceStore } from '@/stores/space'
import { useUserLocation } from '@/composables/useUserLocation'
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
